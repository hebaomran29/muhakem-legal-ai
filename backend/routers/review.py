from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth import CurrentUser, get_current_user, require_session_access
from db import repo
from services import review_service

review_router = APIRouter(prefix="/api/review", tags=["review"])

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}


def _job_for_user(job_id: str, user: CurrentUser) -> dict[str, Any]:
    job = review_service.get_job(job_id)
    if not job or not review_service.job_belongs_to_user(job, user.user_id, user.firm_id):
        raise HTTPException(status_code=404, detail="مهمة المراجعة غير موجودة")
    return job


def _persist_review(job_id: str, source_text: str, method: str, result: dict[str, Any]) -> None:
    job = review_service.get_job(job_id)
    if not job:
        return
    repo.save_review_result(
        job["session_id"],
        job["filename"],
        job["content_type"],
        method,
        source_text,
        result,
    )
    repo.touch_session(job["session_id"], title=f"مراجعة: {job['filename']}")


@review_router.post("/upload")
async def upload_review_file(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    filename = Path(file.filename or "document").name
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="نوع الملف غير مدعوم")

    session = repo.create_session(
        user.firm_id,
        user.user_id,
        "review",
        f"مراجعة: {filename}",
        filename,
    )
    session_id = session.get("id")
    if not session_id:
        raise HTTPException(status_code=503, detail="تعذر إنشاء جلسة المراجعة")

    temp_file = tempfile.NamedTemporaryFile(prefix="muhakem-review-", suffix=suffix, delete=False)
    total = 0
    try:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > review_service.MAX_REVIEW_BYTES:
                raise HTTPException(status_code=413, detail="حجم الملف أكبر من الحد المسموح")
            temp_file.write(chunk)
    finally:
        temp_file.close()
        await file.close()

    job_id = review_service.create_job(
        file_path=temp_file.name,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
        session_id=session_id,
        user_id=user.user_id,
        firm_id=user.firm_id,
        on_completed=_persist_review,
    )
    return {"job_id": job_id, "session_id": session_id, "status": "queued"}


@review_router.get("/{job_id}")
def get_review_job(job_id: str, user: CurrentUser = Depends(get_current_user)):
    job = _job_for_user(job_id, user)
    return {
        "job_id": job["job_id"],
        "session_id": job["session_id"],
        "filename": job["filename"],
        "status": job["status"],
        "progress": job["progress"],
        "stage": job["stage"],
        "extraction_method": job.get("extraction_method"),
        "source_text": job.get("source_text") if job.get("status") == "completed" else None,
        "result": job.get("result"),
        "error": job.get("error"),
        "persistence_error": job.get("persistence_error"),
    }


@review_router.get("/session/{session_id}")
def get_review_session(session_id: str, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    result = repo.get_review_result(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="نتيجة المراجعة غير موجودة")
    return result
