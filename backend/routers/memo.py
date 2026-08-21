import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import CurrentUser, get_current_user, require_job_access, require_session_access
from db import repo
from schemas import ChatEditRequest, GenerateMemoRequest, JobResponse, JobStatusResponse, ResumeResponse, SaveSectionsRequest
from services.memo_service import (
    JobStatus,
    _handle_chat_edit,
    _jobs,
    _jobs_lock,
    _work_queue,
    reconstruct_memo,
    split_memo_into_sections,
)

memo_router = APIRouter()


def _owned_memo_job(job_id: str, user: CurrentUser) -> dict:
    with _jobs_lock:
        job = _jobs.get(job_id)
    return require_job_access(job, user)


@memo_router.post('/api/memo/generate', response_model=JobResponse)
def generate_memo(payload: GenerateMemoRequest, user: CurrentUser = Depends(get_current_user)):
    if not payload.raw_text or not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail='raw_text فاضي')

    db_session_id = None
    try:
        session_row = repo.create_session(
            user.firm_id, user.user_id, 'memo',
            title=payload.raw_text.strip()[:60], prompt=payload.raw_text,
        )
        db_session_id = str(session_row['id'])
    except Exception as error:
        print(f'⚠️ فشل حفظ الجلسة في الداتابيز (هتكمل من غير حفظ دائم): {error}')

    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            'status': JobStatus.QUEUED,
            'progress': 0.0,
            'stage': None,
            'logs': [],
            'last_log': None,
            'input': payload.model_dump(),
            'result': None,
            'error': None,
            'chat_history': [],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'db_session_id': db_session_id,
            'user_id': user.user_id,
            'firm_id': user.firm_id,
        }
    _work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED, db_session_id=db_session_id)


@memo_router.get('/api/memo/{job_id}', response_model=JobStatusResponse)
def get_memo(job_id: str, user: CurrentUser = Depends(get_current_user)):
    job = _owned_memo_job(job_id, user)
    return JobStatusResponse(
        job_id=job_id,
        status=job['status'],
        progress=job['progress'],
        stage=job.get('stage'),
        result=job.get('result'),
        error=job.get('error'),
    )


@memo_router.get('/api/memo/{job_id}/logs')
def get_memo_logs(job_id: str, user: CurrentUser = Depends(get_current_user)):
    job = _owned_memo_job(job_id, user)
    return {'job_id': job_id, 'logs': job['logs']}


@memo_router.post('/api/memo/{job_id}/save')
def save_memo(job_id: str, payload: SaveSectionsRequest, user: CurrentUser = Depends(get_current_user)):
    job = _owned_memo_job(job_id, user)
    with _jobs_lock:
        if job['status'] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail='المذكرة لسه مش جاهزة')

        result = job['result']
        result['sections'] = payload.sections
        result['memo'] = reconstruct_memo(result['header'], payload.sections)
        return {'success': True}


@memo_router.post('/api/memo/chat')
def chat_edit(payload: ChatEditRequest, user: CurrentUser = Depends(get_current_user)):
    job = _owned_memo_job(payload.job_id, user)
    with _jobs_lock:
        if job['status'] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail='المذكرة لسه مش جاهزة')

    try:
        response = _handle_chat_edit(job, payload.message)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f'فشل التعديل: {error}')

    response.setdefault('switch_task', None)

    with _jobs_lock:
        job['chat_history'].append({'role': 'user', 'message': payload.message})
        job['chat_history'].append({'role': 'assistant', 'message': response['reply']})

    db_session_id = job.get('db_session_id')
    if db_session_id:
        try:
            repo.append_chat_message(db_session_id, 'user', payload.message)
            repo.append_chat_message(
                db_session_id, 'assistant', response['reply'],
                change_card=response.get('change_card'),
            )
            if response.get('updated_sections') is not None:
                result = job['result']
                repo.save_memo_result(
                    db_session_id, result['sections'], result['case_metadata'],
                    result.get('sources', {}), result['memo'],
                )
            repo.touch_session(db_session_id)
        except Exception as error:
            print(f'⚠️ فشل حفظ رسائل الشات في الداتابيز: {error}')

    return response


@memo_router.post('/api/memo/{session_id}/resume', response_model=ResumeResponse)
def resume_memo(session_id: str, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    session = repo.get_session(session_id)
    if session is None or session.get('type') != 'memo':
        raise HTTPException(status_code=404, detail='جلسة مذكرة مش موجودة')

    memo_result = repo.get_memo_result(session_id)
    if memo_result is None:
        raise HTTPException(status_code=409, detail='مفيش نتيجة محفوظة للمذكرة دي لسه')

    memo_text = memo_result.get('memo_text') or ''
    header, split_sections = split_memo_into_sections(memo_text)
    sections = memo_result.get('sections') or split_sections
    case_metadata = memo_result.get('case_metadata') or {}
    case_facts_lite = '\n'.join(
        f'{label}: {case_metadata.get(key) or "[غير محدد]"}'
        for label, key in (
            ('اسم المتهم', 'defendant_name'),
            ('نوع الجريمة', 'charge'),
            ('رقم القضية', 'case_number'),
            ('المحكمة', 'court'),
        )
    )

    db_chat_history = repo.get_chat_history(session_id)
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            'status': JobStatus.COMPLETED,
            'progress': 1.0,
            'stage': None,
            'logs': [],
            'last_log': None,
            'input': {'raw_text': session.get('prompt') or ''},
            'result': {
                'memo': memo_text,
                'header': header,
                'sections': sections,
                'case_metadata': case_metadata,
                'crime_type': case_metadata.get('crime_type'),
                'legal_nature': case_metadata.get('legal_nature'),
                'correction_rounds': None,
                'validation': None,
                'case_facts': case_facts_lite,
                'sources': memo_result.get('sources') or {},
            },
            'error': None,
            'chat_history': [
                {'role': message['role'], 'message': message['text']}
                for message in db_chat_history
            ],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'db_session_id': session_id,
        }

    return ResumeResponse(
        job_id=job_id,
        status=JobStatus.COMPLETED,
        db_session_id=session_id,
        chat_history=db_chat_history,
    )
