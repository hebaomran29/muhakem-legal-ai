"""
كل عمليات القراءة/الكتابة على الجلسات والنتائج والشات. الدوال هنا بتفترض
إنك اتأكدتي بالفعل (في auth.py) إن المستخدم عضو في الـ firm_id المُمرَّر —
مفيش تحقق صلاحيات هنا، ده مقصود، عشان الطبقة دي تفضل بسيطة.
"""
import json
from .client import get_cursor


# ── Sessions ─────────────────────────────────────────────────────

def create_session(firm_id: str, created_by: str, session_type: str,
                    title: str, prompt: str | None = None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """insert into sessions (firm_id, created_by, type, title, prompt)
               values (%s, %s, %s, %s, %s) returning *""",
            (firm_id, created_by, session_type, title, prompt),
        )
        return cur.fetchone()


def touch_session(session_id: str, title: str | None = None) -> None:
    """تحديث updated_at (وكمان العنوان لو اتغيّر) — بتستخدم كل ما جلسة تتحدّث."""
    with get_cursor() as cur:
        if title is not None:
            cur.execute(
                "update sessions set updated_at = now(), title = %s where id = %s",
                (title, session_id),
            )
        else:
            cur.execute("update sessions set updated_at = now() where id = %s", (session_id,))


def list_sessions(firm_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """select * from sessions where firm_id = %s
               order by pinned desc, updated_at desc""",
            (firm_id,),
        )
        return cur.fetchall()


def get_session(session_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute("select * from sessions where id = %s", (session_id,))
        return cur.fetchone()


def session_belongs_to_firm(session_id: str, firm_id: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "select 1 from sessions where id = %s and firm_id = %s",
            (session_id, firm_id),
        )
        return cur.fetchone() is not None


def delete_session(session_id: str) -> None:
    with get_cursor() as cur:
        cur.execute("delete from sessions where id = %s", (session_id,))


def set_pinned(session_id: str, pinned: bool) -> None:
    with get_cursor() as cur:
        cur.execute("update sessions set pinned = %s where id = %s", (pinned, session_id))


# ── Memo results ─────────────────────────────────────────────────

def save_memo_result(session_id: str, sections: list, case_metadata: dict | None,
                      sources: dict | None, memo_text: str | None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """insert into memo_results (session_id, sections, case_metadata, sources, memo_text)
               values (%s, %s, %s, %s, %s)
               on conflict (session_id) do update set
                 sections = excluded.sections,
                 case_metadata = excluded.case_metadata,
                 sources = excluded.sources,
                 memo_text = excluded.memo_text,
                 updated_at = now()""",
            (session_id, json.dumps(sections), json.dumps(case_metadata),
             json.dumps(sources), memo_text),
        )


def get_memo_result(session_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute("select * from memo_results where session_id = %s", (session_id,))
        return cur.fetchone()


# ── Contract results ─────────────────────────────────────────────

def save_contract_result(session_id: str, clauses: list, contract_type_ar: str | None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """insert into contract_results (session_id, clauses, contract_type_ar)
               values (%s, %s, %s)
               on conflict (session_id) do update set
                 clauses = excluded.clauses,
                 contract_type_ar = excluded.contract_type_ar,
                 updated_at = now()""",
            (session_id, json.dumps(clauses), contract_type_ar),
        )


def get_contract_result(session_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute("select * from contract_results where session_id = %s", (session_id,))
        return cur.fetchone()


# ── Chat history ─────────────────────────────────────────────────

def append_chat_message(session_id: str, role: str, text: str,
                         change_card: dict | None = None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """insert into chat_messages (session_id, role, text, change_card)
               values (%s, %s, %s, %s) returning *""",
            (session_id, role, text, json.dumps(change_card) if change_card else None),
        )
        return cur.fetchone()


def get_chat_history(session_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "select * from chat_messages where session_id = %s order by created_at",
            (session_id,),
        )
        return cur.fetchall()


# ── Firms / membership ───────────────────────────────────────────

def get_user_firm_ids(user_id: str) -> list[str]:
    with get_cursor() as cur:
        cur.execute("select firm_id from firm_members where user_id = %s", (user_id,))
        return [row["firm_id"] for row in cur.fetchall()]


def create_firm_with_owner(name: str, owner_user_id: str) -> dict:
    with get_cursor() as cur:
        cur.execute("insert into firms (name) values (%s) returning *", (name,))
        firm = cur.fetchone()
        cur.execute(
            "insert into firm_members (firm_id, user_id, role) values (%s, %s, 'owner')",
            (firm["id"], owner_user_id),
        )
        return firm


def add_member_to_firm(firm_id: str, user_id: str, role: str = "member") -> None:
    with get_cursor() as cur:
        cur.execute(
            """insert into firm_members (firm_id, user_id, role) values (%s, %s, %s)
               on conflict (firm_id, user_id) do nothing""",
            (firm_id, user_id, role),
        )
