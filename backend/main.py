# main.py — طبقة الـ backend فوق pipeline.py
#
# ⚠️ نفس القاعدة الأصلية: الملف ده مبيعدلش في منطق pipeline.py ولا ترتيب
# تنفيذه. كل حاجة إضافية هنا (تقسيم الأقسام، استخراج الـ metadata، الـ
# chat-edit) بتستخدم دوال pipeline.py الموجودة فعلاً (validators، الـ LLM
# client، القواميس القانونية) من غير ما تلمس تعريفاتها.
#
# ── العقد اللي Bolt هيشتغل عليه (5 أقسام حقيقية مطابقة لقالب المذكرة) ──────
# id                  | العنوان
# --------------------|---------------------------------------
# waqai               | أولاً: وقائع الدعوى
# difa_shakliya       | ثانياً: الدفوع الشكلية
# difa_mawdoiya       | ثالثاً: الدفوع الموضوعية
# talabat_khitamiya   | رابعاً: الطلبات الختامية
# talabat_ijraiya     | خامساً: الطلبات الإجرائية المصاحبة
#
# مفيش "تحليل قانوني" منفصل ومفيش "خاتمة" — دول مش موجودين في قالب
# المذكرة القانوني الفعلي. لو الفرونت عنده أقسام تانية لازم تتغير هناك.

import os
import re
import sys
import uuid
import json
import queue
import threading
import traceback
from datetime import datetime, timezone
from contextlib import redirect_stdout
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from memo import pipeline  # نفس ملف الـ pipeline من غير أي تعديل منطقي
from consultation import legal_agent  # نفس منطق الاستشارة من غير أي تعديل
from db import repo
from auth import CurrentUser, get_current_user, require_job_access, require_session_access
from routers.firms_sessions import firms_sessions_router
from routers.memo import memo_router
from routers.review import review_router
from services.memo_service import (
    JobStatus,
    _classify_chat_action,
)
from schemas import (
    ChatEditRequest,
    ConsultationChatRequest,
    ConsultationChatResponse,
    ContractChatEditRequest,
    AddContractClauseRequest,
    GenerateContractRequest,
    GenerateMemoRequest,
    JobResponse,
    JobStatusResponse,
    ResumeResponse,
    RouterMessage,
    RouterRequest,
    RouterResponse,
    SaveSectionsRequest,
)

# ── استيراد pipeline العقود ──────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "contracts"))
import contract_pipeline as cp


# ── إعداد التطبيق ────────────────────────────────────────────────────────────
app = FastAPI(title="Muhakem — Legal AI Platform", version="3.0.0")

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGINS] if CORS_ORIGINS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(firms_sessions_router)
app.include_router(memo_router)
app.include_router(review_router)


# ── Consultation model warm-up (main.py only — صفر تعديل في legal_agent.py) ──
# _ensure_pipeline() جوه legal_agent.py مش thread-safe (بتعدّل global dicts
# زي _bm25_by_law/_chunks_by_law من غير lock)، فلو warm-up thread وطلب
# استشارة حقيقي نادوا عليها في نفس اللحظة، ممكن يحصل تحميل مكرر أو تعارض في
# الحالة العالمية. الحل: lock واحد هنا في main.py بس، بيتشارك فيه warm-up
# والطلبات الحقيقية، وبما إن _ensure_pipeline() نفسها idempotent (بترجع فوراً
# لو _consultation_ready=True)، فأي نداء تاني بعد أول تحميل بيبقى شبه مجاني.
_consultation_warmup_lock = threading.Lock()


def _warm_up_consultation_models():
    """بتتنفذ في background thread وقت الـ startup. بتنادي على
    legal_agent._ensure_pipeline() الموجودة بالظبط — من غير أي تكرار لمنطق
    التحميل. لو فشلت (شبكة/مفتاح ناقص)، السيرفر يفضل شغال والـ lazy load
    القديم هيشتغل عادي أول ما يجيلها طلب استشارة حقيقي."""
    try:
        with _consultation_warmup_lock:
            legal_agent._ensure_pipeline()
        print("✅ Consultation models warm-up خلص بنجاح (embedder + reranker + BM25).")
    except Exception as e:
        print(f"⚠️ Consultation warm-up فشل ({e}) — هيتحمّل lazy عادي أول طلب استشارة حقيقي.")


@app.on_event("startup")
def _start_consultation_warmup():
    # daemon=True عشان الـ thread ده ميمنعش السيرفر من الإغلاق العادي، وما
    # بيبلوكش startup الـ FastAPI/Uvicorn — الـ app بيبدأ يستقبل طلبات فوراً.
    threading.Thread(target=_warm_up_consultation_models, daemon=True, name="consultation-warmup").start()


# ── Request/Response models ─────────────────────────────────────────────────

