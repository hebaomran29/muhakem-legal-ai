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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import pipeline  # نفس ملف الـ pipeline من غير أي تعديل منطقي

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


# ── تعريف الأقسام الخمسة الحقيقية (بترتيب ظهورها في القالب) ─────────────────
SECTION_ANCHORS = [
    ("waqai", "أولاً: وقائع الدعوى", r"(?:أولاً|أولا)[:\s]*وقائع\s+الدعوى"),
    ("difa_shakliya", "ثانياً: الدفوع الشكلية", r"(?:ثانياً|ثانيًا)[:\s]*الدفوع\s+الشكلية"),
    ("difa_mawdoiya", "ثالثاً: الدفوع الموضوعية", r"(?:ثالثاً|ثالثًا)[:\s]*الدفوع\s+الموضوعية"),
    ("talabat_khitamiya", "رابعاً: الطلبات الختامية", r"(?:رابعاً|رابعًا)[:\s]*الطلبات\s+الختامية"),
    ("talabat_ijraiya", "خامساً: الطلبات الإجرائية المصاحبة", r"(?:خامساً|خامسًا)[:\s]*الطلبات\s+الإجرائية(?:\s+المصاحبة)?"),
]
SECTION_IDS = [s[0] for s in SECTION_ANCHORS]
SECTION_TITLES = {s[0]: s[1] for s in SECTION_ANCHORS}
# الأقسام الخمسة كلها إلزامية بنص القاعدة 13 في build_system_prompt — مفيش
# قسم "اختياري" ينفع يتمسح بالكامل من الشات.
MANDATORY_SECTION_IDS = set(SECTION_IDS)


def split_memo_into_sections(memo: str) -> tuple[str, list[dict]]:
    """
    يرجع (header, sections):
    - header: كل النص قبل قسم "أولاً" (بسم الله + ديباجة المذكرة).
    - sections: list of {id, title, body} بترتيب القالب.
    بيستخدم نفس دالة التنظيف اللي الـ validators شغالة بيها
    (pipeline._clean_memo_for_parsing) عشان الأقسام المستخرجة هنا تبقى
    متطابقة مع اللي الـ validators بتشوفه.
    """
    cleaned = pipeline._clean_memo_for_parsing(memo)

    matches = []
    search_from = 0
    for sec_id, title, pattern in SECTION_ANCHORS:
        m = re.search(pattern, cleaned[search_from:])
        if not m:
            matches.append((sec_id, title, None, None))
            continue
        start_of_header = search_from + m.start()
        end_of_header = search_from + m.end()
        matches.append((sec_id, title, start_of_header, end_of_header))
        search_from = end_of_header

    first_start = next((m[2] for m in matches if m[2] is not None), len(cleaned))
    header = cleaned[:first_start].strip()

    sections = []
    for i, (sec_id, title, _, body_start) in enumerate(matches):
        if body_start is None:
            sections.append({"id": sec_id, "title": title, "body": ""})
            continue
        next_start = next(
            (matches[j][2] for j in range(i + 1, len(matches)) if matches[j][2] is not None),
            len(cleaned),
        )
        body = cleaned[body_start:next_start].strip()
        sections.append({"id": sec_id, "title": title, "body": body})

    return header, sections


def reconstruct_memo(header: str, sections: list[dict]) -> str:
    """يعيد بناء نص المذكرة الكامل من header + sections — مستخدم بعد أي تعديل
    (save يدوي أو chat-edit) عشان الـ validators تشتغل على النص الكامل الصحيح."""
    parts = [header.strip()]
    for s in sections:
        parts.append(s["title"])
        parts.append(s["body"].strip())
    return "\n\n".join(p for p in parts if p)


