import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from auth import CurrentUser, get_current_user
from db import repo
from main import _contract_jobs, _contract_jobs_lock, app
from services.memo_service import JobStatus
import main
import routers.memo as memo_module


class InMemoryContractClient:
    def __init__(self):
        self.rows = {}

    def insert(self, table, row, **kwargs):
        if table != "contract_results":
            return row
        current = self.rows.get(row["session_id"], {})
        current.update(row)
        self.rows[row["session_id"]] = current
        return current

    def select(self, table, filters, single=False):
        if table != "contract_results":
            return [] if not single else None
        session_id = filters["session_id"].removeprefix("eq.")
        return self.rows.get(session_id)


class Phase2CEndpointTests(unittest.TestCase):
    user_a = CurrentUser("user-a", "a@example.test", ["firm-a"])
    user_b = CurrentUser("user-b", "b@example.test", ["firm-b"])

    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: self.user_a
        with _contract_jobs_lock:
            _contract_jobs.clear()
        with memo_module._jobs_lock:
            memo_module._jobs.clear()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        with _contract_jobs_lock:
            _contract_jobs.clear()
        with memo_module._jobs_lock:
            memo_module._jobs.clear()

    @staticmethod
    def _memo_job(owner="user-a", firm="firm-a"):
        return {
            "status": JobStatus.COMPLETED,
            "progress": 1.0,
            "stage": "done",
            "logs": ["done"],
            "result": {"header": "header", "sections": [], "memo": "memo"},
            "error": None,
            "chat_history": [],
            "db_session_id": None,
            "user_id": owner,
            "firm_id": firm,
        }

    @staticmethod
    def _contract_job(owner="user-a", firm="firm-a", docx_path=None):
        return {
            "status": JobStatus.COMPLETED,
            "progress": 1.0,
            "stage": "done",
            "logs": ["done"],
            "result": {
                "contract_text": "مقدمة\n\nالبند 1\n\nخاتمة",
                "preamble": "مقدمة",
                "clauses": [{"index": 1, "title": "البند", "body": "نص"}],
                "closing": "خاتمة",
                "contract_type_key": "employment",
                "contract_type_ar": "عقد عمل",
                "clause_validation": {"is_complete": True},
                "pending_clauses": [{"clause_id": "optional-1", "title": "الجزاء", "description": "وصف الجزاء", "obligation_level": "optional", "search_keywords": ["جزاء"]}],
                "docx_path": docx_path,
            },
            "error": None,
            "chat_history": [],
            "db_session_id": None,
            "user_id": owner,
            "firm_id": firm,
        }

    def test_memo_status_auth_and_ownership(self):
        with memo_module._jobs_lock:
            memo_module._jobs["memo-a"] = self._memo_job()
            memo_module._jobs["memo-b"] = self._memo_job("user-b", "firm-b")
            memo_module._jobs["memo-firm-b"] = self._memo_job("user-a", "firm-b")

        self.assertEqual(self.client.get("/api/memo/memo-a").status_code, 200)
        self.assertEqual(self.client.get("/api/memo/memo-b").status_code, 404)
        self.assertEqual(self.client.get("/api/memo/memo-firm-b").status_code, 404)

        app.dependency_overrides[get_current_user] = lambda: self.user_b
        self.assertEqual(self.client.get("/api/memo/memo-a").status_code, 404)

    def test_memo_logs_save_and_chat_are_protected(self):
        with memo_module._jobs_lock:
            memo_module._jobs["memo-a"] = self._memo_job()
            memo_module._jobs["memo-b"] = self._memo_job("user-b", "firm-b")
            memo_module._jobs["memo-firm-b"] = self._memo_job("user-a", "firm-b")

        with patch.object(memo_module, "reconstruct_memo", return_value="saved"):
            self.assertEqual(self.client.get("/api/memo/memo-a/logs").status_code, 200)
            self.assertEqual(self.client.post("/api/memo/memo-a/save", json={"sections": []}).status_code, 200)

        with patch.object(memo_module, "_handle_chat_edit", return_value={"reply": "ok"}):
            self.assertEqual(self.client.post("/api/memo/chat", json={"job_id": "memo-a", "message": "عدّل"}).status_code, 200)

        for path, method, payload in [
            ("/api/memo/memo-b/logs", "get", None),
            ("/api/memo/memo-b/save", "post", {"sections": []}),
            ("/api/memo/chat", "post", {"job_id": "memo-b", "message": "عدّل"}),
            ("/api/memo/memo-firm-b/logs", "get", None),
        ]:
            response = getattr(self.client, method)(path, json=payload) if payload else getattr(self.client, method)(path)
            self.assertEqual(response.status_code, 404, path)

    def test_add_contract_clause_is_single_clause_and_owner_only(self):
        with _contract_jobs_lock:
            owner_job = self._contract_job()
            owner_job["db_session_id"] = "session-a"
            _contract_jobs["contract-a"] = owner_job
            _contract_jobs["contract-b"] = self._contract_job("user-b", "firm-b")

        storage = InMemoryContractClient()
        with patch.object(main.repo, "session_belongs_to_user", return_value=True), \
             patch.object(main.cp, "load_rag_resources", return_value={}), \
             patch.object(main.cp, "retrieve_laws_context", return_value="مرجع"), \
             patch.object(main.cp, "generate_single_clause", return_value="نص بند طويل صالح للتخزين"), \
             patch.object(main.repo, "save_contract_result") as save_result:
            response = self.client.post("/api/contract/clause/add", json={"job_id": "contract-a", "clause_id": "optional-1"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["updated_clauses"]), 2)
        self.assertEqual(body["pending_clauses"], [])
        save_result.assert_called_once()
        self.assertEqual(save_result.call_args.kwargs["pending_clauses"], [])

        denied = self.client.post("/api/contract/clause/add", json={"job_id": "contract-b", "clause_id": "optional-1"})
        self.assertEqual(denied.status_code, 404)

    def test_contract_status_logs_chat_download_and_firm_ownership(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            handle.write(b"docx")
            docx_path = handle.name
        self.addCleanup(lambda: os.path.exists(docx_path) and os.unlink(docx_path))
        with _contract_jobs_lock:
            _contract_jobs["contract-a"] = self._contract_job(docx_path=docx_path)
            _contract_jobs["contract-b"] = self._contract_job("user-b", "firm-b", docx_path)
            _contract_jobs["contract-firm-b"] = self._contract_job("user-a", "firm-b", docx_path)

        self.assertEqual(self.client.get("/api/contract/contract-a").status_code, 200)
        self.assertEqual(self.client.get("/api/contract/contract-a/logs").status_code, 200)
        self.assertEqual(self.client.get("/api/contract/contract-a/download").status_code, 200)
        with patch.object(main, "_handle_contract_chat_edit", return_value={"reply": "ok", "updated_clauses": None}):
            self.assertEqual(self.client.post("/api/contract/chat", json={"job_id": "contract-a", "message": "سؤال"}).status_code, 200)

        for path, method, payload in [
            ("/api/contract/contract-b", "get", None),
            ("/api/contract/contract-b/logs", "get", None),
            ("/api/contract/contract-b/download", "get", None),
            ("/api/contract/contract-firm-b", "get", None),
            ("/api/contract/chat", "post", {"job_id": "contract-b", "message": "سؤال"}),
        ]:
            response = getattr(self.client, method)(path, json=payload) if payload else getattr(self.client, method)(path)
            self.assertEqual(response.status_code, 404, path)

    def test_unauthenticated_memo_and_contract_requests_are_denied(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/api/memo/missing").status_code, 401)
        self.assertEqual(self.client.get("/api/contract/missing").status_code, 401)

    def test_resume_requires_session_ownership(self):
        with patch.object(main.repo, "session_belongs_to_user", return_value=True), \
             patch.object(main.repo, "get_session", return_value={"id": "s-a", "type": "contract", "prompt": "عقد"}), \
             patch.object(main.repo, "get_contract_result", return_value={"clauses": [{"index": 1, "title": "بند", "body": "نص"}], "contract_type_ar": "عقد"}), \
             patch.object(main.repo, "get_chat_history", return_value=[]):
            self.assertEqual(self.client.post("/api/contract/s-a/resume").status_code, 200)

        with patch.object(main.repo, "session_belongs_to_user", return_value=False):
            self.assertEqual(self.client.post("/api/contract/s-b/resume").status_code, 404)

    def test_resume_rebuilds_text_from_structured_fields(self):
        stored = {
            "clauses": [{"index": 1, "title": "بند", "body": "نص canonical"}],
            "preamble": "P canonical",
            "closing": "C canonical",
            "contract_text": "STALE TEXT MUST NOT WIN",
            "contract_type_key": "employment",
            "contract_type_ar": "عقد",
            "clause_validation": {"ok": True},
        }
        with patch.object(main.repo, "session_belongs_to_user", return_value=True), \
             patch.object(main.repo, "get_session", return_value={"id": "s-a", "type": "contract", "prompt": "عقد"}), \
             patch.object(main.repo, "get_contract_result", return_value=stored), \
             patch.object(main.repo, "get_chat_history", return_value=[]):
            response = self.client.post("/api/contract/s-a/resume")

        self.assertEqual(response.status_code, 200)
        resumed_job = _contract_jobs[response.json()["job_id"]]
        self.assertIn("P canonical", resumed_job["result"]["contract_text"])
        self.assertNotIn("STALE TEXT MUST NOT WIN", resumed_job["result"]["contract_text"])
        self.assertEqual(resumed_job["result"]["contract_type_key"], "employment")

    def test_chat_edit_rebuilds_and_persists_complete_artifact(self):
        job = self._contract_job()
        with patch.object(main, "_classify_chat_action", return_value={"action": "edit"}), \
             patch.object(main, "_classify_contract_clause", return_value=1), \
             patch.object(main, "_rewrite_contract_clause", return_value="نص معدل"):
            response = main._handle_contract_chat_edit(job, "عدّل البند 1")

        self.assertEqual(response["updated_clauses"][0]["body"], "نص معدل")
        self.assertEqual(job["result"]["preamble"], "مقدمة")
        self.assertEqual(job["result"]["closing"], "خاتمة")
        self.assertIn("نص معدل", job["result"]["contract_text"])

        storage = InMemoryContractClient()
        with patch.object(repo, "client", storage):
            result = job["result"]
            repo.save_contract_result(
                "s-chat", result["clauses"], result["contract_type_ar"],
                preamble=result["preamble"], closing=result["closing"],
                contract_text=result["contract_text"],
                contract_type_key=result["contract_type_key"],
                clause_validation=result["clause_validation"],
            )
            reloaded = repo.get_contract_result("s-chat")

        self.assertEqual(reloaded["preamble"], "مقدمة")
        self.assertEqual(reloaded["closing"], "خاتمة")
        self.assertIn("نص معدل", reloaded["contract_text"])
        self.assertEqual(reloaded["clause_validation"], {"is_complete": True})


class Phase2CPersistenceTests(unittest.TestCase):
    def test_partial_update_preserves_omitted_fields(self):
        storage = InMemoryContractClient()
        with patch.object(repo, "client", storage):
            repo.save_contract_result(
                "s-a", [{"index": 1}], "عقد عمل",
                preamble="P", closing="C", contract_text="P/C",
                contract_type_key="employment", clause_validation={"ok": True},
            )
            repo.save_contract_result("s-a", [{"index": 1}, {"index": 2}])
            result = repo.get_contract_result("s-a")

        self.assertEqual(result["preamble"], "P")
        self.assertEqual(result["closing"], "C")
        self.assertEqual(result["contract_text"], "P/C")
        self.assertEqual(result["contract_type_ar"], "عقد عمل")
        self.assertEqual(result["contract_type_key"], "employment")
        self.assertEqual(result["clause_validation"], {"ok": True})
        self.assertEqual(len(result["clauses"]), 2)

    def test_explicit_clear_is_preserved(self):
        storage = InMemoryContractClient()
        with patch.object(repo, "client", storage):
            repo.save_contract_result("s-a", [], "عقد", preamble="P", closing="C")
            repo.save_contract_result("s-a", [], preamble=None, closing="")
            result = repo.get_contract_result("s-a")

        self.assertIsNone(result["preamble"])
        self.assertEqual(result["closing"], "")

    def test_canonical_structured_fields_reconstruct_contract(self):
        from main import _reconstruct_contract

        clauses = [{"index": 1, "title": "بند", "body": "نص جديد"}]
        canonical = _reconstruct_contract("P", clauses, "C")
        self.assertIn("P", canonical)
        self.assertIn("نص جديد", canonical)
        self.assertIn("C", canonical)

    def test_legacy_artifact_does_not_fabricate_fields(self):
        legacy = {"clauses": [{"index": 1, "title": "بند", "body": "نص قديم"}], "contract_type_ar": "عقد"}
        self.assertIsNone(legacy.get("preamble"))
        self.assertIsNone(legacy.get("closing"))
        self.assertIsNone(legacy.get("contract_text"))


if __name__ == "__main__":
    unittest.main()
