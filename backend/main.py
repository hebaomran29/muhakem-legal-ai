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
from pydantic import BaseModel

from memo import pipeline  # نفس ملف الـ pipeline من غير أي تعديل منطقي
from consultation import legal_agent  # نفس منطق الاستشارة من غير أي تعديل
from db import repo
from db import client as db_client
from auth import CurrentUser, get_current_user, try_get_current_user, require_session_access

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
    parts = [(header or "").strip()]
    for s in sections:
        parts.append(s.get("title") or "")
        parts.append((s.get("body") or "").strip())
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
                "sources": result.get("sources", {}),
            }

        # ── حفظ دائم في الداتابيز (best-effort — لو فشل، الجلسة الحالية
        #    فضلت شغالة عادي زي الأول، بس مش هتلاقيها لو رجعتي تاني) ──
        db_session_id = job.get("db_session_id")
        if db_session_id:
            try:
                repo.save_memo_result(
                    db_session_id, sections, case_metadata,
                    result.get("sources", {}), final_memo,
                )
                # عنوان مختصر في السايد بار بدل أول 60 حرف من كلام المحامية
                # الحر (اللي كان بيطلع فقرة كاملة) — لو قدرنا نستخرج نوع
                # الجريمة/اسم المتهم من case_metadata نستخدمهم، وإلا نسيب
                # العنوان زي ما هو (أول 60 حرف، اتحطوا وقت إنشاء الجلسة)
                short_title = " — ".join(
                    p for p in (case_metadata.get("crime_type"), case_metadata.get("defendant_name")) if p
                )
                repo.touch_session(db_session_id, title=short_title or None)
            except Exception as e:
                print(f"⚠️ فشل حفظ نتيجة المذكرة في الداتابيز: {e}")
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
    try:
        result = pipeline.llm_text([{"role": "user", "content": prompt}],
                                    temperature=0.0, max_tokens=15)
    except RuntimeError:
        return "unclear"
    return result if result in SECTION_IDS else "unclear"


TASK_LABELS = {
    "memo": "مذكرة دفاع",
    "contract": "صياغة عقد",
    "review": "مراجعة عقد",
    "research": "بحث قانوني",
    "consultation": "استشارة قانونية",
}


def _classify_chat_action(message: str, current_task: str) -> dict:
    """الراوتر الموحّد لأي شات تعديل (مذكرة أو عقد) — نداء LLM واحد بيحدد
    واحدة من 3 حالات، مش اتنين بس زي _classify_chat_intent القديمة:
      - edit: تعديل/حذف/إعادة صياغة جزء من {current_task} الحالية
      - question: سؤال معلوماتي عن {current_task} الحالية من غير تعديل
      - switch_task: طلب مهمة مختلفة تمامًا (مش استكمال لنفس المهمة الحالية)

    ده اللي بيسد الفجوة اللي كانت موجودة: قبل كده لو المحامية جوه شات
    المذكرة كتبت "عايزة كمان أعمل عقد إيجار"، الشات كان يحاول يفهمها كتعديل
    أو سؤال عن المذكرة نفسه، من غير أي وعي إنها بتطلب مهمة تانية خالص.

    Fail-safe: أي غموض أو فشل في الرد → ترجع "edit" (السلوك الأصلي قبل
    الإضافة دي) عشان منكسرش حاجة شغالة."""
    other_tasks = ", ".join(f"{k} ({v})" for k, v in TASK_LABELS.items() if k != current_task)
    prompt = f"""أنتِ الراوتر الموحّد في نظام "مُحَكِّم" القانوني. المستخدم حالياً
جوه شاشة "{TASK_LABELS.get(current_task, current_task)}" بيتكلم في شات التعديل بتاعها.

صنّفي رسالته كواحدة من 3 حالات بس:
- "edit": طلب تعديل/حذف/إعادة صياغة جزء من {TASK_LABELS.get(current_task, current_task)} الحالية
- "question": سؤال معلوماتي عن {TASK_LABELS.get(current_task, current_task)} الحالية
  (مرجع قانوني، توضيح، سبب) من غير طلب تعديل
- "switch_task": طلب مهمة مختلفة تمامًا مش استكمال لـ {TASK_LABELS.get(current_task, current_task)}
  الحالية — يعني عايزة تبدأ واحدة من: {other_tasks}

⚠️ لو الرسالة ممكن تتفهم كتعديل على نفس القضية الحالية (حتى لو مش واضح
100%)، صنّفيها "edit" أو "question" — متفترضيش switch_task إلا لو صريح
إن المستخدم بيتكلم عن قضية أو مهمة مختلفة تمامًا.

رسالة المستخدم: "{message}"

لو switch_task، حددي كمان new_intent من: memo, contract, review, research, consultation

أجب بـ JSON فقط بدون أي نص إضافي:
{{"action": "edit|question|switch_task", "new_intent": "..." أو null}}"""

    fallback = {"action": "edit", "new_intent": None}
    try:
        raw = pipeline.llm_text([{"role": "user", "content": prompt}],
                                 temperature=0.0, max_tokens=60)
    except RuntimeError:
        return fallback

    raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except Exception:
        return fallback

    action = data.get("action") if data.get("action") in ("edit", "question", "switch_task") else "edit"
    new_intent = data.get("new_intent") if data.get("new_intent") in TASK_LABELS else None
    if action == "switch_task" and new_intent is None:
        action = "edit"  # لو مش متأكدة من نوع المهمة الجديدة، متسيبهاش تعلّق فاضي
    return {"action": action, "new_intent": new_intent}