def extract_case_metadata(case_facts: str, crime_type: str | None,
                           legal_nature: str | None) -> dict:
    """بيسحب اسم المتهم/التهمة/رقم القضية/المحكمة من نص case_facts المنسّق
    (نفس الصيغة اللي build_case_facts في pipeline.py بيطلعها) — من غير ما
    يلمس pipeline.py نفسه."""
    def grab(label: str) -> Optional[str]:
        m = re.search(rf"{label}\s*:\s*(.+)", case_facts)
        if not m:
            return None
        val = m.group(1).strip()
        return None if val.startswith("[") else val

    return {
        "defendant_name": grab("اسم المتهم"),
        "charge": grab("نوع الجريمة"),
        "case_number": grab("رقم القضية"),
        "court": grab("المحكمة"),
        "crime_type": crime_type,
        "legal_nature": legal_nature,
    }


def override_case_facts_fields(case_facts: str, case_number: str | None,
                                court: str | None) -> str:
    """لو المحامية دخلت رقم قضية/محكمة صريح من الفرونت، بيحل محل اللي
    استُخرج تلقائياً من كلامها الحر قبل ما يدخل التوليد."""
    if case_number:
        case_facts = re.sub(r"(رقم القضية\s*:\s*).+", lambda m: m.group(1) + case_number, case_facts)
    if court:
        case_facts = re.sub(r"(المحكمة\s*:\s*).+", lambda m: m.group(1) + court, case_facts)
    return case_facts


def apply_lawyer_info(memo: str, lawyer_name: str | None, lawyer_license: str | None) -> str:
    """استبدال cosmetic بس لاسم/رقم قيد المحامي في تذييل المذكرة — بعد ما
    الـ validation خلص، ومش بيأثر على أي فحص قانوني."""
    if lawyer_name:
        memo = memo.replace("[اسم المحامي]", lawyer_name)
    if lawyer_license:
        memo = memo.replace(
            "المقيد بنقابة المحامين المصريين",
            f"المقيد بنقابة المحامين المصريين برقم {lawyer_license}",
        )
    return memo


def run_legal_checks(memo: str, crime_type: str | None, legal_nature: str | None,
                      case_facts: str) -> list[str]:
    """نفس الفحوصات الحتمية المستخدمة في validate_memo، بس subset مناسب
    لتشغيله بعد كل تعديل شات (من غير إعادة الناقد الـ LLM الكامل عشان
    السرعة) — الهدف إننا نلتقط أي مخالفة قانونية اتسببت فيها تعديل الشات."""
    warnings: list[str] = []
    warnings += pipeline.check_crime_type_contamination(memo, crime_type, case_facts)
    warnings += pipeline.check_procedural_substantive_mixup(memo)
    warnings += pipeline.check_procedural_in_substantive_section(memo)
    warnings += pipeline.check_intent_vs_negligence_logic(memo, legal_nature)
    warnings += pipeline.check_fewshot_leak(memo)
    return warnings


# ── Job store ────────────────────────────────────────────────────────────────
class JobStatus:
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_work_queue: "queue.Queue[str]" = queue.Queue()


class _StageTracker:
    """كائن file-like بنمرره لـ redirect_stdout عشان نلقط print() الصادرة من
    pipeline.py ونحدّث بيها آخر مرحلة ظاهرة للفرونت — من غير ما نضيف أي
    سطر جديد جوه pipeline.py نفسه."""
    def __init__(self, job_id: str):
        self.job_id = job_id

    def write(self, text: str):
        sys.__stdout__.write(text)
        stripped = text.strip()
        if not stripped:
            return
        with _jobs_lock:
            job = _jobs.get(self.job_id)
            if job is not None:
                job["last_log"] = stripped
                job["logs"].append(stripped)
                m = re.search(r"\[(\d)/(\d)\]", stripped)
                if m:
                    job["stage"] = stripped
                    job["progress"] = int(m.group(1)) / int(m.group(2))

    def flush(self):
        sys.__stdout__.flush()


