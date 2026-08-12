"""
كل عمليات القراءة/الكتابة على الجلسات والنتائج والشات — عن طريق REST API
(PostgREST) بدل اتصال Postgres مباشر (شوفي client.py للسبب).
"""
from datetime import datetime, timezone
from . import client


# ── Sessions ─────────────────────────────────────────────────────

def create_session(firm_id: str, created_by: str, session_type: str,
                    title: str, prompt: str | None = None) -> dict:
    return client.insert("sessions", {
        "firm_id": firm_id, "created_by": created_by, "type": session_type,
        "title": title, "prompt": prompt,
    })


def touch_session(session_id: str, title: str | None = None) -> None:
    patch = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if title is not None:
        patch["title"] = title
    client.update("sessions", {"id": f"eq.{session_id}"}, patch)


def list_sessions(firm_id: str) -> list[dict]:
    return client.select("sessions", {
        "firm_id": f"eq.{firm_id}",
        "order": "pinned.desc,updated_at.desc",
    })


def get_session(session_id: str) -> dict | None:
    return client.select("sessions", {"id": f"eq.{session_id}"}, single=True)


def session_belongs_to_firm(session_id: str, firm_id: str) -> bool:
    row = client.select("sessions", {"id": f"eq.{session_id}", "firm_id": f"eq.{firm_id}"}, single=True)
    return row is not None


def delete_session(session_id: str) -> None:
    client.delete("sessions", {"id": f"eq.{session_id}"})


def set_pinned(session_id: str, pinned: bool) -> None:
    client.update("sessions", {"id": f"eq.{session_id}"}, {"pinned": pinned})


# ── Memo results ─────────────────────────────────────────────────

def save_memo_result(session_id: str, sections: list, case_metadata: dict | None,
                      sources: dict | None, memo_text: str | None) -> None:
    client.insert("memo_results", {
        "session_id": session_id, "sections": sections, "case_metadata": case_metadata,
        "sources": sources, "memo_text": memo_text,
    }, on_conflict="session_id", merge=True)


def get_memo_result(session_id: str) -> dict | None:
    return client.select("memo_results", {"session_id": f"eq.{session_id}"}, single=True)


# ── Contract results ─────────────────────────────────────────────

def save_contract_result(session_id: str, clauses: list, contract_type_ar: str | None) -> None:
    client.insert("contract_results", {
        "session_id": session_id, "clauses": clauses, "contract_type_ar": contract_type_ar,
    }, on_conflict="session_id", merge=True)


def get_contract_result(session_id: str) -> dict | None:
    return client.select("contract_results", {"session_id": f"eq.{session_id}"}, single=True)


# ── Chat history ─────────────────────────────────────────────────

def append_chat_message(session_id: str, role: str, text: str,
                         change_card: dict | None = None) -> dict:
    return client.insert("chat_messages", {
        "session_id": session_id, "role": role, "text": text, "change_card": change_card,
    })


def get_chat_history(session_id: str) -> list[dict]:
    return client.select("chat_messages", {"session_id": f"eq.{session_id}", "order": "created_at"})


# ── Firms / membership ───────────────────────────────────────────

def get_user_firm_ids(user_id: str) -> list[str]:
    rows = client.select("firm_members", {"user_id": f"eq.{user_id}", "select": "firm_id"})
    return [row["firm_id"] for row in rows]


def create_firm_with_owner(name: str, owner_user_id: str) -> dict:
    firm = client.insert("firms", {"name": name})
    client.insert("firm_members", {"firm_id": firm["id"], "user_id": owner_user_id, "role": "owner"})
    return firm


def add_member_to_firm(firm_id: str, user_id: str, role: str = "member") -> None:
    client.insert("firm_members", {"firm_id": firm_id, "user_id": user_id, "role": role},
                  on_conflict="firm_id,user_id", merge=True)