def _format_sources_for_chat(sources: dict) -> str:
    """يبني نص مختصر بالمصادر (أحكام نقض + مواد قانونية) اللي اتجابت
    وقت توليد المذكرة، عشان الشات يقدر يستشهد بيها لو المحامية سألت."""
    if not sources:
        return "لا توجد مصادر محفوظة لهذه المذكرة."

    blocks = []
    cassation = sources.get("cassation") or []
    if cassation:
        lines = []
        for c in cassation:
            meta = c.get("metadata", {})
            ref = meta.get("ruling_num") or meta.get("ruling_number") or ""
            year = meta.get("ruling_year") or meta.get("year") or ""
            label = f"طعن رقم {ref} لسنة {year}" if ref else c.get("title", "حكم نقض")
            blocks.append(f"[{label}]\n{c.get('content', '')[:500]}")
        blocks.insert(0, "## أحكام نقض:")

    laws = (sources.get("laws") or []) + (sources.get("laws2") or [])
    if laws:
        law_lines = ["## مواد قانونية:"]
        for l in laws:
            title = l.get("title", "")
            art = l.get("article_num", "")
            label = f"{title} - مادة {art}" if art else title
            law_lines.append(f"[{label}]\n{l.get('content', '')[:500]}")
        blocks.extend(law_lines)

    return "\n\n".join(blocks) if blocks else "لا توجد مصادر محفوظة لهذه المذكرة."


def _answer_legal_question(message: str, sources: dict, sections: list[dict]) -> str:
    """يرد على سؤال معلوماتي بالاستناد فقط للمصادر المحفوظة وقت التوليد —
    من غير ما يعدّل المذكرة، ومن غير اختراع مراجع مش موجودة فعلاً."""
    sources_text = _format_sources_for_chat(sources)
    sections_text = "\n\n".join(f"### {s['title']}\n{s['body']}" for s in sections)

    prompt = f"""أنتِ مساعدة قانونية بترد على سؤال محامية بخصوص مذكرة دفاع كتبتها.
جاوبي بالاستناد فقط للمصادر الموجودة تحت — ممنوع تخترعي رقم طعن أو مادة قانونية
مش موجودة في المصادر دي. لو السؤال عن مرجع مش موجود في المصادر، قولي بوضوح
إن المرجع ده مش من ضمن اللي استُخدم وقت التوليد.

## نص المذكرة الحالي:
{sections_text}

## المصادر المستخدمة وقت التوليد:
{sources_text}

## سؤال المحامية:
{message}

جاوبي بإيجاز ودقة، واذكري المرجع المحدد (رقم الطعن أو المادة) لو موجود:"""

    return pipeline.llm_text([{"role": "user", "content": prompt}],
                              temperature=0.1, max_tokens=600)


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

    return pipeline.llm_text([{"role": "user", "content": prompt}],
                              temperature=0.2, max_tokens=1500)


