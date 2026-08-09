"""
اتصال بالداتابيز عن طريق REST API بتاعة Supabase (PostgREST) — مش اتصال
Postgres مباشر. الفايدة: كل حاجة بتعدي على HTTPS بورت 443 العادي، بدل
بورتات 5432/6543 اللي شبكات كتير (شغل/جامعات) بتعمل block ليها.

محتاجة SUPABASE_URL و SUPABASE_SECRET_KEY (مش الـ publishable — السيكريت
كي، من نفس صفحة API Keys اللي شفتيها، قسم "Secret keys" → Reveal).
السيكريت كي ده بيتخطى الـ Row Level Security زي service_role القديم،
فمينفعش يتحط في الفرونت خالص — هنا بس في الباك إند.
"""
import os
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")

_REST_BASE = f"{SUPABASE_URL}/rest/v1"


def _headers(prefer: str | None = None) -> dict:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "SUPABASE_URL أو SUPABASE_SECRET_KEY مش موجودين في متغيرات البيئة."
        )
    h = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _check(res: requests.Response) -> requests.Response:
    if not res.ok:
        raise RuntimeError(f"Supabase REST error {res.status_code}: {res.text[:300]}")
    return res


def select(table: str, params: dict, single: bool = False):
    """GET — params بنفس صيغة PostgREST (مثال: {'firm_id': 'eq.<id>', 'order': 'updated_at.desc'})"""
    res = _check(requests.get(f"{_REST_BASE}/{table}", headers=_headers(), params=params, timeout=15))
    data = res.json()
    if single:
        return data[0] if data else None
    return data


def insert(table: str, row: dict, on_conflict: str | None = None, merge: bool = False):
    """POST — بترجع الصف بعد الإضافة. لو merge=True و on_conflict متحدد، بتعمل upsert."""
    params = {}
    prefer = "return=representation"
    if on_conflict:
        params["on_conflict"] = on_conflict
        prefer = f"resolution=merge-duplicates,{prefer}" if merge else prefer
    res = _check(requests.post(f"{_REST_BASE}/{table}", headers=_headers(prefer), params=params,
                                json=row, timeout=15))
    data = res.json()
    return data[0] if isinstance(data, list) and data else data


def update(table: str, params: dict, patch: dict):
    """PATCH — params بتحدد الصفوف (مثال: {'id': 'eq.<id>'})"""
    _check(requests.patch(f"{_REST_BASE}/{table}", headers=_headers(), params=params,
                           json=patch, timeout=15))


def delete(table: str, params: dict):
    _check(requests.delete(f"{_REST_BASE}/{table}", headers=_headers(), params=params, timeout=15))


def auth_admin_get_user_by_email(email: str) -> dict | None:
    """بيدور على مستخدم مسجّل في Supabase Auth بالإيميل — مستخدمة في دعوة
    عضو جديد للمكتب. بتستخدم Admin API (محتاجة السيكريت كي كمان)."""
    res = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=_headers(), params={"email": email}, timeout=15,
    )
    if not res.ok:
        return None
    users = res.json().get("users", [])
    return users[0] if users else None