# ── Router Agent ────────────────────────────────────────────────────────────
ROUTER_SYSTEM_PROMPT = """أنت المساعد الذكي في نظام "مُحَكِّم" القانوني. المستخدم يتحدث معك في الشاشة الرئيسية قبل تنفيذ أي مهمة.

مهمتك:
1. فهم ما يريد المستخدم من رسالته الحالية + سياق المحادثة السابقة
2. تصنيف النية (intent) إلى أحد الأنواع:
   - memo: إعداد مذكرة دفاع / لائحة دفاع / مرافعة
   - contract: صياغة عقد / إنشاء اتفاقية (فقط إذا طلب المستخدم إنشاء أو كتابة عقد)
   - review: مراجعة عقد / فحص عقد / تحليل مخاطر
   - research: بحث قانوني متخصص / مواد / أحكام
   - consultation: استشارة قانونية / سؤال عن حكم / سؤال عام (الافتراضي)
3. الرد بالمحتوى المناسب

⭐ القاعدة الأهم — الفرق بين السؤال عن العقد وإنشاء العقد:
- إذا كان المستخدم **يسأل** عن حكم أو شروط أو آثار أو أحكام متعلقة بعقد → intent = "consultation" (استشارة)
- إذا كان المستخدم **يطلب إنشاء أو صياغة أو كتابة** عقد → intent = "contract"
- المعيار هو **نيّة المستخدم (فعل vs. سؤال)** وليس مجرد ذكر كلمة "عقد" أو "اتفاقية"

أمثلة على consultation (سؤال عن عقد، وليس إنشاؤه):
- "ما هي شروط فسخ العقد في القانون المدني المصري؟" → consultation
- "هل يجوز فسخ العقد؟" → consultation
- "ما حكم الشرط الجزائي في العقد؟" → consultation
- "ما هي آثار فسخ العقد؟" → consultation
- "متى يبطل العقد؟" → consultation
- "ما حقوقي لو فسخ العقد؟" → consultation

أمثلة على contract (إنشاء عقد):
- "اكتب لي عقد إيجار" → contract
- "أنشئ عقد عمل" → contract
- "صِغ لي عقد شراكة" → contract
- "اكتب عقد بيع" → contract
- "أريد صياغة اتفاقية" → contract

أمثلة على review (مراجعة عقد موجود):
- "راجع هذا العقد" → review
- "فحص عقد الإيجار ده" → review

أمثلة على consultation (سؤال عام قانوني):
- "ما هو الفرق بين البيع والإيجار؟" → consultation
- "هل يجوز الطرد بدون إنذار؟" → consultation

قواعد مهمة:
- لو المستخدم وصف وقائع قضية (متهم، تهمة، قبض، إلخ) من غير ما يطلب إجراء محدد:
  intent = "consultation"  should_route = false
  أجب باعتِراف إنك فهمت القضية واطلب توضيح المطلوب (مثلاً: مذكرة دفاع؟ مراجعة عقد؟ بحث قانوني؟)
- لو المستخدم طلب إجراء معين (مذكرة/عقد/مراجعة/بحث):
  should_route = true
  enriched_prompt = دمج كل السياق الموجود (وقائع + تفاصيل) مع الطلب الحالي
  is_reference = true لو كان يشير لمعلومات قالها قبل كده
- لو المستخدم طلب إجراء من غير سياق كافي:
  should_route = true  enriched_prompt = النص المتاح
  أضف في الـ response تنبيه إن المعلومات محدودة
- لو رسالة المستخدم قصيرة جداً أو غامضة:
  should_route = false  اطلب توضيح

أجب بـ JSON فقط بدون أي نص إضافي:
{"intent":"...","should_route":true/false,"is_reference":true/false,"response":"...","enriched_prompt":"..."}"""


# كلمات مفتاحية حسب **نوع الإجراء** — مش حسب الموضوع.
# "عقد" و"اتفاقية" و"بنود" مش here عشان هي كلمات موضوعية:
# المستخدم ممكن يسأل عن العقد (consultation) أو يطلب إنشاءه (contract).
# الـ fallback بيتعامل مع الحالة دي عن طريق فحص نمط الجملة (سؤال vs. أمر).
_ROUTER_KEYWORDS: dict[str, list[str]] = {
    "memo": ["مذكرة", "دفاع", "مرافعة", "لائحة"],
    "contract": ["اكتب لي عقد", "أنشئ عقد", "صياغة عقد", "صِغ لي عقد",
                "اكتب عقد", "أريد عقد", "ابني عقد", "جهّز عقد",
                "اعداد عقد", "إعداد عقد", "تحرير عقد"],
    "review": ["راجع", "فحص", "تدقيق", "مراجعة"],
    "research": ["بحث قانوني", "مقال قانوني", "سابقة قضائية"],
}


# أنماط الاستفهام العربية — لو النص يبدأ بأي من دول أو يحتويها كنمط سؤال،
# فهو **سؤال** (consultation) حتى لو فيه كلمات مثل "عقد" أو "اتفاقية".
_QUESTION_PREFIXES = [
    "ما هي", "ما هو", "ما هى", "ما هو", "ما هى",
    "ما حكم", "ما حقوق", "ما هي حقوق", "ما هي شروط",
    "هل", "هل يجوز", "هل يحق", "هل يمكن",
    "متى", "متى ي", "متى يجوز", "متى يبطل",
    "لماذا", "كيف", "كيف يمكن", "كيف يتم",
    "ما الفرق", "ما الفرق بين",
    "ما المادة", "ما هي المادة",
    "ما آثار", "ما هي آثار",
    "هل يجوز فسخ", "شروط فسخ", "آثار فسخ", "أحكام فسخ",
]

# أفعال الطلب/الإنشاء — لو النص فيه أي من دول، المستخدم يريد **إنشاء شيء**.
_ACTION_VERBS = [
    "اكتب", "اكتب لي", "أنشئ", "أنشئ لي", "صِغ", "صيغ لي",
    "أريد صياغة", "أريد عقد", "ابني", "جهّز", "حرر",
    "اعداد", "إعداد", "تحرير",
]