def _handle_chat_edit(job: dict, message: str) -> dict:
    result = job["result"]
    sections = result["sections"]
    crime_type = result["crime_type"]
    legal_nature = result["legal_nature"]

    action = _classify_chat_action(message, "memo")
    if action["action"] == "switch_task":
        new_intent = action["new_intent"]
        return {
            "reply": f"تمام، فهمت إنك عايزة {TASK_LABELS[new_intent]} — هحوّلك دلوقتي.",
            "updated_sections": None,
            "change_card": None,
            "warnings": [],
            "switch_task": {"intent": new_intent, "enriched_prompt": message},
        }
    if action["action"] == "question":
        answer = _answer_legal_question(message, result.get("sources", {}), sections)
        return {
            "reply": answer,
            "updated_sections": None,
            "change_card": None,
            "warnings": [],
            "switch_task": None,
        }

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

class ConsultationChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ConsultationChatResponse(BaseModel):
    session_id: Optional[str] = None
    reply: str
    needs_clarification: bool
    routing: Optional[dict] = None


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
class GenerateMemoRequest(BaseModel):
    raw_text: str          # كلام المحامية الحر بالكامل — نفس USER_RAW_INPUT
    court: Optional[str] = None
    case_number: Optional[str] = None
    lawyer_name: Optional[str] = None
    lawyer_license: Optional[str] = None


class JobResponse(BaseModel):
    job_id: str
    status: str
    db_session_id: Optional[str] = None


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
def generate_memo(payload: GenerateMemoRequest, user: CurrentUser = Depends(get_current_user)):
    """بيبدأ job (استرجاع → توليد → تحقق → تصحيح، من دقيقة لـ3 دقايق) ويرجع
    job_id على طول. اعملي polling على GET /api/memo/{job_id} لحد ما status
    يبقى completed — ده اللي بيغذي شاشة اللودينج.

    تسجيل الدخول بقى إجباري هنا (مش try_get_current_user زي الأول) —
    كل مذكرة لازم تتربط بمستخدمة محددة من الأول عشان الـ session تتحفظ
    وتتفلتر صح بعدين (created_by)."""
    if not payload.raw_text or not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text فاضي")

    db_session_id = None
    try:
        session_row = repo.create_session(
            user.firm_id, user.user_id, "memo",
            title=payload.raw_text.strip()[:60], prompt=payload.raw_text,
        )
        db_session_id = str(session_row["id"])
    except Exception as e:
        print(f"⚠️ فشل حفظ الجلسة في الداتابيز (هتكمل من غير حفظ دائم): {e}")

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
            "db_session_id": db_session_id,
        }
    _work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED, db_session_id=db_session_id)


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

    response.setdefault("switch_task", None)

    with _jobs_lock:
        job["chat_history"].append({"role": "user", "message": payload.message})
        job["chat_history"].append({"role": "assistant", "message": response["reply"]})

    db_session_id = job.get("db_session_id")
    if db_session_id:
        try:
            repo.append_chat_message(db_session_id, "user", payload.message)
            repo.append_chat_message(db_session_id, "assistant", response["reply"],
                                      change_card=response.get("change_card"))
            # لو التعديل فعلاً غيّر الأقسام، خزّني النسخة المحدّثة كمان
            if response.get("updated_sections") is not None:
                result = job["result"]
                repo.save_memo_result(
                    db_session_id, result["sections"], result["case_metadata"],
                    result.get("sources", {}), result["memo"],
                )
            repo.touch_session(db_session_id)
        except Exception as e:
            print(f"⚠️ فشل حفظ رسائل الشات في الداتابيز: {e}")

    return response


