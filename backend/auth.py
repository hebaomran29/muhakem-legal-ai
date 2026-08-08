"""
التحقق من هوية المستخدم عن طريق الـ JWT اللي بيرجعه Supabase Auth بعد تسجيل
الدخول. الفرونت بيبعت الـ token في الهيدر:
    Authorization: Bearer <access_token>

عندك خيارين لمعرفة الـ firm بتاعت المستخدم:
  - لو أول مرة يسجل دخول ومعندوش firm، لازم تعملي لها firm جديدة (اونر)
    أو تضيفيها لـ firm موجودة (invite flow) — ده منطق منفصل هنبنيه
    في endpoint التسجيل، مش هنا.
"""
import os
import jwt
from fastapi import Header, HTTPException

from db import repo

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


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


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="مفيش توكن مصادقة — سجّلي دخول")

    token = authorization.removeprefix("Bearer ").strip()
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET مش مظبوط في السيرفر")

    try:
        payload = jwt.decode(
            token, SUPABASE_JWT_SECRET, algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"توكن غير صالح أو منتهي: {e}")

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
    """يتأكد إن الجلسة دي فعلاً بتاعة مكتب المستخدم قبل ما نسمحله يقرا/يعدّل
    فيها — دفاع إضافي حتى لو حد قدر يخمّن session_id بتاع مكتب تاني."""
    if not repo.session_belongs_to_firm(session_id, user.firm_id):
        raise HTTPException(status_code=404, detail="الجلسة دي مش موجودة")