def _is_question_pattern(text: str) -> bool:
    """يحسب إذا النص سؤال (استشارة) وليس أمر (إنشاء).
    بيتحقق من: علامات استفهام، بدايات أسئلة عربية، أو نمط سؤال."""
    # علامة استفهام صريحة
    if "؟" in text or "?" in text:
        return True
    lower = text.strip()
    # بدايات أسئلة عربية شائعة
    for prefix in _QUESTION_PREFIXES:
        if lower.startswith(prefix) or prefix in lower:
            return True
    return False


def _has_creation_verb(text: str) -> bool:
    """يحسب إذا النص فيه فعل إنشاء/صياغة واضح."""
    lower = text.lower()
    return any(verb in lower for verb in _ACTION_VERBS)


def _keyword_fallback_router(text: str, history_text: str) -> dict:
    """Fallback keyword-based routing when LLM is unavailable.

    التحسين الأساسي: التمييز بين "سؤال عن عقد" (consultation) و
    "طلب إنشاء عقد" (contract) بناءً على نمط الجملة، وليس مجرد
    وجود كلمة "عقد".
    """
    lower = text.lower()
    is_question = _is_question_pattern(text)
    has_creation = _has_creation_verb(text)

    # خطوة 1: لو فيه فعل إنشاء/صياغة واضح، حدد الهدف حسب الكلمات المرفقة
    if has_creation:
        # لو الكلمات المفتاحية بتشير لمذكرة → memo (مش contract)
        if any(kw in lower for kw in _ROUTER_KEYWORDS.get("memo", [])):
            best_intent = "memo"
            best_score = 1
        # لو فيه كلمات مراجعة → review
        elif any(kw in lower for kw in _ROUTER_KEYWORDS.get("review", [])):
            best_intent = "review"
            best_score = 1
        else:
            best_intent = "contract"
            best_score = 1
    else:
        # خطوة 2: تسجيل keyword scores عادي
        best_intent = "consultation"
        best_score = 0
        for intent_type, kws in _ROUTER_KEYWORDS.items():
            score = sum(1 for kw in kws if kw in lower)
            if score > best_score:
                best_score = score
                best_intent = intent_type

    # خطوة 3: override — لو النص سؤال والتصنيف الحالي هو contract أو review
    # من غير ما يكون فيه فعل إنشاء واضح، خلّيه consultation
    if is_question and not has_creation and best_intent in ("contract", "review"):
        best_intent = "consultation"
        best_score = 0

    has_action = best_intent != "consultation"
    is_ref = any(w in lower for w in [
        "القضية", "ده", "دي", "اللي", "المذكور", "السابق",
        "كما ذكرت", "للقضية", "نفس", "بخصوص",
    ])
    enriched = f"{history_text}\n\n{text}" if (is_ref and history_text) else text

    if has_action:
        labels = {"memo": "إعداد مذكرة دفاع", "contract": "صياغة عقد",
                  "review": "مراجعة العقد", "research": "بحث قانوني"}
        response = f"حاضر، هبدأ {labels.get(best_intent, 'المطلوب')} فوراً."
    elif len(text) > 30:
        response = ("فهمت. هل تريد إعداد مذكرة دفاع لهذه القضية، "
                    "أو تحتاج مساعدة في شيء آخر؟")
    else:
        response = ("كيف أقدر أساعدك؟ ممكن تكتب وقائع قضية "
                    "أو تطلب إجراء معين (مذكرة دفاع، صياغة عقد، "
                    "مراجعة عقد، أو بحث قانوني).")

    return {"intent": best_intent, "should_route": has_action,
            "is_reference": is_ref, "response": response,
            "enriched_prompt": enriched}


@app.post("/api/router", response_model=RouterResponse)
async def router_endpoint(payload: RouterRequest):
    """Router Agent: يصنّف نية المستخدم ويرد محادثياً أو يبدأ التنفيذ."""
    try:
        conversation = [{"role": "system", "content": ROUTER_SYSTEM_PROMPT}]
        for msg in payload.messages[-6:]:
            conversation.append({"role": msg.role, "content": msg.text})
        conversation.append({"role": "user", "content": payload.current_text})

        raw = pipeline.llm_text(conversation, temperature=0.1, max_tokens=600)
        # handle possible markdown fences
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)

        return RouterResponse(
            intent=result.get("intent", "consultation"),
            should_route=result.get("should_route", False),
            is_reference=result.get("is_reference", False),
            response=result.get("response", ""),
            enriched_prompt=result.get("enriched_prompt", payload.current_text),
        )
    except Exception:
        history = "\n".join(m.text for m in payload.messages if m.role == "user")
        return RouterResponse(**_keyword_fallback_router(payload.current_text, history))


# ── Legal Consultation ───────────────────────────────────────────────────────
# Thin adapter حوالين legal_agent.answer_question() — صفر تعديل منطقي جوه
# consultation/legal_agent.py. الـ engine نفسه مصمم من الأصل عشان يتنادى كده
# (شوفي docstring بتاعت answer_question وConversationState.from_db_history).