def _run_job(job_id: str):
    with _jobs_lock:
        job = _jobs[job_id]
        job["status"] = JobStatus.PROCESSING
        job["started_at"] = datetime.now(timezone.utc).isoformat()
        job_input = job["input"]

    tracker = _StageTracker(job_id)
    try:
        with redirect_stdout(tracker):
            case_facts = pipeline.build_case_from_freetext(job_input["raw_text"])
            case_facts = override_case_facts_fields(
                case_facts, job_input.get("case_number"), job_input.get("court")
            )
            result = pipeline.draft_defense_memo(case_facts)

        final_memo = apply_lawyer_info(
            result["memo"], job_input.get("lawyer_name"), job_input.get("lawyer_license")
        )
        header, sections = split_memo_into_sections(final_memo)
        case_metadata = extract_case_metadata(
            case_facts, result["crime_type"], result["legal_nature"]
        )
        if job_input.get("lawyer_name"):
            case_metadata["lawyer_name"] = job_input["lawyer_name"]
        if job_input.get("lawyer_license"):
            case_metadata["lawyer_license"] = job_input["lawyer_license"]

        with _jobs_lock:
            job["status"] = JobStatus.COMPLETED
            job["progress"] = 1.0
            job["finished_at"] = datetime.now(timezone.utc).isoformat()
            job["chat_history"] = []
            job["result"] = {
                "memo": final_memo,
                "header": header,
                "sections": sections,
                "case_metadata": case_metadata,
                "crime_type": result["crime_type"],
                "legal_nature": result["legal_nature"],
                "correction_rounds": result["correction_rounds"],
                "validation": {
                    "passed": result["validation"]["passed"],
                    "structural_score": result["validation"]["structural_score"],
                    "unverified_articles": result["validation"]["unverified_articles"],
                    "contamination_warnings": result["validation"]["contamination_warnings"],
                    "critic_issues": result["validation"]["critic_issues"],
                },
                "case_facts": case_facts,
            }
    except Exception as e:
        with _jobs_lock:
            job["status"] = JobStatus.FAILED
            job["finished_at"] = datetime.now(timezone.utc).isoformat()
            job["error"] = str(e)
            job["traceback"] = traceback.format_exc()


def _worker_loop():
    while True:
        job_id = _work_queue.get()
        try:
            _run_job(job_id)
        finally:
            _work_queue.task_done()


_worker_thread = threading.Thread(target=_worker_loop, daemon=True)
_worker_thread.start()


# ── Chat-edit logic ──────────────────────────────────────────────────────────
DELETE_KEYWORDS = ["امسح", "احذف", "شيل", "الغي", "الغِ", "أزيل", "ازال"]


def _classify_target_section(message: str, sections: list[dict]) -> str:
    """استدعاء LLM خفيف يحدد أي قسم من الخمسة المقصود بطلب التعديل."""
    listing = "\n".join(f"- {s['id']}: {s['title']}" for s in sections)
    prompt = f"""أنت تصنّف طلبات تعديل على مذكرة دفاع قانونية. الأقسام المتاحة:
{listing}

طلب المحامية: "{message}"

أخرجي فقط الـ id بتاع القسم الأنسب لهذا الطلب من القائمة أعلاه بالحرف
(مثال: waqai) — بدون أي شرح. لو الطلب مش واضح لأي قسم بالتحديد، أخرجي: unclear"""
    response = pipeline.llm.chat.completions.create(
        model=pipeline.LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0, max_tokens=15,
    )
    result = response.choices[0].message.content.strip()
    return result if result in SECTION_IDS else "unclear"


