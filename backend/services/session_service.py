from db import repo


def get_session_details(session_id: str) -> dict | None:
    session = repo.get_session(session_id)
    if session is None:
        return None

    result = None
    if session['type'] == 'memo':
        result = repo.get_memo_result(session_id)
    elif session['type'] == 'contract':
        result = repo.get_contract_result(session_id)

    return {
        'session': session,
        'result': result,
        'chat_history': repo.get_chat_history(session_id),
    }


def delete_session(session_id: str) -> None:
    repo.delete_session(session_id)


def set_session_pinned(session_id: str, pinned: bool) -> None:
    repo.set_pinned(session_id, pinned)