@app.post("/api/consultation/chat", response_model=ConsultationChatResponse)
def consultation_chat(payload: ConsultationChatRequest, user: CurrentUser = Depends(get_current_user)):
    """استشارة قانونية تفاعلية — نفس نمط /api/memo/chat لكن من غير job queue
    (مفيش عملية طويلة محتاجة polling هنا، الرد بيرجع مباشرة من نفس الطلب).

    الـ ConversationState بيتبني من جديد من chat_messages المحفوظة في
    الداتابيز في كل نداء (مش من ذاكرة السيرفر) — بالظبط زي ما legal_agent.py
    متوقع (ConversationState.from_db_history)، عشان يشتغل صح حتى لو
    السيرفر عمل ريستارت بين رسالة وتانية."""
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message فاضي")

    session_id = payload.session_id
    db_history: list[dict] = []

    if session_id:
        require_session_access(session_id, user)
        db_history = repo.get_chat_history(session_id)
    else:
        try:
            session_row = repo.create_session(
                user.firm_id, user.user_id, "consultation",
                title=message[:60], prompt=message,
            )
            session_id = str(session_row["id"])
        except Exception as e:
            # زي memo/contract: لو حفظ الجلسة فشل، نكمّل من غير حفظ دائم
            # بدل ما نمنع المستخدمة من الرد خالص
            print(f"⚠️ فشل حفظ جلسة الاستشارة في الداتابيز (هتكمل من غير حفظ دائم): {e}")
            session_id = None

    state = legal_agent.ConversationState.from_db_history(db_history)

    try:
        # لو warm-up لسه شغال في الخلفية، الطلب ده بينتظر نفس الـ lock بدل ما
        # يعمل تحميل موديلات تاني بالتوازي (_ensure_pipeline مش thread-safe).
        # لو warm-up خلص بالفعل، النداء ده هيرجع فوراً (idempotent) وميضيفش
        # أي تأخير حقيقي.
        with _consultation_warmup_lock:
            legal_agent._ensure_pipeline()
        result = legal_agent.answer_question(message, conversation_state=state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل الحصول على رد الاستشارة: {e}")

    reply = result.get("answer", "")

    if session_id:
        try:
            repo.append_chat_message(session_id, "user", message)
            repo.append_chat_message(session_id, "assistant", reply)
            repo.touch_session(session_id)
        except Exception as e:
            print(f"⚠️ فشل حفظ رسائل الاستشارة في الداتابيز: {e}")

    return ConsultationChatResponse(
        session_id=session_id,
        reply=reply,
        needs_clarification=bool(result.get("needs_clarification")),
        routing=result.get("routing"),
    )


# ── Request/Response models ─────────────────────────────────────────────────
# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    try:
        collections = pipeline.qdrant.get_collections().collections
        return {"status": "ok", "qdrant_collections": [c.name for c in collections]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Qdrant unreachable: {e}")


@app.post("/api/contract/{session_id}/resume", response_model=ResumeResponse)
def resume_contract(session_id: str, user: CurrentUser = Depends(get_current_user)):
    """يستأنف عقدًا محفوظًا من الـstructured artifact canonical.

    الحقول المنظمة (preamble/clauses/closing) هي مصدر الحقيقة، وcontract_text
    قيمة مشتقة منها للعرض والتحميل. السجلات القديمة التي تملك clauses فقط
    تستأنف بأمان دون اختراع مقدمة أو خاتمة أو metadata مفقودة.
    """
    require_session_access(session_id, user)
    session = repo.get_session(session_id)
    if session is None or session.get("type") != "contract":
        raise HTTPException(status_code=404, detail="جلسة عقد مش موجودة")

    contract_result = repo.get_contract_result(session_id)
    if contract_result is None:
        raise HTTPException(status_code=409, detail="مفيش نتيجة محفوظة للعقد ده لسه")

    clauses = contract_result.get("clauses") or []
    contract_type_ar = contract_result.get("contract_type_ar") or ""
    preamble = contract_result.get("preamble") or ""
    closing = contract_result.get("closing") or ""
    contract_text = _reconstruct_contract(preamble, clauses, closing)
    if not preamble and not closing and not clauses:
        contract_text = contract_result.get("contract_text") or ""
    pending_clauses = contract_result.get("pending_clauses")
    if pending_clauses is None:
        pending_clauses = _pending_clauses_for_contract(contract_result.get("contract_type_key"), clauses)

    db_chat_history = repo.get_chat_history(session_id)

    job_id = str(uuid.uuid4())
    with _contract_jobs_lock:
        _contract_jobs[job_id] = {
            "status": JobStatus.COMPLETED,
            "progress": 1.0,
            "stage": None,
            "logs": [],
            "last_log": None,
            "input": {"query": session.get("prompt") or ""},
            "result": {
                "contract_text": contract_text,
                "preamble": preamble,
                "closing": closing,
                "clauses": clauses,
                "contract_type_key": contract_result.get("contract_type_key"),
                "contract_type_ar": contract_type_ar,
                "clause_validation": contract_result.get("clause_validation") or {},
                "pending_clauses": pending_clauses,
                "docx_path": None,
            },
            "error": None,
            "chat_history": [
                {"role": m["role"], "message": m["text"]} for m in db_chat_history
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "db_session_id": session_id,
            "user_id": user.user_id,
            "firm_id": user.firm_id,
        }

    return ResumeResponse(
        job_id=job_id, status=JobStatus.COMPLETED,
        db_session_id=session_id, chat_history=db_chat_history,
    )


# ════════════════════════════════════════════════════════════════════
# نظام إنشاء العقود — نفس نمط المذكرات (job queue + polling + chat)
# ════════════════════════════════════════════════════════════════════

# ── Contract Job store ──────────────────────────────────────────────────────
_contract_jobs: dict[str, dict] = {}
_contract_jobs_lock = threading.Lock()
_contract_work_queue: "queue.Queue[str]" = queue.Queue()


class _ContractStageTracker:
    """يشتغل زي _StageTracker بس للعقود — بيلقط print() من contract_pipeline."""
    def __init__(self, job_id: str):
        self.job_id = job_id

    def write(self, text: str):
        sys.__stdout__.write(text)
        stripped = text.strip()
        if not stripped:
            return
        with _contract_jobs_lock:
            job = _contract_jobs.get(self.job_id)
            if job is not None:
                job["last_log"] = stripped
                job["logs"].append(stripped)
                job["stage"] = stripped
                m = re.search(r"(\d+)/(\d+)", stripped)
                if m and ("اتولّد" in stripped or "بند" in stripped):
                    job["progress"] = int(m.group(1)) / int(m.group(2))

    def flush(self):
        sys.__stdout__.flush()


def _parse_contract_clauses(contract_text: str) -> tuple[str, str, list[dict]]:
    """يفصل العقد لـ: preamble + clauses list + closing."""
    preamble = ""
    closing = ""
    clauses = []

    lines = contract_text.split("\n")
    clause_pattern = re.compile(r"^البند\s+(\d+)\s*[—\-]\s*(.+?):\s*")

    current_clause = None
    current_lines = []
    section = "preamble"

    for line in lines:
        m = clause_pattern.match(line.strip())
        if m:
            if current_clause is not None:
                current_clause["body"] = "\n".join(current_lines).strip()
                clauses.append(current_clause)
            elif section == "preamble" and current_lines:
                preamble = "\n".join(current_lines).strip()

            current_clause = {
                "index": int(m.group(1)),
                "title": m.group(2).strip(),
                "body": "",
            }
            current_lines = [line[m.end():].strip()] if m.end() < len(line) else []
            section = "clauses"
        elif section == "clauses":
            current_lines.append(line)
        else:
            current_lines.append(line)

    if current_clause is not None:
        current_clause["body"] = "\n".join(current_lines).strip()
        clauses.append(current_clause)

    # فصل الـ closing
    if clauses:
        last_body = clauses[-1]["body"]
        closing_marker = last_body.find("الطرف الأول: التوقيع")
        if closing_marker > 0:
            closing = last_body[closing_marker:].strip()
            clauses[-1]["body"] = last_body[:closing_marker].strip()

    return preamble, closing, clauses


def _pending_clauses_for_contract(contract_type_key: str | None, clauses: list[dict]) -> list[dict]:
    """يعيد البنود غير الإلزامية التي لم تُدرج بعد في العقد."""
    if not contract_type_key:
        return []
    catalog = cp.load_clause_types().get(contract_type_key) or {}
    existing_ids = {c.get("clause_id") for c in clauses if c.get("clause_id")}
    existing_titles = {c.get("title") for c in clauses if c.get("title")}
    pending = []
    for clause in catalog.get("specific_clauses") or []:
        if clause.get("obligation_level") == "mandatory":
            continue
        if clause.get("clause_id") in existing_ids or clause.get("title") in existing_titles:
            continue
        pending.append({
            "clause_id": clause.get("clause_id"),
            "title": clause.get("title", ""),
            "description": clause.get("description", ""),
            "obligation_level": clause.get("obligation_level"),
            "search_keywords": clause.get("search_keywords") or [],
            "legal_basis": clause.get("legal_basis"),
        })
    return pending


def _reconstruct_contract(preamble: str, clauses: list[dict], closing: str) -> str:
    """يبني النص المشتق من الـstructured contract artifact canonical."""
    parts = [preamble]
    for c in clauses:
        parts.append(f"البند {c['index']} — {c['title']}: {c['body']}")
    if closing:
        parts.append(closing)
    return "\n\n".join(p for p in parts if p)


def _run_contract_job(job_id: str):
    with _contract_jobs_lock:
        job = _contract_jobs[job_id]
        job["status"] = JobStatus.PROCESSING
        job["started_at"] = datetime.now(timezone.utc).isoformat()
        job_input = job["input"]

    tracker = _ContractStageTracker(job_id)
    try:
        with redirect_stdout(tracker):
            result = cp.generate_contract(job_input["query"])

        generated_contract_text = result.get("contract_text")
        if not generated_contract_text:
            raise RuntimeError("لم يتم توليد نص العقد")

        preamble, closing, clauses = _parse_contract_clauses(generated_contract_text)
        contract_type_key = result.get("contract_type_key")
        pending_clauses = _pending_clauses_for_contract(contract_type_key, clauses)
        # Structured fields are canonical; contract_text is always derived from them.
        contract_text = _reconstruct_contract(preamble, clauses, closing)

        with _contract_jobs_lock:
            job["status"] = JobStatus.COMPLETED
            job["progress"] = 1.0
            job["stage"] = "تم الانتهاء من توليد العقد"
            job["finished_at"] = datetime.now(timezone.utc).isoformat()
            job["chat_history"] = []
            job["result"] = {
                "contract_text": contract_text,
                "preamble": preamble,
                "closing": closing,
                "clauses": clauses,
                "contract_type_key": contract_type_key,
                "contract_type_ar": cp.load_clause_types().get(
                    result.get("contract_type_key", ""), {}
                ).get("contract_type_ar", ""),
                "clause_validation": result.get("clause_validation", {}),
                "pending_clauses": pending_clauses,
                "docx_path": result.get("docx_path"),
            }

        db_session_id = job.get("db_session_id")
        if db_session_id:
            try:
                artifact = job["result"]
                repo.save_contract_result(
                    db_session_id,
                    artifact["clauses"],
                    artifact.get("contract_type_ar"),
                    preamble=artifact.get("preamble"),
                    closing=artifact.get("closing"),
                    contract_text=artifact.get("contract_text"),
                    contract_type_key=artifact.get("contract_type_key"),
                    clause_validation=artifact.get("clause_validation"),
                    pending_clauses=artifact.get("pending_clauses"),
                )
                repo.touch_session(db_session_id, title=job["result"]["contract_type_ar"] or None)
            except Exception as e:
                print(f"⚠️ فشل حفظ نتيجة العقد في الداتابيز: {e}")
    except Exception as e:
        with _contract_jobs_lock:
            job["status"] = JobStatus.FAILED
            job["finished_at"] = datetime.now(timezone.utc).isoformat()
            job["error"] = str(e)
            job["traceback"] = traceback.format_exc()


def _contract_worker_loop():
    while True:
        job_id = _contract_work_queue.get()
        try:
            _run_contract_job(job_id)
        finally:
            _contract_work_queue.task_done()


_contract_worker_thread = threading.Thread(target=_contract_worker_loop, daemon=True)
_contract_worker_thread.start()


# ── Contract Chat-Edit ──────────────────────────────────────────────────────

CONTRACT_DELETE_KEYWORDS = ["امسح", "احذف", "شيل", "الغي", "الغِ", "أزيل"]


def _classify_contract_clause(message: str, clauses: list[dict]) -> int | None:
    """يحدد أي بند المستخدم قاصده."""
    nums = {"اول":1,"ثاني":2,"ثانٍ":2,"ثالث":3,"ثالثٍ":3,"رابع":4,"رابعٍ":4,
            "خامس":5,"خامسٍ":5,"سادس":6,"سابع":7,"ثامن":8,"تاسع":9,"عاشر":10}
    for word, num in nums.items():
        if word in message:
            if any(c["index"] == num for c in clauses):
                return num

    m = re.search(r"بند\s*(\d+)", message)
    if m:
        num = int(m.group(1))
        if any(c["index"] == num for c in clauses):
            return num

    message_lower = message.strip()
    for clause in clauses:
        title = clause["title"]
        title_words = [w for w in title.split() if len(w) > 2]
        if title_words and any(w in message_lower for w in title_words):
            return clause["index"]

    return None


def _rewrite_contract_clause(clause: dict, message: str, contract_type_ar: str,
                              rag_resources: dict) -> str:
    """يعيد صياغة بند واحد بناءً على طلب الشات."""
    clause_types_db = cp.load_clause_types()
    contract_type_key = None
    for key, val in clause_types_db.items():
        if val.get("contract_type_ar") == contract_type_ar:
            contract_type_key = key
            break

    description = clause.get("description", "")
    if contract_type_key:
        for c in clause_types_db[contract_type_key].get("specific_clauses", []):
            if c.get("title") == clause["title"]:
                description = c.get("description", "")
                break

    modified_clause = {
        "title": clause["title"],
        "description": f"{description}. تعديل مطلوب: {message}"
    }

    search_query = f"{clause['title']}. {description}. {message}".strip()
    laws_context = cp.retrieve_laws_context(search_query, rag_resources, top_k=3)

    return cp.generate_single_clause(modified_clause, contract_type_ar, laws_context)


def _answer_contract_question(message: str, clauses: list[dict]) -> str:
    """يرد على سؤال معلوماتي عن العقد (مرجع قانوني لبند معين، توضيح، إلخ)
    عن طريق استرجاع مباشر من قاعدة القوانين — من غير ما يعدّل العقد."""
    rag_resources = cp.load_rag_resources()
    laws_context = cp.retrieve_laws_context(message, rag_resources, top_k=4)
    clauses_text = "\n\n".join(f"بند {c['index']} - {c['title']}:\n{c['body']}" for c in clauses)

    prompt = f"""أنتِ مساعدة قانونية بترد على سؤال عن عقد. جاوبي بالاستناد فقط
للمرجع القانوني الموجود تحت — ممنوع تخترعي مادة قانونية مش موجودة. لو المرجع
غير متاح، قولي بوضوح إن معندكيش مرجع قانوني محدد لده.

## بنود العقد الحالية:
{clauses_text}

## مرجع قانوني متاح:
{laws_context or 'لا يوجد مرجع قانوني ذو صلة متاح.'}

## سؤال المستخدم:
{message}

جاوبي بإيجاز ودقة:"""

    return pipeline.llm_text([{"role": "user", "content": prompt}],
                              temperature=0.1, max_tokens=600)


def _handle_contract_chat_edit(job: dict, message: str) -> dict:
    result = job["result"]
    clauses = result["clauses"]
    contract_type_ar = result.get("contract_type_ar", "")

    action = _classify_chat_action(message, "contract")
    if action["action"] == "switch_task":
        new_intent = action["new_intent"]
        return {
            "reply": f"تمام، فهمت إنك عايز {TASK_LABELS[new_intent]} — هحوّلك دلوقتي.",
            "updated_clauses": None,
            "change_card": None,
            "switch_task": {"intent": new_intent, "enriched_prompt": message},
        }
    if action["action"] == "question":
        answer = _answer_contract_question(message, clauses)
        return {
            "reply": answer,
            "updated_clauses": None,
            "change_card": None,
            "switch_task": None,
        }

    target_idx = _classify_contract_clause(message, clauses)
    is_delete = any(k in message for k in CONTRACT_DELETE_KEYWORDS)

    if target_idx is None and is_delete:
        return {
            "reply": "مش واضحلي تقصد أي بند بالظبط — ممكن توضح رقم البند أو عنوانه؟",
            "updated_clauses": None,
            "change_card": None,
        }

    if target_idx is None:
        return {
            "reply": f"فهمت. العقد فيه {len(clauses)} بند. قولي بالضبط إيه اللي عايز تعدّله (مثلاً: عدّل بند 3، أو عدّل بند الثمن).",
            "updated_clauses": None,
            "change_card": None,
        }

    clause = next((c for c in clauses if c["index"] == target_idx), None)
    if clause is None:
        return {
            "reply": f"لم أجد بند رقم {target_idx}.",
            "updated_clauses": None,
            "change_card": None,
        }

    if is_delete:
        old_body = clause["body"]
        updated_clauses = [c for c in clauses if c["index"] != target_idx]
        for i, c in enumerate(updated_clauses, start=1):
            c["index"] = i
        new_text = _reconstruct_contract(result["preamble"], updated_clauses, result["closing"])
        result["clauses"] = updated_clauses
        result["contract_text"] = new_text
        return {
            "reply": f"تم حذف بند {target_idx} — \"{clause['title']}\".",
            "updated_clauses": updated_clauses,
            "change_card": {
                "clause_index": target_idx,
                "clause_title": clause["title"],
                "old_text": old_body,
                "new_text": "[محذوف]",
            },
        }

    old_body = clause["body"]
    rag_resources = cp.load_rag_resources()
    new_body = _rewrite_contract_clause(clause, message, contract_type_ar, rag_resources)

    updated_clauses = [
        {**c, "body": new_body} if c["index"] == target_idx else c
        for c in clauses
    ]
    new_text = _reconstruct_contract(result["preamble"], updated_clauses, result["closing"])

    result["clauses"] = updated_clauses
    result["contract_text"] = new_text

    return {
        "reply": f"عدّلت بند {target_idx} — \"{clause['title']}\" حسب طلبك.",
        "updated_clauses": updated_clauses,
        "change_card": {
            "clause_index": target_idx,
            "clause_title": clause["title"],
            "old_text": old_body,
            "new_text": new_body,
        },
    }


# ── Contract Request/Response Models ────────────────────────────────────────

# ── Contract Endpoints ──────────────────────────────────────────────────────

@app.post("/api/contract/generate", response_model=JobResponse)
def generate_contract_endpoint(payload: GenerateContractRequest, user: CurrentUser = Depends(get_current_user)):
    """يبدأ توليد عقد ويرجع job_id — الفرونت يعمل polling.

    تسجيل الدخول إجباري هنا برضه (زي /api/memo/generate) لنفس السبب:
    الملكية (created_by) لازم تتحدد من أول لحظة."""
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="query فاضي")

    db_session_id = None
    try:
        session_row = repo.create_session(
            user.firm_id, user.user_id, "contract",
            title=payload.query.strip()[:60], prompt=payload.query,
        )
        db_session_id = str(session_row["id"])
    except Exception as e:
        print(f"⚠️ فشل حفظ الجلسة في الداتابيز (هتكمل من غير حفظ دائم): {e}")

    job_id = str(uuid.uuid4())
    with _contract_jobs_lock:
        _contract_jobs[job_id] = {
            "status": JobStatus.QUEUED,
            "progress": 0.0,
            "stage": None,
            "logs": [],
            "last_log": None,
            "input": payload.model_dump(),
            "result": None,
            "error": None,
            "chat_history": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "db_session_id": db_session_id,
            "user_id": user.user_id,
            "firm_id": user.firm_id,
        }
    _contract_work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED, db_session_id=db_session_id)


def _owned_contract_job(job_id: str, user: CurrentUser) -> dict:
    with _contract_jobs_lock:
        job = _contract_jobs.get(job_id)
    return require_job_access(job, user)


@app.get("/api/contract/{job_id}", response_model=JobStatusResponse)
def get_contract(job_id: str, user: CurrentUser = Depends(get_current_user)):
    job = _owned_contract_job(job_id, user)
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        stage=job.get("stage"),
        result=job.get("result"),
        error=job.get("error"),
    )