class ResumeResponse(BaseModel):
    job_id: str
    status: str
    db_session_id: Optional[str] = None
    chat_history: list[dict] = []


@app.post("/api/memo/{session_id}/resume", response_model=ResumeResponse)
def resume_memo(session_id: str, user: CurrentUser = Depends(get_current_user)):
    """بتفعّل جلسة مذكرة قديمة (اتقفلت الصفحة أو السيرفر عمل ريستارت) عشان
    الشات يقدر يكمل عليها — بتبني _jobs entry جديدة من النتيجة المحفوظة في
    memo_results + تاريخ الشات من chat_messages، وترجع job_id جديد تستخدمه
    الفرونت في /api/memo/chat و/api/memo/{job_id}/save زي أي جلسة عادية
    (بديل عن setMemoJobId(null) اللي كانت بتمنع أي تعديل بعد إعادة فتح الجلسة)."""
    require_session_access(session_id, user)
    session = repo.get_session(session_id)
    if session is None or session.get("type") != "memo":
        raise HTTPException(status_code=404, detail="جلسة مذكرة مش موجودة")

    memo_result = repo.get_memo_result(session_id)
    if memo_result is None:
        raise HTTPException(status_code=409, detail="مفيش نتيجة محفوظة للمذكرة دي لسه")

    memo_text = memo_result.get("memo_text") or ""
    header, split_sections = split_memo_into_sections(memo_text)
    # الأقسام المحفوظة (ممكن تكون اتعدلت يدوي أو بالشات) بتتفضّل على الـ
    # split التلقائي — لكن الـ header مش متخزن لوحده في الداتابيز فلازم من
    # الـ split دايماً
    sections = memo_result.get("sections") or split_sections
    case_metadata = memo_result.get("case_metadata") or {}

    # case_facts الكامل (بالوقائع/الأقوال التفصيلية) مش متخزن في الداتابيز —
    # بنبني نسخة مختصرة منه من case_metadata عشان فحوصات run_legal_checks
    # (زي check_crime_type_contamination) تفضل شغالة على أي تعديل شات بعد
    # الاستئناف، حتى من غير نفس التفاصيل السردية الكاملة اللي كانت موجودة
    # وقت التوليد الأول
    case_facts_lite = "\n".join(
        f"{label}: {case_metadata.get(key) or '[غير محدد]'}"
        for label, key in (
            ("اسم المتهم", "defendant_name"),
            ("نوع الجريمة", "charge"),
            ("رقم القضية", "case_number"),
            ("المحكمة", "court"),
        )
    )

    db_chat_history = repo.get_chat_history(session_id)

    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "status": JobStatus.COMPLETED,
            "progress": 1.0,
            "stage": None,
            "logs": [],
            "last_log": None,
            "input": {"raw_text": session.get("prompt") or ""},
            "result": {
                "memo": memo_text,
                "header": header,
                "sections": sections,
                "case_metadata": case_metadata,
                "crime_type": case_metadata.get("crime_type"),
                "legal_nature": case_metadata.get("legal_nature"),
                "correction_rounds": None,
                "validation": None,
                "case_facts": case_facts_lite,
                "sources": memo_result.get("sources") or {},
            },
            "error": None,
            "chat_history": [
                {"role": m["role"], "message": m["text"]} for m in db_chat_history
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "db_session_id": session_id,
        }

    return ResumeResponse(
        job_id=job_id, status=JobStatus.COMPLETED,
        db_session_id=session_id, chat_history=db_chat_history,
    )