def _rewrite_section(section: dict, message: str, crime_type: str | None,
                      legal_nature: str | None) -> str:
    """يعيد صياغة قسم واحد بس بناءً على طلب الشات، مع الالتزام بنفس
    التوجيهات القانونية المستخدمة وقت التوليد الأصلي (من قواميس pipeline.py
    الجاهزة — من غير إعادة استرجاع RAG من جديد)."""
    specific_guidance = pipeline.CRIME_SPECIFIC_DEFENSE_GUIDANCE.get(
        crime_type, pipeline.DEFAULT_CRIME_GUIDANCE
    )
    nature_guidance = pipeline.NATURE_GUIDANCE.get(legal_nature, "")

    prompt = f"""أنت محامٍ مصري مخضرم بتعدّل قسم واحد بس من مذكرة دفاع بناءً على
طلب زميلتك المحامية. لا تكتبي مقدمات ولا تعليقات — أخرجي نص القسم المعدّل فقط.

عنوان القسم: {section['title']}

النص الحالي للقسم:
{section['body']}

طلب التعديل: {message}

قيود إلزامية يجب الالتزام بها:
- التزمي بنفس أسلوب الهجوم القانوني الرصين المستخدم في باقي المذكرة.
- ممنوع اختراع أرقام مواد قانونية أو أرقام طعون غير موجودة أصلاً في النص الحالي.
- توجيه خاص بنوع الجريمة ({crime_type or 'غير محدد'}): {specific_guidance}
- توجيه الركن المعنوي: {nature_guidance}
- لو القسم من الدفوع الشكلية أو الموضوعية، حافظي على التصنيف الصحيح (لا تخلطي
  دفعاً إجرائياً مع دفع موضوعي أو العكس).

أخرجي نص القسم الجديد فقط:"""

    response = pipeline.llm.chat.completions.create(
        model=pipeline.LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2, max_tokens=1500,
    )
    return response.choices[0].message.content.strip()


def _handle_chat_edit(job: dict, message: str) -> dict:
    result = job["result"]
    sections = result["sections"]
    crime_type = result["crime_type"]
    legal_nature = result["legal_nature"]

    target_id = _classify_target_section(message, sections)
    is_delete_request = any(k in message for k in DELETE_KEYWORDS)

    if target_id == "unclear":
        return {
            "reply": "مش واضحلي تعديلك ده يخص أي قسم من المذكرة (الوقائع/الدفوع الشكلية/"
                     "الدفوع الموضوعية/الطلبات الختامية/الطلبات الإجرائية) — ممكن توضحي أكتر؟",
            "updated_sections": None,
            "change_card": None,
            "warnings": [],
        }

    if is_delete_request and target_id in MANDATORY_SECTION_IDS:
        title = SECTION_TITLES[target_id]
        return {
            "reply": f"معلش، قسم \"{title}\" إلزامي في أي مذكرة دفاع قانونياً ومينفعش يتمسح "
                     f"بالكامل — لو فيه جزء بس عاوزة تختصريه أو تعدّليه، قوليلي بالظبط إيه.",
            "updated_sections": None,
            "change_card": None,
            "warnings": [],
        }

    section = next(s for s in sections if s["id"] == target_id)
    old_body = section["body"]
    new_body = _rewrite_section(section, message, crime_type, legal_nature)

    updated_sections = [
        {**s, "body": new_body} if s["id"] == target_id else s for s in sections
    ]
    new_memo = reconstruct_memo(result["header"], updated_sections)
    warnings = run_legal_checks(new_memo, crime_type, legal_nature, result["case_facts"])

    result["sections"] = updated_sections
    result["memo"] = new_memo

    reply = f"عدّلت \"{SECTION_TITLES[target_id]}\" حسب طلبك."
    if warnings:
        reply += " ⚠️ لاحظي: " + " | ".join(warnings)

    return {
        "reply": reply,
        "updated_sections": updated_sections,
        "change_card": {
            "section_id": target_id,
            "section_title": SECTION_TITLES[target_id],
            "old_text": old_body,
            "new_text": new_body,
        },
        "warnings": warnings,
    }


# ── Request/Response models ─────────────────────────────────────────────────