@app.post("/api/contract/clause/add")
def add_contract_clause(payload: AddContractClauseRequest, user: CurrentUser = Depends(get_current_user)):
    """يولد بندًا مقترحًا واحدًا فقط ثم يضيفه للعقد الحالي."""
    # authorization قبل قراءة أو تعديل artifact
    job = _owned_contract_job(payload.job_id, user)
    with _contract_jobs_lock:
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="العقد لسه مش جاهز")
        result = job["result"]
        pending = result.get("pending_clauses") or []
        pending_clause = next((c for c in pending if c.get("clause_id") == payload.clause_id), None)
        if pending_clause is None:
            raise HTTPException(status_code=404, detail="البند المقترح غير موجود أو تمت إضافته بالفعل")
        current_clauses = list(result.get("clauses") or [])
        contract_type_ar = result.get("contract_type_ar") or ""
        contract_type_key = result.get("contract_type_key")

    query = " ".join(
        part for part in (
            pending_clause.get("title"),
            pending_clause.get("description"),
            " ".join(pending_clause.get("search_keywords") or []),
        ) if part
    )
    resources = cp.load_rag_resources()
    laws_context = cp.retrieve_laws_context(query, resources, top_k=3)
    body = cp.generate_single_clause(pending_clause, contract_type_ar, laws_context)
    if not body or len(body.strip()) < 20:
        raise HTTPException(status_code=502, detail="فشل توليد البند المقترح")

    new_clause = {
        "index": max((c.get("index", 0) for c in current_clauses), default=0) + 1,
        "clause_id": pending_clause.get("clause_id"),
        "title": pending_clause.get("title", ""),
        "body": body.strip(),
        "obligation_level": pending_clause.get("obligation_level"),
    }
    updated_clauses = current_clauses + [new_clause]
    updated_pending = [c for c in pending if c.get("clause_id") != payload.clause_id]
    with _contract_jobs_lock:
        result = job["result"]
        result["clauses"] = updated_clauses
        result["pending_clauses"] = updated_pending
        result["contract_text"] = _reconstruct_contract(
            result.get("preamble") or "", updated_clauses, result.get("closing") or "",
        )
        artifact = dict(result)

    db_session_id = job.get("db_session_id")
    if db_session_id:
        try:
            repo.save_contract_result(
                db_session_id,
                artifact["clauses"],
                artifact.get("contract_type_ar"),
                preamble=artifact.get("preamble"),
                closing=artifact.get("closing"),
                contract_text=artifact.get("contract_text"),
                contract_type_key=artifact.get("contract_type_key"),
                clause_validation=artifact.get("clause_validation"),
                pending_clauses=artifact.get("pending_clauses"),
            )
            repo.touch_session(db_session_id)
        except Exception as e:
            print(f"⚠️ فشل حفظ البند المضاف في الداتابيز: {e}")

    return {
        "reply": f"تمت إضافة البند «{new_clause['title']}» إلى العقد.",
        "updated_clauses": updated_clauses,
        "pending_clauses": updated_pending,
        "updated_result": artifact,
        "change_card": None,
        "switch_task": None,
    }


