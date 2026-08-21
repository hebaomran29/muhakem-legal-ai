"""
التحقق من هوية المستخدم عن طريق الـ JWT اللي بيرجعه Supabase Auth بعد تسجيل
الدخول. الفرونت بيبعت الـ token في الهيدر:
    Authorization: Bearer <access_token>

مشاريع Supabase الجديدة (بعد أكتوبر 2025) بتوقّع الـ JWT بمفتاح غير متماثل
(ES256/RSA) افتراضيًا، مش بسر مشترك (HS256) زي القديم. الكود هنا بيتعامل
مع الحالتين: بيقرا الـ alg من هيدر التوكن نفسه، ولو ES256/RS256 بيجيب
المفتاح العام من JWKS endpoint بتاع المشروع، ولو HS256 (مشاريع قديمة) بيستخدم
SUPABASE_JWT_SECRET زي ما هو.

عندك خيارين لمعرفة الـ firm بتاعت المستخدم:
  - لو أول مرة يسجل دخول ومعندوش firm، لازم تعملي لها firm جديدة (اونر)
    أو تضيفيها لـ firm موجودة (invite flow) — ده منطق منفصل هنبنيه
    في endpoint التسجيل، مش هنا.
"""
import os
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

from db import repo

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

_jwks_client: "PyJWKClient | None" = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not SUPABASE_URL:
            raise RuntimeError(
                "SUPABASE_URL مش موجود في متغيرات البيئة — لازم عشان نتحقق "
                "من توكنات ES256 (نظام التوقيع الجديد). شكله: https://xxxx.supabase.co"
            )
        _jwks_client = PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    return _jwks_client


class CurrentUser:
    def __init__(self, user_id: str, email: str | None, firm_ids: list[str]):
        self.user_id = user_id
        self.email = email
        self.firm_ids = firm_ids

    @property
    def firm_id(self) -> str:
        """الـ firm الافتراضية (أول واحدة). لو محتاجة دعم اختيار firm في
        الواجهة (مستخدم عضو في أكتر من مكتب)، ده المكان اللي تبدئي منه."""
        if not self.firm_ids:
            raise HTTPException(
                status_code=403,
                detail="المستخدم مش عضو في أي مكتب — كمّلي إعداد الحساب الأول",
            )
        return self.firm_ids[0]


def _decode_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"توكن غير صالح: {e}")

    alg = header.get("alg", "HS256")

    try:
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET مش مظبوط في السيرفر")
            return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"],
                               audience="authenticated", leeway=60)
        else:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            return jwt.decode(token, signing_key.key, algorithms=[alg],
                               audience="authenticated", leeway=60)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"توكن غير صالح أو منتهي: {e}")


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="مفيش توكن مصادقة — سجّلي دخول")

    token = authorization.removeprefix("Bearer ").strip()
    payload = _decode_token(token)

    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id:
        raise HTTPException(status_code=401, detail="توكن غير صالح")

    firm_ids = repo.get_user_firm_ids(user_id)
    return CurrentUser(user_id=user_id, email=email, firm_ids=firm_ids)


def try_get_current_user(authorization: str = Header(default="")) -> "CurrentUser | None":
    """زي get_current_user بالظبط، لكن بترجع None بدل ما ترمي 401/500 —
    مستخدمة في الـ endpoints اللي لسه محتاجة تفضل شغالة من غير auth (تدريجيًا،
    لحد ما تفعّلي تسجيل الدخول في الفرونت). بمجرد ما التسجيل يبقى إجباري،
    استبدليها بـ get_current_user العادية في الـ Depends."""
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
    except Exception:
        # الداتابيز نفسها مش متصلة/مظبوطة لسه — نسيب الطلب يكمل من غير auth
        return None


def require_session_access(session_id: str, user: CurrentUser) -> None:
    """يتأكد إن الجلسة دي فعلاً بتاعة المستخدم الحالي (created_by) قبل ما
    نسمحله يقرا/يعدّل/يمسح/يثبّت فيها — مش مجرد فلترة فرونت. الفحص بيتم
    على مستويين مع بعض: firm_id (توافقي مع السكيما الحالية) AND created_by
    (الملكية الحقيقية للمستخدم في الـ MVP الحالي). لو حد خمّن session_id
    بتاعة مستخدمة تانية (حتى لو نفس الـ firm نظريًا)، الطلب هيترفض."""
    if not repo.session_belongs_to_user(session_id, user.firm_id, user.user_id):
        raise HTTPException(status_code=404, detail="الجلسة دي مش موجودة")


def require_job_access(job: dict | None, user: CurrentUser) -> dict:
    """يثبت ملكية job قبل أي قراءة أو تعديل أو تحميل.

    الـ job UUID ليس authorization. الوظائف الجديدة تحفظ user_id/firm_id من
    لحظة الإنشاء، ولو لها session دائم نعيد استخدام require_session_access.
    في كل حالات الفشل نرجع 404 موحدًا حتى لا نكشف هل job لمستخدم آخر موجود أم لا.
    """
    not_found = HTTPException(status_code=404, detail="العملية دي مش موجودة")
    if job is None:
        raise not_found

    session_id = job.get("db_session_id")
    if session_id:
        try:
            require_session_access(session_id, user)
        except HTTPException:
            raise not_found
        return job

    if job.get("user_id") != user.user_id or job.get("firm_id") != user.firm_id:
        raise not_found
    return job