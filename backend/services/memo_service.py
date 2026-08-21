"""Memo domain service: parsing, background jobs, validation, and chat edits."""

import json
import queue
import re
import sys
import threading
import traceback
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Optional

from db import repo
from memo import pipeline


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