@app.post("/api/contract/chat")
def contract_chat_edit(payload: ContractChatEditRequest, user: CurrentUser = Depends(get_current_user)):
    """شات تعديل العقد: يحدد البند المقصود ويعيد صياغته."""
    job = _owned_contract_job(payload.job_id, user)
    with _contract_jobs_lock:
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="العقد لسه مش جاهز")

    try:
        response = _handle_contract_chat_edit(job, payload.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل تعديل العقد: {e}")

    response.setdefault("switch_task", None)

    with _contract_jobs_lock:
        job["chat_history"].append({"role": "user", "message": payload.message})
        job["chat_history"].append({"role": "assistant", "message": response["reply"]})

    db_session_id = job.get("db_session_id")
    if db_session_id:
        try:
            repo.append_chat_message(db_session_id, "user", payload.message)
            repo.append_chat_message(db_session_id, "assistant", response["reply"],
                                      change_card=response.get("change_card"))
            if response.get("updated_clauses") is not None:
                result = job["result"]
                repo.save_contract_result(
                    db_session_id,
                    result["clauses"],
                    result.get("contract_type_ar"),
                    preamble=result.get("preamble"),
                    closing=result.get("closing"),
                    contract_text=result.get("contract_text"),
                    contract_type_key=result.get("contract_type_key"),
                    clause_validation=result.get("clause_validation"),
                    pending_clauses=result.get("pending_clauses"),
                )
            repo.touch_session(db_session_id)
        except Exception as e:
            print(f"⚠️ فشل حفظ رسائل شات العقد في الداتابيز: {e}")

    return response


@app.get("/api/contract/{job_id}/logs")
def get_contract_logs(job_id: str, user: CurrentUser = Depends(get_current_user)):
    job = _owned_contract_job(job_id, user)
    return {"job_id": job_id, "logs": job["logs"]}


@app.get("/api/contract/{job_id}/download")
def download_contract_docx(job_id: str, user: CurrentUser = Depends(get_current_user)):
    """يرجع ملف الـ docx كملف للتحميل."""
    job = _owned_contract_job(job_id, user)
    with _contract_jobs_lock:
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="العقد لسه مش جاهز")

    docx_path = (job.get("result") or {}).get("docx_path")
    if not docx_path or not os.path.isfile(docx_path):
        # نولّد ملف جديد لو ملفش أو اتمسح
        contract_text = job["result"]["contract_text"]
        contract_type_ar = job["result"].get("contract_type_ar", "عقد")
        safe_name = re.sub(r'[\\/:*?"<>|]', '', contract_type_ar) or "عقد"
        docx_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"{safe_name}.docx")
        docx_path = cp.create_word_document(contract_text, docx_path)
        job["result"]["docx_path"] = docx_path

    filename = os.path.basename(docx_path)
    return FileResponse(
        path=docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