# ── Router Agent ────────────────────────────────────────────────────────────
ROUTER_SYSTEM_PROMPT = """أنت المساعد الذكي في نظام "مُحَكِّم" القانوني. المستخدم يتحدث معك في الشاشة الرئيسية قبل تنفيذ أي مهمة.

مهمتك:
1. فهم ما يريد المستخدم من رسالته الحالية + سياق المحادثة السابقة
2. تصنيف النية (intent) إلى أحد الأنواع:
   - memo: إعداد مذكرة دفاع / لائحة دفاع / مرافعة
   - contract: صياغة عقد / إنشاء اتفاقية
   - review: مراجعة عقد / فحص عقد / تحليل مخاطر
   - research: بحث قانوني / مواد / أحكام
   - consultation: استشارة قانونية / سؤال عام (الافتراضي)
3. الرد بالمحتوى المناسب

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


class RouterMessage(BaseModel):
    role: str
    text: str


class RouterRequest(BaseModel):
    messages: list[RouterMessage]
    current_text: str


class RouterResponse(BaseModel):
    intent: str
    should_route: bool
    is_reference: bool
    response: str
    enriched_prompt: str


_ROUTER_KEYWORDS: dict[str, list[str]] = {
    "memo": ["مذكرة", "دفاع", "مرافعة", "لائحة"],
    "contract": ["عقد", "صياغة", "اتفاقية", "بنود", "عقود"],
    "review": ["مراجعة", "راجع", "فحص", "تدقيق", "تحليل"],
    "research": ["بحث", "مقال", "مادة", "قانون", "حكم", "سابقة"],
}


def _keyword_fallback_router(text: str, history_text: str) -> dict:
    """Fallback keyword-based routing when LLM is unavailable."""
    lower = text.lower()
    best_intent = "consultation"
    best_score = 0
    for intent_type, kws in _ROUTER_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_intent = intent_type

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

        response = pipeline.llm.chat.completions.create(
            model=pipeline.LLM_MODEL,
            messages=conversation,
            temperature=0.1,
            max_tokens=600,
        )
        raw = response.choices[0].message.content.strip()
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


# ── Request/Response models ─────────────────────────────────────────────────
class GenerateMemoRequest(BaseModel):
    raw_text: str          # كلام المحامية الحر بالكامل — نفس USER_RAW_INPUT
    court: Optional[str] = None
    case_number: Optional[str] = None
    lawyer_name: Optional[str] = None
    lawyer_license: Optional[str] = None


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    stage: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None


class SaveSectionsRequest(BaseModel):
    sections: list[dict]   # [{id, title, body}, ...] — نفس شكل اللي رجع من generate


class ChatEditRequest(BaseModel):
    job_id: str
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    try:
        collections = pipeline.qdrant.get_collections().collections
        return {"status": "ok", "qdrant_collections": [c.name for c in collections]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Qdrant unreachable: {e}")


@app.post("/api/memo/generate", response_model=JobResponse)
def generate_memo(payload: GenerateMemoRequest):
    """بيبدأ job (استرجاع → توليد → تحقق → تصحيح، من دقيقة لـ3 دقايق) ويرجع
    job_id على طول. اعملي polling على GET /api/memo/{job_id} لحد ما status
    يبقى completed — ده اللي بيغذي شاشة اللودينج."""
    if not payload.raw_text or not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text فاضي")

    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
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
        }
    _work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED)


@app.get("/api/memo/{job_id}", response_model=JobStatusResponse)
def get_memo(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        return JobStatusResponse(
            job_id=job_id,
            status=job["status"],
            progress=job["progress"],
            stage=job.get("stage"),
            result=job.get("result"),
            error=job.get("error"),
        )


@app.get("/api/memo/{job_id}/logs")
def get_memo_logs(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        return {"job_id": job_id, "logs": job["logs"]}


@app.post("/api/memo/{job_id}/save")
def save_memo(job_id: str, payload: SaveSectionsRequest):
    """لحفظ تعديلات يدوية عملتها المحامية في الفرونت (contentEditable) —
    بيعيد بناء نص المذكرة الكامل من الأقسام المعدّلة عشان أي chat-edit
    بعد كده يشتغل على النسخة المحفوظة."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="المذكرة لسه مش جاهزة")

        result = job["result"]
        result["sections"] = payload.sections
        result["memo"] = reconstruct_memo(result["header"], payload.sections)
        return {"success": True}


