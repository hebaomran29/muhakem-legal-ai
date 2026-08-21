from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from auth import CurrentUser, get_current_user
from main import app
from services import review_service


class ReviewUnitTests(unittest.TestCase):
    def test_text_extraction_is_real_and_normalized(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", encoding="utf-8", delete=False) as handle:
            handle.write("البند الأول\n\n\nالتزام الطرف الأول")
            path = handle.name
        self.addCleanup(lambda: os.path.exists(path) and os.unlink(path))
        text, method = review_service.extract_document_text(path, "contract.txt", "text/plain")
        self.assertEqual(method, "text")
        self.assertEqual(text, "البند الأول\n\nالتزام الطرف الأول")

    def test_result_validation_rejects_unknown_risk_values(self):
        result = review_service._validate_result({
            "overall_risk": "made-up",
            "overall_score": 120,
            "clauses": [{"status": "made-up", "risk_score": -4, "title": "بند"}],
        })
        self.assertEqual(result["overall_risk"], "review")
        self.assertEqual(result["overall_score"], 100)
        self.assertEqual(result["clauses"][0]["status"], "review")
        self.assertEqual(result["clauses"][0]["risk_score"], 0)

    def test_ocr_failure_is_explicit_when_gemini_key_is_missing(self):
        with patch.object(review_service, "GEMINI_KEY", None):
            with self.assertRaisesRegex(RuntimeError, "GEMINI_KEY"):
                review_service._gemini_ocr_file("/tmp/missing.png", "contract.png", "image/png")

    def test_gemini_ocr_uses_content_cache(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            path = handle.name
            handle.write(b"image-bytes")
        self.addCleanup(lambda: os.path.exists(path) and os.unlink(path))
        with tempfile.TemporaryDirectory() as cache_dir:
            with patch.object(review_service, "GEMINI_KEY", "test-key"), \
                 patch.object(review_service, "OCR_CACHE_DIR", __import__("pathlib").Path(cache_dir)):
                cache_name = __import__("hashlib").sha256(
                    b"image-bytes" + review_service.GEMINI_OCR_MODEL.encode("utf-8")
                ).hexdigest() + ".txt"
                __import__("pathlib").Path(cache_dir, cache_name).write_text("نص من Gemini", encoding="utf-8")
                text, method = review_service._gemini_ocr_file(path, "contract.png", "image/png")
        self.assertEqual(text, "نص من Gemini")
        self.assertEqual(method, "gemini-ocr-cache")


class ReviewEndpointTests(unittest.TestCase):
    user = CurrentUser("user-a", "a@example.test", ["firm-a"])

    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_upload_creates_session_and_job(self):
        created_job = {}

        def fake_create_job(**kwargs):
            created_job.update(kwargs)
            return "review-job-a"

        with patch("routers.review.repo.create_session", return_value={"id": "session-a"}), \
             patch("routers.review.review_service.create_job", side_effect=fake_create_job):
            response = self.client.post(
                "/api/review/upload",
                files={"file": ("contract.txt", "نص العقد".encode("utf-8"), "text/plain")},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job_id"], "review-job-a")
        self.assertEqual(created_job["session_id"], "session-a")
        self.assertEqual(created_job["filename"], "contract.txt")
        self.assertTrue(os.path.exists(created_job["file_path"]))
        os.unlink(created_job["file_path"])

    def test_job_status_hides_unknown_job(self):
        response = self.client.get("/api/review/unknown")
        self.assertEqual(response.status_code, 404)

    def test_completed_job_does_not_become_failed_when_persistence_fails(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", encoding="utf-8", delete=False) as handle:
            handle.write("نص العقد")
            path = handle.name
        self.addCleanup(lambda: os.path.exists(path) and os.unlink(path))
        with patch.object(review_service, "analyze_contract", return_value={
            "title": "مراجعة", "summary": "", "overall_risk": "review", "overall_score": 50,
            "clauses": [], "recommendations": [], "disclaimer": "x",
        }):
            job_id = review_service.create_job(
                file_path=path,
                filename="contract.txt",
                content_type="text/plain",
                session_id="session-a",
                user_id="user-a",
                firm_id="firm-a",
                on_completed=lambda *_args: (_ for _ in ()).throw(RuntimeError("db down")),
            )
            # The worker is asynchronous; wait briefly for the deterministic unit path.
            import time
            deadline = time.time() + 3
            job = review_service.get_job(job_id)
            while job and job["status"] not in {"completed", "failed"} and time.time() < deadline:
                time.sleep(0.02)
                job = review_service.get_job(job_id)
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job.get("persistence_error"), "db down")
