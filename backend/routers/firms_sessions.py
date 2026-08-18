from fastapi import APIRouter, Depends, HTTPException

from auth import CurrentUser, get_current_user, try_get_current_user, require_session_access
from db import repo
from db import client as db_client
from schemas import CreateFirmRequest, InviteMemberRequest, MeResponse, PinSessionRequest
from services.session_service import delete_session, get_session_details, set_session_pinned

firms_sessions_router = APIRouter()


@firms_sessions_router.post('/api/firms')
def create_firm(payload: CreateFirmRequest, user: CurrentUser = Depends(get_current_user)):
    """إنشاء مكتب شخصي للمستخدمة التي لا تنتمي إلى مكتب."""
    if user.firm_ids:
        raise HTTPException(status_code=409, detail='المستخدم عضو في مكتب بالفعل')
    fresh_firm_ids = repo.get_user_firm_ids(user.user_id)
    if fresh_firm_ids:
        raise HTTPException(status_code=409, detail='المستخدم عضو في مكتب بالفعل')
    return repo.create_firm_with_owner(payload.name.strip() or 'مكتبي', user.user_id)


@firms_sessions_router.post('/api/firms/invite')
def invite_member(payload: InviteMemberRequest, user: CurrentUser = Depends(get_current_user)):
    """دعوة مستخدمة مسجلة إلى المكتب الحالي."""
    found_user = db_client.auth_admin_get_user_by_email(payload.email.strip().lower())
    if not found_user:
        raise HTTPException(status_code=404, detail='مفيش حساب مسجّل بالإيميل ده')
    repo.add_member_to_firm(user.firm_id, found_user['id'])
    return {'success': True}


@firms_sessions_router.get('/api/me', response_model=MeResponse)
def get_me(user: 'CurrentUser | None' = Depends(try_get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail='مفيش توكن مصادقة — سجّلي دخول')
    return MeResponse(user_id=user.user_id, email=user.email, firm_ids=user.firm_ids)


@firms_sessions_router.get('/api/sessions')
def list_sessions_endpoint(user: CurrentUser = Depends(get_current_user)):
    return {'sessions': repo.list_sessions(user.firm_id, user.user_id)}


@firms_sessions_router.get('/api/sessions/{session_id}')
def get_session_endpoint(session_id: str, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    details = get_session_details(session_id)
    if details is None:
        raise HTTPException(status_code=404, detail='الجلسة دي مش موجودة')

    return details


@firms_sessions_router.delete('/api/sessions/{session_id}')
def delete_session_endpoint(session_id: str, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    delete_session(session_id)
    return {'success': True}


@firms_sessions_router.post('/api/sessions/{session_id}/pin')
def pin_session_endpoint(session_id: str, payload: PinSessionRequest, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    set_session_pinned(session_id, payload.pinned)
    return {'success': True}