@app.post("/api/contract/{session_id}/resume", response_model=ResumeResponse)
def resume_contract(session_id: str, user: CurrentUser = Depends(get_current_user)):
    """نفس فكرة resume_memo بس للعقود. تنويه: preamble/closing (مقدمة
    العقد وخاتمة التوقيعات) مش متخزنين في contract_results — بس البنود
    (clauses) ونوع العقد. يعني العقد المُعاد بناؤه هنا من غير مقدمة ولا
    خاتمة توقيعات؛ لو الشات بعد الاستئناف عدّل وحفظ، هتفتقد الجزءين دول
    من النسخة النهائية. لتفادي كده بالكامل لازم schema change (تخزين
    preamble/closing كمان في contract_results) — مش متعمول لسه."""
    require_session_access(session_id, user)
    session = repo.get_session(session_id)
    if session is None or session.get("type") != "contract":
        raise HTTPException(status_code=404, detail="جلسة عقد مش موجودة")

    contract_result = repo.get_contract_result(session_id)
    if contract_result is None:
        raise HTTPException(status_code=409, detail="مفيش نتيجة محفوظة للعقد ده لسه")

    clauses = contract_result.get("clauses") or []
    contract_type_ar = contract_result.get("contract_type_ar") or ""
    contract_text = _reconstruct_contract("", clauses, "")  # من غير preamble/closing — شايفة التنويه فوق

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
                "preamble": "",
                "closing": "",
                "clauses": clauses,
                "contract_type_key": None,
                "contract_type_ar": contract_type_ar,
                "clause_validation": {},
                "docx_path": None,
            },
            "error": None,
            "chat_history": [
                {"role": m["role"], "message": m["text"]} for m in db_chat_history
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "db_session_id": session_id,
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

        db_session_id = job.get("db_session_id")
        if db_session_id:
            try:
                repo.save_contract_result(
                    db_session_id, clauses, job["result"]["contract_type_ar"],
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

class GenerateContractRequest(BaseModel):
    query: str


class ContractChatEditRequest(BaseModel):
    job_id: str
    message: str


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
        }
    _contract_work_queue.put(job_id)
    return JobResponse(job_id=job_id, status=JobStatus.QUEUED, db_session_id=db_session_id)


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
                repo.save_contract_result(db_session_id, result["clauses"], result.get("contract_type_ar"))
            repo.touch_session(db_session_id)
        except Exception as e:
            print(f"⚠️ فشل حفظ رسائل شات العقد في الداتابيز: {e}")

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


# ═══════════════════════════════════════════════════════════════════════════
# ── Firms & Sessions (الداتابيز الدائمة) ────────────────────────────────
# مطلوب Authorization: Bearer <supabase_access_token> على كل الـ endpoints دي
# ═══════════════════════════════════════════════════════════════════════════

class CreateFirmRequest(BaseModel):
    name: str


@app.post("/api/firms")
def create_firm(payload: CreateFirmRequest, user: CurrentUser = Depends(get_current_user)):
    """أول مرة يسجّل فيها المستخدم دخول ومعندوش مكتب — بينشئله مكتب جديد
    وهو الـ owner بتاعه. لو عنده مكتب بالفعل، استخدمي /api/firms/invite
    بدل ما تعملي واحد جديد.

    من مرحلة Phase 1: الـ endpoint ده بقى مستخدم كمان تلقائيًا من الفرونت
    (auth.tsx) عشان يوفّر "مساحة عمل شخصية" (personal firm) غير ظاهرة
    للمستخدمة بمجرد ما تسجّل — دي حل توافقي مؤقت (compatibility) لحد ما
    نلغي firm_id كـ NOT NULL FK في السكيما مستقبلًا، مش Firm حقيقية
    بمعنى multi-member. بنعيد التحقق من firm_ids هنا (مش بس عند فك
    التوكن) عشان نقلل نافذة الـ race لو حصلت نداءات متوازية من نفس
    المستخدمة (مش ضمان كامل من غير unique constraint في الداتابيز، لكنه
    كافي لسيناريوهات الاستخدام العادية)."""
    if user.firm_ids:
        raise HTTPException(status_code=409, detail="المستخدم عضو في مكتب بالفعل")
    fresh_firm_ids = repo.get_user_firm_ids(user.user_id)
    if fresh_firm_ids:
        raise HTTPException(status_code=409, detail="المستخدم عضو في مكتب بالفعل")
    firm = repo.create_firm_with_owner(payload.name.strip() or "مكتبي", user.user_id)
    return firm


class InviteMemberRequest(BaseModel):
    email: str


@app.post("/api/firms/invite")
def invite_member(payload: InviteMemberRequest, user: CurrentUser = Depends(get_current_user)):
    """بتضيف محامية تانية (لازم تكون عملت حساب على Supabase Auth بالفعل
    بنفس الإيميل ده) لنفس مكتب المستخدم الحالي."""
    found_user = db_client.auth_admin_get_user_by_email(payload.email.strip().lower())
    if not found_user:
        raise HTTPException(status_code=404, detail="مفيش حساب مسجّل بالإيميل ده")
    repo.add_member_to_firm(user.firm_id, found_user["id"])
    return {"success": True}


class MeResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    firm_ids: list[str] = []


@app.get("/api/me", response_model=MeResponse)
def get_me(user: "CurrentUser | None" = Depends(try_get_current_user)):
    """المصدر الوحيد والموثوق لمعرفة هل المستخدمة عندها مكتب ولا لأ.
    مقصود إنه يكون مستقل عن أي endpoint تاني (زي /api/sessions اللي
    كانت الطريقة القديمة بتخمّن الحالة من status code بتاعه، وده كان
    بيدّي false positive لـ"معندهاش مكتب" مع أي خطأ عابر). بيرجّع 401
    لو مفيش توكن أصلاً، لكن معندهوش أي حالة "خطأ" تانية — لو المستخدمة
    مسجّلة دخول بس معندهاش مكتب لسه، firm_ids بترجع [] عادي من غير أي
    exception (try_get_current_user و.firm_ids مش .firm_id، فمفيش
    الـ 403 اللي بيطلع من الـ property لو حد نادى عليه)."""
    if user is None:
        raise HTTPException(status_code=401, detail="مفيش توكن مصادقة — سجّلي دخول")
    return MeResponse(user_id=user.user_id, email=user.email, firm_ids=user.firm_ids)


@app.get("/api/sessions")
def list_sessions_endpoint(user: CurrentUser = Depends(get_current_user)):
    """جلسات المستخدم الحالي بس (مذكرات وعقود واستشارات...) — بتغذي الـ
    Sidebar بدل localStorage. مفلترة على created_by مش firm_id بس، عشان
    لو حصل يومًا أكتر من مستخدمة في نفس الـ firm الشخصي (مش متوقع في
    الـ MVP الحالي)، كل واحدة تشوف بس جلساتها هي."""
    return {"sessions": repo.list_sessions(user.firm_id, user.user_id)}


@app.get("/api/sessions/{session_id}")
def get_session_endpoint(session_id: str, user: CurrentUser = Depends(get_current_user)):
    """تفاصيل جلسة واحدة كاملة: بياناتها + النتيجة (مذكرة أو عقد) + كل
    تاريخ الشات — عشان تقدري تفتحيها وتكمّلي التعديل عليها بالشات."""
    require_session_access(session_id, user)
    session = repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="الجلسة دي مش موجودة")

    result = None
    if session["type"] == "memo":
        result = repo.get_memo_result(session_id)
    elif session["type"] == "contract":
        result = repo.get_contract_result(session_id)

    return {
        "session": session,
        "result": result,
        "chat_history": repo.get_chat_history(session_id),
    }


@app.delete("/api/sessions/{session_id}")
def delete_session_endpoint(session_id: str, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    repo.delete_session(session_id)
    return {"success": True}


class PinSessionRequest(BaseModel):
    pinned: bool


@app.post("/api/sessions/{session_id}/pin")
def pin_session_endpoint(session_id: str, payload: PinSessionRequest, user: CurrentUser = Depends(get_current_user)):
    require_session_access(session_id, user)
    repo.set_pinned(session_id, payload.pinned)
    return {"success": True}