@app.post("/api/memo/chat")
def chat_edit(payload: ChatEditRequest):
    """شات تفاعلي حقيقي: بيحدد أي قسم المحامية قاصداه، يعدّله عبر الـ LLM،
    يشغّل عليه نفس فحوصات pipeline.py القانونية (تلوث أنواع جرائم، خلط
    شكلي/موضوعي، تعارض قصد/خطأ)، ويرفض حذف أي قسم إلزامي بدل ما ينفذ أي
    أمر حرفياً."""
    with _jobs_lock:
        job = _jobs.get(payload.job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="المذكرة لسه مش جاهزة")

    try:
        response = _handle_chat_edit(job, payload.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل التعديل: {e}")

    with _jobs_lock:
        job["chat_history"].append({"role": "user", "message": payload.message})
        job["chat_history"].append({"role": "assistant", "message": response["reply"]})

    return response


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


def _reconstruct_contract(preamble: str, clauses: list[dict], closing: str) -> str:
    """يعيد بناء نص العقد الكامل."""
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

        contract_text = result.get("contract_text")
        if not contract_text:
            raise RuntimeError("لم يتم توليد نص العقد")

        preamble, closing, clauses = _parse_contract_clauses(contract_text)

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
                "contract_type_key": result.get("contract_type_key"),
                "contract_type_ar": cp.load_clause_types().get(
                    result.get("contract_type_key", ""), {}
                ).get("contract_type_ar", ""),
                "clause_validation": result.get("clause_validation", {}),
                "docx_path": result.get("docx_path"),
            }
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


def _handle_contract_chat_edit(job: dict, message: str) -> dict:
    result = job["result"]
    clauses = result["clauses"]
    contract_type_ar = result.get("contract_type_ar", "")

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

class GenerateContractRequest(BaseModel):
    query: str


class ContractChatEditRequest(BaseModel):
    job_id: str
    message: str


# ── Contract Endpoints ──────────────────────────────────────────────────────

@app.post("/api/contract/generate", response_model=JobResponse)
def generate_contract_endpoint(payload: GenerateContractRequest):
    """يبدأ توليد عقد ويرجع job_id — الفرونت يعمل polling."""
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="query فاضي")

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
        }
    _contract_work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED)


@app.get("/api/contract/{job_id}", response_model=JobStatusResponse)
def get_contract(job_id: str):
    with _contract_jobs_lock:
        job = _contract_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        return JobStatusResponse(
            job_id=job_id,
            status=job["status"],
            progress=job["progress"],
            stage=job.get("stage"),
            result=job.get("result"),
            error=job.get("error"),
        )


@app.post("/api/contract/chat")
def contract_chat_edit(payload: ContractChatEditRequest):
    """شات تعديل العقد: يحدد البند المقصود ويعيد صياغته."""
    with _contract_jobs_lock:
        job = _contract_jobs.get(payload.job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
        if job["status"] != JobStatus.COMPLETED:
            raise HTTPException(status_code=409, detail="العقد لسه مش جاهز")

    try:
        response = _handle_contract_chat_edit(job, payload.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل تعديل العقد: {e}")

    with _contract_jobs_lock:
        job["chat_history"].append({"role": "user", "message": payload.message})
        job["chat_history"].append({"role": "assistant", "message": response["reply"]})

    return response


@app.get("/api/contract/{job_id}/logs")
def get_contract_logs(job_id: str):
    with _contract_jobs_lock:
        job = _contract_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
    return {"job_id": job_id, "logs": job["logs"]}


@app.get("/api/contract/{job_id}/download")
def download_contract_docx(job_id: str):
    """يرجع ملف الـ docx كملف للتحميل."""
    with _contract_jobs_lock:
        job = _contract_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id مش موجود")
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
