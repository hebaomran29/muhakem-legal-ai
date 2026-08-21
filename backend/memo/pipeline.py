"""Defense memo generation pipeline.

The runtime uses the OpenAI-compatible Ollama endpoint configured by
OLLAMA_BASE_URL. Retrieval uses the configured Qdrant collections and
the Muffakir embedding model.
"""

import os
import re
import time
import json
from openai import OpenAI
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
import numpy as np
from dotenv import load_dotenv

load_dotenv()

print('✅ imports OK')

# ── Runtime configuration (من متغيرات البيئة — املأيها في .env) ───────────
QDRANT_URL = os.environ.get("QDRANT_URL", "")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:14b")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
LLM_NUM_CTX = int(os.environ.get("LLM_NUM_CTX", "4096"))
# التصحيح الكامل يعيد توليد المذكرة وقد يضاعف وقت Qwen 14B.
# الافتراضي السريع 0، ويمكن تفعيله عند الحاجة عبر .env بقيمة 1.
MEMO_MAX_CORRECTION_ROUNDS = int(os.environ.get("MEMO_MAX_CORRECTION_ROUNDS", "0"))
LLM_TIMING_LOG = os.environ.get("LLM_TIMING_LOG", "true").lower() in {"1", "true", "yes"}
MUFFAKIR_MODEL = "mohamed2811/Muffakir_Embedding_V2"


# ── Collection Names ─────────────────────────────────────────────────────────
COL_LAWS = "laws_only"
COL_LAWS2 = "laws_with_commentary"
COL_CASSATION = "cassation_rulings_muffaker_pure"
COL_QA = "legal_qa"
COL_MEMOS = "defense_memos"

SCORE_THRESHOLD = 0.45

# ── Lazy initialization — لا نحمل حاجة في وقت الاستيراد ────────────────
_embedder: SentenceTransformer | None = None
_qdrant: QdrantClient | None = None
_llm: OpenAI | None = None
_pipeline_ready = False


def _ensure_pipeline():
    """يحمّل الموارد (embedder, qdrant, llm) أول مرة بس.
    لو فشل حاجة، السيرفر يشتغل عادي والموارد تبقى None."""
    global _embedder, _qdrant, _llm, _pipeline_ready
    if _pipeline_ready:
        return
    _pipeline_ready = True  # نمنع إعادة المحاولة حتى restart

    # 1) Embedder
    try:
        print("Loading embedding model...")
        _embedder = SentenceTransformer(MUFFAKIR_MODEL, trust_remote_code=True)
        print("✅ Embedder loaded")
    except Exception as e:
        print(f"⚠️ Embedder فشل: {e}")

    # 2) Qdrant
    try:
        if QDRANT_URL and QDRANT_API_KEY:
            _qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, port=443, timeout=30, check_compatibility=False)
            print("✅ Qdrant connected")
            cols = _qdrant.get_collections().collections
            print(f"📦 Collections: {', '.join(c.name for c in cols)}")
        else:
            print("⚠️ QDRANT_URL أو QDRANT_API_KEY مش متوفرين")
    except Exception as e:
        print(f"⚠️ Qdrant فشل: {e}")

    # 3) LLM
    try:
        if OLLAMA_BASE_URL:
            _llm = OpenAI(api_key="ollama", base_url=OLLAMA_BASE_URL)
            print("✅ LLM client ready")
        else:
            print("⚠️ OLLAMA_BASE_URL غير مضبوط")
    except Exception as e:
        print(f"⚠️ LLM client فشل: {e}")


def embed(text: str) -> list[float]:
    _ensure_pipeline()
    if not _embedder:
        raise RuntimeError("Embedder مش متحمّل — تأكد من متطلبات النظام")
    return _embedder.encode([text], normalize_embeddings=True)[0].tolist()


def llm_text(messages: list[dict], temperature: float = 0.2, max_tokens: int = 1500,
             model: str | None = None, retries: int = 1) -> str:
    """نداء موحّد إلى Ollama عبر واجهة OpenAI-compatible.

    يتحقق من وجود نص فعلي في الرد، ويعيد المحاولة مرة واحدة إذا رجع
    المزود محتوى فارغًا، ثم يرفع خطأ واضحًا بدل ترك خطأ ``None.strip()`` غامض.
    قيمة ``num_ctx`` قابلة للضبط من ``LLM_NUM_CTX``، والافتراضي 4096
    مناسب كبداية للأجهزة ذات الذاكرة المحدودة."""
    _ensure_pipeline()
    if not _llm:
        raise RuntimeError("LLM مش متاح — تأكد من تشغيل Ollama وضبط OLLAMA_BASE_URL في ملف .env")

    last_content = None
    started_at = time.perf_counter()
    for attempt in range(retries + 1):
        response = _llm.chat.completions.create(
            model=model or LLM_MODEL, messages=messages,
            temperature=temperature, max_tokens=max_tokens,
            extra_body={"options": {"num_ctx": LLM_NUM_CTX}},
        )
        choice = response.choices[0] if response.choices else None
        content = choice.message.content if choice and choice.message else None
        if content is not None and content.strip():
            if LLM_TIMING_LOG:
                elapsed = time.perf_counter() - started_at
                print(f"⏱️ [LLM] model={model or LLM_MODEL} max_tokens={max_tokens} elapsed={elapsed:.1f}s")
            return content.strip()
        last_content = content

    if LLM_TIMING_LOG:
        elapsed = time.perf_counter() - started_at
        print(f"⏱️ [LLM] failed max_tokens={max_tokens} elapsed={elapsed:.1f}s")
    raise RuntimeError(
        "لم يرجّع نموذج الذكاء الاصطناعي ردًا نصيًا بعد إعادة المحاولة — "
        "غالبًا تعطل مؤقت من Ollama أو النموذج المحلي. جرّبي تاني بعد شوية."
        + (f" [finish_reason: {choice.finish_reason}]" if choice and last_content is None else "")
    )


CRIME_CATEGORIES = {
    "مخدرات": "قضايا حيازة أو اتجار مواد مخدرة حشيش هيروين كوكايين حبوب تخديرية",
    "سلاح وذخيره": "قضايا حيازة أسلحة نارية ذخيرة مسدس بندقية سلاح أبيض بدون ترخيص",
    "تزوير وتقليد": "قضايا تزوير محررات رسمية أو عرفية أو توقيعات أو أختام أو عملة",
    "جرائم اقتصاديه ونصب": "قضايا نصب واحتيال غسيل أموال رشوة شيكات بدون رصيد",
    "خيانة الأمانة": "قضايا خيانة أمانة تبديد أموال أو منقولات إيصال أمانة على بياض عقد وديعة أو وكالة أو عارية استيلاء على مبالغ مالية مؤتمن عليها",
    "قتل ومحاولة قتل عمد": "قضايا قتل عمد أو شبه عمد ضرب مبرح إصابات خطيرة طعن بالسكين إطلاق نار بقصد الإيذاء",
    "قتل خطأ وحوادث سيارات": "قضايا قتل خطأ أو إصابة خطأ نتيجة حادث سيارة أو قيادة بتهور أو رعونة أو تصادم مروري",
    "سرقة وسطو": "قضايا سرقة بالإكراه أو بدون إكراه سطو مسلح سلب انتهاك حرمة منزل أو محل تجاري نشل",
    "جرائم تقنيه معلومات": "قضايا اختراق مواقع أو حسابات هكر ابتزاز إلكتروني جرائم إنترنت تزوير إلكتروني",
    "جرائم اخلاقيه": "قضايا خدش الحياء فعل فاضح دعارة إباحية تحرش",
    "تهريب مهاجرين": "قضايا تهريب بشر أو لاجئين هجرة غير شرعية عبر الحدود",
    "الإضرار والبلاغات": "بلاغ كاذب إهانة موظف عام حرق متعمد تخريب ممتلكات تعطيل مصالح",
    "غش تجاري وتموين": "قضايا غش تجاري تقليد سلع تموينية غش أغذية نقص أوزان عدم مطابقة مواصفات قياسية تعبئة بدون ترخيص",
}

# ── 4.2 الطبيعة القانونية (عمدي / غير عمدي) لكل فئة ─────────────────────
CRIME_LEGAL_NATURE = {
    "مخدرات": "عمدي",
    "سلاح وذخيره": "عمدي",
    "تزوير وتقليد": "عمدي",
    "جرائم اقتصاديه ونصب": "عمدي",
    "خيانة الأمانة": "عمدي",
    "قتل ومحاولة قتل عمد": "عمدي",
    "قتل خطأ وحوادث سيارات": "غير عمدي",
    "سرقة وسطو": "عمدي",
    "جرائم تقنيه معلومات": "عمدي",
    "جرائم اخلاقيه": "عمدي",
    "تهريب مهاجرين": "عمدي",
    "الإضرار والبلاغات": "عمدي",
    "غش تجاري وتموين": "عمدي",
}

# ── 4.3 توجيه الركن المعنوي حسب الطبيعة ──────────────────────────────────
NATURE_GUIDANCE = {
    "عمدي": (
        "هذه جريمة عمدية: الركن المعنوي المطلوب هو القصد الجنائي (العام والخاص). "
        "الدفع الصحيح في الأركان هو 'انتفاء القصد الجنائي'. لا تستخدم عبارات مثل "
        "'انتفاء ركن الخطأ' أو 'استغراق خطأ المجني عليه' — هذه مصطلحات خاصة بالجرائم غير العمدية فقط."
    ),
    "غير عمدي": (
        "⚠️ هذه جريمة غير عمدية (كالقتل الخطأ أو الإصابة الخطأ): القانون يفترض سلفاً "
        "غياب القصد الجنائي فيها، فالركن المعنوي هو 'الخطأ' (إهمال، رعونة، عدم احتراز, "
        "عدم مراعاة القوانين واللوائح) وليس القصد. **ممنوع تماماً** كتابة عبارة 'انتفاء "
        "القصد الجنائي' لأنها هلوسة قانونية هنا (لا معنى لنفي قصد الجريمة أصلاً لا تشترطه). "
        "الدفع الموضوعي الصحيح هو: 'انتفاء ركن الخطأ في جانب المتهم' و/أو "
        "'انقطاع رابطة السببية' و/أو 'استغراق خطأ المجني عليه لخطأ المتهم'."
    ),
}

# ── 4.4 كلمات مفتاحية مرجّحة لكل فئة ─────────────────────────────────────
CRIME_KEYWORDS_WEIGHTED = {
    "مخدرات": {
        "مخدر": 10, "حشيش": 10, "هيروين": 10, "كوكايين": 10, "بانجو": 10, "ترامادول": 9,
        "جوهر مخدر": 9, "الاتجار في المخدر": 10, "الاتجار في مواد مخدرة": 10,
        "إحراز مخدرات": 10, "الاتجار": 1,
    },
    "سلاح وذخيره": {
        "سلاح ناري": 10, "سلاح أبيض": 9, "ذخيرة": 9, "بندقية": 9, "مسدس": 9,
        "حيازة سلاح": 9, "أسلحة وذخائر": 9,
    },
    "تزوير وتقليد": {
        "تزوير": 8, "تقليد": 6, "محرر رسمي": 8, "محرر عرفي": 8, "توقيع مزور": 10,
        "ختم مزور": 9, "عملة مزيفة": 9,
    },
    "جرائم اقتصاديه ونصب": {
        "نصب": 8, "احتيال": 7, "غسيل أموال": 9, "شيك بدون رصيد": 10, "رشوة": 9,
    },
    "خيانة الأمانة": {
        "خيانة أمانة": 10, "تبديد": 8, "إيصال أمانة": 9,
        "عقد وديعة": 8, "عقد وكالة": 7, "اختلاس": 8,
    },
    "قتل ومحاولة قتل عمد": {
        "قتل عمد": 10, "شروع في قتل": 10, "ضرب مبرح": 8, "طعن بالسكين": 9, "إطلاق نار عمداً": 9,
    },
    "قتل خطأ وحوادث سيارات": {
        "قتل خطأ": 10, "إصابة خطأ": 9, "حادث سيارة": 8, "حادث تصادم": 8, "رعونة": 7,
        "قيادة مركبة": 6, "تصادم مروري": 8,
    },
    "سرقة وسطو": {
        "سرقة بالإكراه": 10, "سرقة بالتهديد": 10, "سرقة": 6, "سطو": 8, "سلب": 7,
        "نشل": 8, "انتهاك حرمة منزل": 8,
    },
    "جرائم تقنيه معلومات": {
        "اختراق": 8, "هكر": 8, "ابتزاز إلكتروني": 10, "جريمة معلوماتية": 9, "جرائم إنترنت": 8,
    },
    "جرائم اخلاقيه": {
        "خدش حياء": 10, "فعل فاضح": 9, "دعارة": 9, "تحرش": 8,
    },
    "تهريب مهاجرين": {
        "تهريب بشر": 10, "هجرة غير شرعية": 9,
    },
    "الإضرار والبلاغات": {
        "بلاغ كاذب": 10, "إهانة موظف عام": 9, "حريق عمد": 9, "تخريب ممتلكات": 8,
    },
    "غش تجاري وتموين": {
        "سلع مغشوشة": 10, "غش تجاري": 10, "ناقصة الأوزان": 9, "مجهولة المصدر": 6,
        "سلع تموينية": 9, "مواصفات قياسية": 8, "تعبئة بدون ترخيص": 9,
        "غش الأغذية": 9, "سلعة تموينية مدعمة": 9, "الاتجار": 1,
    },
}

# ── 4.5 توسيع الاستعلام القانوني حسب نوع الجريمة ─────────────────────────
LAW_QUERY_EXPANSION = {
    "مخدرات": "تفتيش ضبط إذن النيابة حيازة مخدرات قانون مكافحة المخدرات",
    "سلاح وذخيره": "حيازة سلاح ترخيص ضبط تفتيش قانون الأسلحة والذخائر",
    "تزوير وتقليد": "تزوير محررات عقوبة جريمة قانون العقوبات",
    "جرائم اقتصاديه ونصب": "نصب احتيال غسيل أموال عقوبة جريمة مالية قانون العقوبات",
    "خيانة الأمانة": "خيانة أمانة تبديد إيصال أمانة عقد وديعة قانون العقوبات",
    "قتل ومحاولة قتل عمد": "قصد الإجرام موانع الإثبات الاعتراف الدفاع الشرعي قانون العقوبات",
    "قتل خطأ وحوادث سيارات": "قتل خطأ إصابة خطأ خطأ المجني عليه استغراق الخطأ قانون المرور قانون العقوبات",
    "سرقة وسطو": "سرقة بالإكراه تفتيش الشخص إثبات نسبة الجريمة قانون العقوبات",
    "جرائم تقنيه معلومات": "جرائم معلوماتية قانون تقنية اختراق قانون الجرائم الإلكترونية",
    "جرائم اخلاقيه": "جريمة أخلاقية عقوبة فعل فاضح قانون العقوبات",
    "تهريب مهاجرين": "تهريب بشر هجرة غير شرعية قانون مكافحة تهريب المهاجرين",
    "الإضرار والبلاغات": "بلاغ كاذب إهانة موظف عام حرق متعمد قانون العقوبات",
    "غش تجاري وتموين": "غش تجاري قانون حماية المستهلك التموين تفتيش إداري ضبط تجاري",
}


# ── 4.6 دوال التصنيف ───────────────────────────────────────────────────────

def detect_crime_type_weighted(text: str) -> dict:
    """ترجع dict فيه score كل فئة بناءً على الكلمات المرجّحة."""
    scores = {}
    for cat, kws in CRIME_KEYWORDS_WEIGHTED.items():
        scores[cat] = sum(w for kw, w in kws.items() if kw in text)
    return scores


def detect_crime_type_llm(charge_text: str, case_facts: str) -> str | None:
    categories_list = "\n".join(f"- {k}: {v}" for k, v in CRIME_CATEGORIES.items())
    prompt = f"""أنت مصنّف قانوني دقيق جداً. مهمتك تحديد هل "جوهر" هذه القضية يطابق
إحدى الفئات التالية **تماماً**، أم أنه جريمة مختلفة تماماً غير مذكورة.

{categories_list}

⚠️ قاعدة صارمة: لا تختاري أقرب فئة تشبه القضية — اختاري فئة فقط لو كانت
التهمة الأساسية والقانون المخالف يطابقان الفئة فعلياً. لو التهمة الأساسية
تتعلق بقانون أو نشاط مختلف تماماً (مثل قانون عمل، قانون بيئة، قانون ضرائب،
تراخيص مهنية) ولا توجد فئة تطابقه، أخرجي "غير محدد" ولا تجبري نفسك على
اختيار الأقرب شكلاً.

أمثلة على الإجابة الصحيحة "غير محدد":
- "مزاولة نشاط إلحاق عمالة دون ترخيص من وزارة العمل" ← غير محدد (قانون عمل، ليس نصباً ولا تزويراً رغم ذكر عقود وهمية)
- "مخالفة قانون البيئة بالتخلص من مخلفات خطرة" ← غير محدد
- "التهرب الضريبي بإخفاء إيرادات" ← غير محدد (ما لم يذكر تزوير مستندات صراحة كجوهر التهمة)

التهمة: {charge_text}
وقائع القضية (مختصر): {case_facts[:800]}

أخرجي فقط اسم الفئة بالحرف تماماً كما ورد أعلاه إذا كانت تطابق الجوهر فعلياً،
أو "غير محدد" لو الجوهر قانون أو نشاط مختلف — بدون أي شرح إضافي."""

    try:
        result = llm_text([{"role": "user", "content": prompt}], temperature=0.0, max_tokens=30)
    except RuntimeError:
        return None
    return result if result in CRIME_CATEGORIES else None


def detect_crime_type_semantic(case_facts: str, threshold: float = 0.45) -> str | None:
    """Fallback أخير: مقارنة cosine similarity بين الوقائع ووصف كل فئة."""
    fact_vec = embed(case_facts)
    categories = list(CRIME_CATEGORIES.keys())
    descriptions = list(CRIME_CATEGORIES.values())
    _ensure_pipeline()
    if not _embedder:
        return None
    cat_vecs = _embedder.encode(descriptions, normalize_embeddings=True)
    similarities = np.dot(cat_vecs, fact_vec)
    best_idx = int(np.argmax(similarities))
    best_score = float(similarities[best_idx])
    if best_score < threshold:
        return None
    return categories[best_idx]


def detect_crime_type(charge_text: str, case_facts: str = "") -> tuple[str | None, str]:
    full_text = charge_text + " " + case_facts[:500]
    scores = detect_crime_type_weighted(full_text)
    sorted_scores = sorted(scores.items(), key=lambda x: -x[1])
    top_cat, top_score = sorted_scores[0]
    second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0

    if top_score >= 15 and top_score > second_score * 2.5:
        return top_cat, "keyword:confident"

    if top_score > 0:
        llm_result = detect_crime_type_llm(charge_text, case_facts)
        if llm_result:
            return llm_result, "llm:disambiguation"
        return None, "llm:unclassified"

    sem = detect_crime_type_semantic(charge_text)
    if sem:
        return sem, "semantic:fallback"
    if case_facts:
        sem2 = detect_crime_type_semantic(case_facts[:1000])
        if sem2:
            return sem2, "semantic:facts_fallback"
    return None, "none"


ARABIC_ORDINALS = {
    "الأولى": 1, "الثانية": 2, "الثالثة": 3, "الرابعة": 4, "الخامسة": 5,
    "السادسة": 6, "السابعة": 7, "الثامنة": 8, "التاسعة": 9, "العاشرة": 10,
    "الحادية عشرة": 11, "الثانية عشرة": 12, "الثالثة عشرة": 13,
    "الرابعة عشرة": 14, "الخامسة عشرة": 15, "السادسة عشرة": 16,
    "السابعة عشرة": 17, "الثامنة عشرة": 18, "التاسعة عشرة": 19,
    "العشرون": 20,
}


def extract_article_num(payload: dict) -> str:
    """استخراج رقم المادة: أرقام صريحة، article_id بالحروف، أو من chunk_id/article_ref."""
    aid = payload.get("article_id", "")
    m = re.search(r'مادة\s*(\d+)', aid)
    if m:
        return m.group(1)
    for word, num in ARABIC_ORDINALS.items():
        if word in aid:
            return str(num)

    for field in ("article_ref", "chunk_id"):
        val = payload.get(field, "")
        m = re.search(r'مادة_(\d+)', val)
        if m:
            return m.group(1)

    text = payload.get("contextual_text", "")
    m = re.search(r'مادة\s*(\d+)', text)
    if m:
        return m.group(1)
    for word, num in ARABIC_ORDINALS.items():
        if word in text:
            return str(num)

    return ""


def clean_law_content(text: str) -> str:
    """تنظيف نص القانون من الزخارف والمسافات الزائدة."""
    if not text:
        return ""
    cleaned = re.sub(r'[ \t]{2,}', ' ', text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()


def retrieve(query: str, collection: str, top_k: int = 5,
             crime_type_filter: str | None = None) -> list[dict]:
    try:
        vec = embed(query)
        _ensure_pipeline()
        if not _qdrant:
            return []
        results = _qdrant.query_points(
            collection_name=collection, query=vec,
            limit=top_k * 3, with_payload=True
        ).points

        hits = []
        for r in results:
            if r.score < SCORE_THRESHOLD:
                continue

            payload = r.payload or {}

            if collection == COL_LAWS2 and payload.get("chunk_type") not in ("jurist_commentary", "explanatory_memo"):
                continue

            raw_content = payload.get("content") or payload.get("text", "")
            clean_content = clean_law_content(raw_content) if collection in (COL_LAWS, COL_LAWS2) else raw_content
            title = payload.get("title") or payload.get("document_title", "")

            if collection in (COL_LAWS, COL_LAWS2):
                art_num = payload.get("article_number")
                article_num = str(art_num) if art_num is not None else extract_article_num(payload)
            else:
                article_num = ""

            if crime_type_filter and collection in (COL_MEMOS, COL_CASSATION):
                if crime_type_filter not in payload.get("crime_type", ""):
                    continue

            hits.append({
                "score": round(r.score, 4),
                "content": clean_content,
                "title": title or payload.get("source_file", ""),
                "article_num": article_num,
                "metadata": {
                    k: v for k, v in payload.items()
                    if k not in ("content", "text", "title", "document_title")
                },
            })
            if len(hits) >= top_k:
                break
        return hits

    except Exception as e:
        print(f"⚠️  retrieve error [{collection}]: {e}")
        return []


def smart_retrieve_all(case_facts: str, top_k_cassation: int = 4,
                        top_k_laws: int = 4, top_k_memos: int = 3) -> dict:
    charge_match = re.search(r"نوع الجريمة\s*:\s*(.+)", case_facts)
    charge_text = charge_match.group(1).strip() if charge_match else case_facts

    crime_type, detection_method = detect_crime_type(charge_text, case_facts)
    legal_nature = CRIME_LEGAL_NATURE.get(crime_type)
    law_expansion = LAW_QUERY_EXPANSION.get(crime_type, "")
    print(f"🏷️  نوع الجريمة المكتشف: {crime_type or 'غير محدد'}  "
          f"(الطريقة: {detection_method})  |  الطبيعة: {legal_nature or 'غير محددة'}")

    cassation = retrieve(case_facts, COL_CASSATION, top_k_cassation, crime_type_filter=crime_type)
    if not cassation and crime_type:
        cassation = retrieve(case_facts, COL_CASSATION, top_k_cassation, crime_type_filter=None)

    law_query = case_facts + (f"\n{law_expansion}" if law_expansion else "")
    laws = retrieve(law_query, COL_LAWS, top_k_laws)
    laws2 = retrieve(law_query, COL_LAWS2, top_k_laws)

    qa = retrieve(case_facts, COL_QA, 2)

    memo_query = case_facts + (f"\nنوع الجريمة: {crime_type}" if crime_type else "")
    memos = retrieve(memo_query, COL_MEMOS, top_k_memos, crime_type_filter=crime_type)
    if not memos and crime_type:
        memos = retrieve(memo_query, COL_MEMOS, top_k_memos, crime_type_filter=None)

    return {
        "cassation": cassation, "laws": laws, "laws2": laws2, "qa": qa, "memos": memos,
        "crime_type": crime_type, "legal_nature": legal_nature,
    }


def debug_retrieval(case_facts: str) -> dict:
    """طباعة تفصيلية لنتائج الاسترجاع من كل collection."""
    print("=" * 70)
    retrieved = smart_retrieve_all(case_facts)

    for col_name, hits in [
        (COL_CASSATION, retrieved["cassation"]),
        (COL_LAWS, retrieved["laws"]),
        (COL_QA, retrieved["qa"]),
        (COL_MEMOS, retrieved["memos"]),
    ]:
        print(f"\n📂 {col_name}  → {len(hits)} نتيجة")
        if not hits:
            print("   ⚠️  مفيش نتائج كافية")
            continue
        for i, h in enumerate(hits, 1):
            print(f"\n   [{i}] score={h['score']}")
            if h["title"]:
                print(f"       title      : {h['title'][:80]}")
            if h["article_num"]:
                print(f"       article_num: مادة {h['article_num']}")
            ct = h["metadata"].get("crime_type", "")
            if ct:
                print(f"       crime_type : {ct}")
            print(f"       content    : {h['content'][:300]}")
            print("       " + "-" * 60)

    print("\n" + "=" * 70)
    return retrieved


def _safe_str(value, default: str = "") -> str:
    """intake.get(key, default) ما بيطبّقش الـ default لو المفتاح موجود
    بقيمة None صراحة (بيحصل لما الـ LLM يرجّع JSON فيه null) — الدالة دي
    بتضمن رجوع str دايمًا عشان .strip() بعدها ميكسرش على NoneType."""
    return value if isinstance(value, str) else default


def build_case_facts(intake: dict) -> str:
    """تحويل dict بيانات القضية لـ نص منظم جاهز للـ pipeline."""
    lines = []

    lines.append(f"اسم المتهم     : {_safe_str(intake.get('defendant_name'), '[غير محدد]')}")
    lines.append(f"نوع الجريمة    : {_safe_str(intake.get('charge'), '[غير محددة]')}")
    lines.append(f"رقم القضية     : {_safe_str(intake.get('case_number'), '[غير متاح]')}")
    lines.append(f"المحكمة        : {_safe_str(intake.get('court'), '[غير محددة]')}")
    lines.append(f"تاريخ الواقعة  : {_safe_str(intake.get('incident_date'), '[غير محدد]')}")

    lines.append("\n═══ وقائع الضبط والقبض ═══")
    lines.append(f"طريقة الضبط    : {_safe_str(intake.get('arrest_method'), '[غير موضح]')}")
    lines.append(f"مكان الضبط     : {_safe_str(intake.get('arrest_location'), '[غير موضح]')}")
    lines.append(f"وقت الضبط      : {_safe_str(intake.get('arrest_time'), '[غير موضح]')}")

    has_warrant = intake.get('search_warrant')
    warrant_detail = intake.get('search_warrant_detail', '')
    if has_warrant is not None:
        warrant_str = "نعم" if has_warrant else "لا — لم يصدر إذن تفتيش مسبق"
        lines.append(f"إذن التفتيش    : {warrant_str}")
        if warrant_detail:
            lines.append(f"تفاصيل الإذن   : {warrant_detail}")

    has_arrest_warrant = intake.get('arrest_warrant')
    if has_arrest_warrant is not None:
        lines.append(f"أمر القبض      : {'نعم' if has_arrest_warrant else 'لا — قبض بدون أمر قضائي'}")

    lines.append(f"الجهة المُنفِّذة: {_safe_str(intake.get('arresting_authority'), '[غير محدد]')}")

    lines.append("\n═══ رواية الضابط / محضر الضبط ═══")
    lines.append(_safe_str(intake.get('officer_account')).strip() or "[لم تُدرَج]")

    lines.append("\n═══ رواية الموكل / الدفاع ═══")
    lines.append(_safe_str(intake.get('client_account')).strip() or "[لم تُدرَج]")

    contradictions = intake.get('contradictions', [])
    if contradictions:
        lines.append("\n═══ تناقضات وثغرات في الاتهام ═══")
        for i, c in enumerate(contradictions, 1):
            lines.append(f"  {i}. {c}")

    evidence = intake.get('physical_evidence', [])
    if evidence:
        lines.append("\n═══ الأدلة المادية ═══")
        for e in evidence:
            lines.append(f"  • {e}")

    witnesses = intake.get('witnesses', [])
    if witnesses:
        lines.append("\n═══ الشهود ═══")
        for w in witnesses:
            lines.append(f"  • {w}")

    if intake.get('prior_record'):
        lines.append(f"\n═══ السوابق الجنائية ═══\n{intake['prior_record']}")
    if intake.get('extra_notes'):
        lines.append(f"\n═══ ملاحظات المحامي الإضافية ═══\n{intake['extra_notes']}")

    return "\n".join(lines)


INTAKE_EXTRACTION_SCHEMA = """
{
  "defendant_name": "اسم المتهم أو null",
  "charge": "نص التهمة كما ورد",
  "case_number": "رقم القضية أو null",
  "court": "اسم المحكمة أو null",
  "incident_date": "تاريخ الواقعة أو null",
  "arrest_method": "طريقة الضبط أو null",
  "arrest_location": "مكان الضبط أو null",
  "arrest_time": "وقت الضبط أو null",
  "search_warrant": "نص إذن التفتيش لو موجود، أو false لو صريح إنه مش موجود، أو null لو غير مذكور",
  "arrest_warrant": true أو false أو null,
  "arresting_authority": "الجهة التي قامت بالضبط أو null",
  "officer_account": "رواية الضابط/محضر الضبط كاملة كما وردت",
  "client_account": "رواية المتهم/الموكل كاملة كما وردت",
  "contradictions": ["قائمة بالتناقضات والثغرات كما وردت في النص، كل تناقض عنصر منفصل"],
  "physical_evidence": ["قائمة الأدلة المادية المذكورة"],
  "witnesses": ["قائمة الشهود أو الإشارة لغيابهم"],
  "prior_record": "السوابق الجنائية أو null",
  "extra_notes": "أي ملاحظات إضافية أو نقاط دفاع ذكرها المحامي"
}
"""


def extract_intake_from_freetext(user_text: str) -> dict:
    """
    تأخذ كلام المحامي الحر وتستخرج منه dict بنفس شكل الـ intake.
    أي حقل مش مذكور يتسيب null — ما تخترعش بيانات غير موجودة.
    """
    extraction_prompt = f"""أنت مساعد قانوني متخصص في استخراج البيانات المهيكلة من نصوص القضايا الجنائية.

اقرأ النص التالي الذي كتبه محامٍ يصف قضية جنائية، واستخرج منه البيانات في صيغة JSON بالضبط بهذا الشكل:
{INTAKE_EXTRACTION_SCHEMA}

⚠️ قواعد صارمة:
1. لا تخترع أي معلومة غير مذكورة صراحة أو ضمناً في النص — استخدم null للحقول الغائبة.
2. انسخ الوقائع (officer_account, client_account) بأسلوب المحامي نفسه دون تلخيص أو حذف تفاصيل.
3. contradictions لازم تكون قائمة، كل عنصر تناقض أو ثغرة واحدة وردت في النص.
4. أخرج JSON فقط بدون أي شرح أو نص إضافي قبله أو بعده.

نص القضية:
{user_text}
"""
    raw = llm_text([{"role": "user", "content": extraction_prompt}],
                    temperature=0.0, max_tokens=1600)
    raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        intake = json.loads(raw)
    except Exception as e:
        print(f"⚠️ فشل استخراج JSON من كلام اليوزر: {e}")
        print(f"الرد الخام:\n{raw[:500]}")
        return {}
    return intake


def build_case_from_freetext(user_text: str) -> str:
    """
    الدالة الموحّدة: تأخذ كلام المحامي الحر وترجع case_facts جاهزة
    تدخل مباشرة في draft_defense_memo.
    """
    intake = extract_intake_from_freetext(user_text)
    if not intake:
        raise ValueError("فشل استخراج بيانات القضية من النص المدخل — راجعي النص المدخل.")
    case_facts = build_case_facts(intake)
    print(f"📋 تم استخراج بيانات القضية تلقائياً (طول case_facts: {len(case_facts)} حرف)")
    print(f"🔍 التهمة المستخرجة: {intake.get('charge', '[غير محددة]')}")
    return case_facts


def build_context_block(cassation, laws, qa, memos, laws2=None) -> str:
    sections = []

    if memos:
        items = ""
        for i, h in enumerate(memos):
            meta = h.get("metadata", {})
            header = f"  ◈ مثال {i + 1}"
            if meta.get("crime_type"):
                header += f" | نوع الجريمة: {meta.get('crime_type')}"
            items += f"{header}\n{h['content'][:1200]}\n\n"
        sections.append(
            "【 مذكرات دفاع مشابهة — استوحِ منها **أسلوب** الصياغة والانتقالات فقط، "
            "تجاهل تفاصيل الجريمة إن كانت مختلفة 】\n" + items
        )
    else:
        sections.append("【 مذكرات مشابهة 】\n  ⚠️ لا توجد.")

    if cassation:
        items = ""
        for i, h in enumerate(cassation):
            meta = h.get("metadata", {})
            citation = ""
            if meta.get("ruling_num") and meta.get("ruling_year"):
                citation = f"(طعن رقم {meta['ruling_num']} لسنة {meta['ruling_year']}"
                if meta.get("date"):
                    citation += f" جلسة {meta['date']}"
                citation += ")"
            items += (f"  ◈ حكم {i + 1} {citation}:\n  العنوان: {h['title']}\n"
                      f"  النص: {h['content'][:500]}\n\n")
        sections.append(
            "【 أحكام محكمة النقض — استخدمها للمبدأ القانوني العام المرتبط بالدفع فقط، "
            "لا تستعير وقائعها التفصيلية 】\n" + items
        )

    if laws:
        items = ""
        for h in laws:
            art = f"مادة {h['article_num']}" if h["article_num"] else h["title"]
            items += f"  ◈ {art}:\n  {h['content'][:400]}\n\n"
        sections.append("【 نصوص القوانين الرسمية — هي وحدها الملزمة قانوناً 】\n" + items)

    if laws2:
        items = ""
        for h in laws2:
            ct = h.get("metadata", {}).get("chunk_type", "")
            items += f"  ◈ {h['title']} ({ct}):\n  {h['content'][:400]}\n\n"
        sections.append(
            "【 شروح ومذكرات إيضاحية — للفهم والسياق فقط، ⚠️ ليست نصاً قانونياً ملزماً، "
            "ممنوع الاستشهاد بها كـ'مادة X' أو نسبة رقم مادة لها 】\n" + items
        )

    if qa:
        sections.append("【 استشارات قانونية مشابهة 】\n"
                        + "\n".join(f"  ◈ {h['content'][:250]}" for h in qa))

    return "\n\n" + "─" * 60 + "\n\n".join(sections) + "\n" + "─" * 60


FEW_SHOT_EXAMPLE = """
─────────────────────────────────────────────────────────────────────────────
مثال مختصر على أسلوب الهجوم القانوني (توضيحي فقط — ليس من مصادر هذه القضية)
─────────────────────────────────────────────────────────────────────────────
【 مثال دفع شكلي 】
"دفع الحاضر عن المتهم ببطلان إجراءات الضبط والتفتيش لخلوّها من أي سند قانوني
صحيح، إذ لم يصدر إذن من النيابة العامة، ولم تتوافر حالة التلبس. وترتيباً على
ما تقدم: يكون الضبط والتفتيش باطلَيْن بطلاناً مطلقاً، ويترتب على ذلك — وفق
مبدأ ثمرة الشجرة المسمومة — استبعاد كل دليل مستمد من هذا التفتيش الباطل."

【 مثال دفع موضوعي 】
"يصادف أن يجرأ الاتهام على ادعاء توافر القصد الجنائي رغم خلو الأوراق من أي
دليل مادي قاطع، وهذا مما يقطع ببراءة الموكل عملاً بمبدأ أن الشك يفسر لمصلحة
المتهم."

⚠️ استخدمي هذا فقط لفهم درجة الحدة والجزم في الأسلوب — لا تنسخي أي عبارة
حرفية منه ولا تنسبيها لأي رقم طعن في مذكرتك الحقيقية.
─────────────────────────────────────────────────────────────────────────────
"""

MEMO_TEMPLATE = """بسم الله الرحمن الرحيم

مذكرة بدفاع
السيد/ [اسم المتهم]                                          المتهم
ضـــــد
النيابة العامة                                          المدعية بالحق العام
في الجناية/الجنحة رقم [رقم القضية] لسنة [السنة] [المحكمة]

─────────────────────────────────────
أولاً: وقائع الدعوى
─────────────────────────────────────
[سرد الوقائع بأسلوب هجومي يفضح التناقضات. استخدم كلمات مثل: زعم، ادّعى، المستند إلى محضر باطل. اذكر التفاصيل الدقيقة من وقائع القضية: الأسماء، الأماكن، التواريخ]

─────────────────────────────────────
ثانياً: الدفوع الشكلية (البطلان)
─────────────────────────────────────
[ركز على بطلان الإجراءات إن وُجدت فعلاً وبما يتوافق مع طبيعة القضية. ⚠️ إذا لم توجد دفوع شكلية جوهرية مرتبطة بعيب إجرائي صريح في الوقائع، فاكتب جملة واحدة فقط: "لا توجد دفوع شكلية جوهرية تثيرها ظروف هذه القضية." ثم انتقل فوراً إلى الدفوع الموضوعية. ممنوع الخوض في تفاصيل أو تفسيرات أو الربط بأي عناصر غير إجرائية بحتة في هذا القسم.]

─────────────────────────────────────
ثالثاً: الدفوع الموضوعية (انتفاء أركان الجريمة)
─────────────────────────────────────
[⚠️ مهم جداً: لا تكرر كلام البطلان هنا. بناءً على نوع التهمة الفعلي من المصادر والتوجيه الخاص أدناه، ركز على هجوم الأركان الحقيقية لهذه الجريمة تحديداً:]
[الدفع الأول: دفع التلفيق والكيدية (إن توافرت دلائله من غياب شهود أو تناقضات صارخة).]
[الدفع الثاني: انتفاء الركن المادي للجريمة: نفي وقوع الفعل المادي أو استحالته منطقياً بناءً على وقائع القضية.]
[الدفع الثالث: انتفاء القصد الجنائي (العام والخاص) المحدد لهذه الجريمة بذاتها.]
[الدفع الرابع: ⚠️ لا تكتب "انتفاء الصلة أو الحيازة" إلا إذا كانت الجريمة من جرائم الحيازة (مخدرات/سلاح) فعلاً. لغير ذلك، استخدم الدفع الرابع المناسب بحسب "التوجيه الخاص بنوع الجريمة" أدناه.]
[💡 تلميح: إذا كان لديك أكثر من حكم نقض في المصادر، اجمعهم تحت الدفع الأنسب لتقوية الأثر.]

─────────────────────────────────────
رابعاً: الطلبات الختامية
─────────────────────────────────────
[⚠️⚠️ إلزامي بالحرف: الطلب الأصلي والاحتياطي لازم يبدآ بالصياغة الحرفية التالية،
لا يجوز اختصارها أو تعديلها أو استبدالها بصياغة قريبة:
- "أولاً وبصفة أصلية:" (ثم نص الطلب)
- "ثانياً واحتياطياً عن الأول:" (ثم نص الطلب)
هذه الصياغة الحرفية جزء إلزامي من الشكل القانوني للمذكرة، وليست مجرد ترقيم.

⚠️ محتوى الطلب لازم يتطابق مع قسم "الدفوع الشكلية" أعلاه:
- لو كتبتِ في القسم التاني "لا توجد دفوع شكلية جوهرية"، فالطلب الأصلي هنا يكون
  مباشرة "أولاً وبصفة أصلية: ببراءة المتهم لانتفاء أركان الجريمة ولعدم كفاية
  أدلة الثبوت" بدون ذكر "قبول الدفوع الشكلية" أو "بطلان الإجراءات" إطلاقاً.
- لو فعلاً فيه دفع شكلي حقيقي (بطلان قبض/تفتيش/إذن)، وقتها بس يجوز الطلب الأصلي
  بقبول الدفوع الشكلية والبطلان، والاحتياطي بانتفاء الأركان.]

لما تقدم، يلتمس الدفاع الحكم للسيد المستشار رئيس المحكمة:
[اكتب صيغة الطلبات (أصلي/احتياطي) بما يطابق الشرط أعلاه فقط — لا تنسَ عبارتي
"وبصفة أصلية" و"واحتياطياً عن الأول" بالحرف]

ثالثاً وفي جميع الأحوال:
إخلاء سبيل المتهم فوراً إن كان محبوساً احتياطياً.
- لو فعلاً فيه دفع شكلي حقيقي (بطلان قبض/تفتيش/إذن)، **يجب إلزاماً** أن يتضمن
  الطلب الاحتياطي على الأقل الإشارة لقبول هذا الدفع الشكلي وبطلان الإجراءات
  المترتبة عليه، ولا يجوز إغفاله بالكامل من قسم الطلبات الختامية.
─────────────────────────────────────
خامساً: الطلبات الإجرائية المصاحبة
─────────────────────────────────────
[⚠️⚠️ هذا القسم إلزامي ولا يجوز حذفه أو إسقاطه تحت أي ظرف. بناءً على وقائع
القضية فقط، اكتب 2 إلى 3 طلبات إجرائية دقيقة ومختصرة بصيغة "يُلتمس". ⚠️ ممنوع
كتابة "استدعاء شهود النيابة" — فالنيابة العامة خصم في الدعوى ولا شهود لها؛
الصحيح هو "استدعاء المجني عليه وضابط الواقعة (مُحرر المحضر) أمام المحكمة
لمناقشتهم". ⚠️ ممنوع طلب "كاميرات مراقبة" إلا إذا كانت الجريمة تقع في مكان
عام له كاميرات فعلاً. لا تكتب مقدمات، ولا تحذف هذا القسم مهما كانت الظروف.]

وتفضلوا بقبول فائق الاحترام والتقدير،،،

المحامي
[اسم المحامي]
المقيد بنقابة المحامين المصريين"""

CRIME_SPECIFIC_DEFENSE_GUIDANCE = {
    "سرقة وسطو": (
        "بما أن التهمة سرقة بالإكراه، **لا تدفع بانتفاء الحيازة** (دي دفوع مخدرات/سلاح). "
        "الدفع الجوهري الرابع هنا هو: انتفاء ركن الإكراه/التهديد بالقوة — اذكر خلو الأوراق من أي تقرير طبي "
        "يثبت إصابة المجني عليه، وأن ما حدث أقصاه مشاجرة عادية لا سرقة بالإكراه بمعناها القانوني."
    ),
    "قتل خطأ وحوادث سيارات": (
        "بما أن التهمة قتل/إصابة خطأ من حادث سيارة: **لا يوجد دفع بـ'بطلان محضر الضبط لعدم كفاية الأدلة'** "
        "لأن القضية تقوم على تقرير المعاينة المرورية لا على تحريات شرطة تُبنى عليها هذه الصيغة من البطلان. "
        "الدفع الرابع الصحيح هو: استغراق خطأ المجني عليه لخطأ المتهم بالكامل (أو انتفاء علاقة السببية)، وليس انتفاء الحيازة."
    ),
    "خيانة الأمانة": (
        "بما أن التهمة خيانة أمانة/تبديد: **التوقيع على بياض ليس دفعاً بالبطلان** — قانوناً هو تفويض من الموقّع "
        "للطرف الآخر بملء البيانات، فلا تكتب 'بطلان الإيصال لكونه على بياض'. الدفع الصحيح: انتفاء ركن التسليم "
        "الحقيقي للمال / انتفاء القصد الجنائي، مع طلب إحالة أصل الإيصال لمصلحة الطب الشرعي (أبحاث التزييف والتزوير) "
        "لإثبات الفارق الزمني بين توقيع المتهم وكتابة صلب الإيصال. **ممنوع** ذكر 'عدم وجود بصمات للمتهم على الورقة' "
        "إن كان المتهم نفسه يُقر بأن التوقيع توقيعه. **ممنوع** طلب "
        "'كاميرات مراقبة' أو 'استدعاء شهود النيابة' — قضايا الإيصالات تجارية ولا علاقة لها بالكاميرات."
    ),
    "مخدرات": "التزم بدفوع الحيازة والعلم والسيطرة الفعلية وسلسلة حفظ المضبوطات وصحة إذن التفتيش.",
    "سلاح وذخيره": "التزم بدفوع الحيازة والترخيص وسلسلة حفظ المضبوطات وصحة إذن التفتيش.",
    "تزوير وتقليد": "ركّز على سلسلة حفظ المستند المزور (من ضبطه؟ كيف حُفظ؟) والقصد الخاص بالتزوير.",
    "قتل ومحاولة قتل عمد": "ركّز على تقرير الطب الشرعي، أدوات الجريمة، وانتفاء القصد الجنائي الخاص (نية القتل).",
    "غش تجاري وتموين": (
        "بما أن التهمة غش تجاري/تموين: **لا تدفع بانتفاء الحيازة** ولا 'بصمات مخدرات'. "
        "ركّز على: عدم مطابقة العينة المضبوطة لتقرير المعمل الكيماوي المعتمد، سلسلة حفظ "
        "الحرز والأختام (من فضّه؟ هل تطابقت الأوزان والأختام مع محضر الضبط؟)، وصحة إذن "
        "التفتيش الإداري/القضائي الصادر من الجهة المختصة."
    ),
}

DEFAULT_CRIME_GUIDANCE = (
    "لا توجد ملاحظات خاصة محفوظة لهذا النوع من القضايا؛ التزم بالمنطق القانوني العام لوقائع هذه القضية "
    "بالذات، **ولا تستعير مفاهيم أو أدلة من جرائم أخرى** (كالحيازة، أو المخدرات، أو الأسلحة، أو بصمات "
    "مضبوطات، أو كاميرات مراقبة) إلا إذا وردت هذه العناصر فعلاً وحرفياً في وقائع هذه القضية تحديداً."
)


def _compute_length_instruction(case_facts: str) -> str:
    """حساب مستوى التفصيل المطلوب بناءً على تعقيد القضية."""
    word_count = len(case_facts) / 6
    contradiction_markers = case_facts.count("تناقض") + case_facts.count("تبر") + case_facts.count("يثبت") + case_facts.count("خلو") + case_facts.count("كتاب رسمي") + case_facts.count("برقية")
    evidence_markers = case_facts.count("تقرير") + case_facts.count("حرز") + case_facts.count("مضبوط") + case_facts.count("معمل") + case_facts.count("طب شرعي") + case_facts.count("شاهد")
    complexity = word_count + (contradiction_markers * 40) + (evidence_markers * 30)

    if complexity > 400:
        return ("مستوى التفصيل المطلوب: هذه قضية معقدة وكبيرة. اكتب مذكرة طويلة ومفصّلة "
                "(٨-١٠ صفحات). وسّع كل دفع بشرح عميق ووقائع مفصلة وأسانيد متعددة من أحكام النقض. "
                "لا تختصر أي دفع — كل دفع لازم يكون فقرة كاملة بذاتها.")
    elif complexity > 200:
        return ("مستوى التفصيل المطلوب: هذه قضية متوسطة التعقيد. اكتب مذكرة متوسطة الطول "
                "(٥-٧ صفحات). كل دفع يكون مفصّلاً بما يكفي مع استشهاد بأحكام النقض.")
    else:
        return ("مستوى التفصيل المطلوب: هذه قضية بسيطة أو قصيرة الوقائع. اكتب مذكرة مركزة "
                "(٣-٤ صفحات). ركز على النقاط الجوهرية بدون حشو أو تكرار.")


def build_system_prompt(context_block: str, crime_type: str | None = None,
                        legal_nature: str | None = None) -> str:
    """بناء الـ system prompt الكامل للموديل — مستخدم دلوقتي في جولات
    التصحيح (self-correction) بس، مش في التوليد الأولي (شوفي generate_memo
    الجديدة اللي بتقسّم التوليد الأولي لـ 3 نداءات أصغر)."""
    specific_guidance = CRIME_SPECIFIC_DEFENSE_GUIDANCE.get(crime_type, DEFAULT_CRIME_GUIDANCE)
    nature_guidance = NATURE_GUIDANCE.get(
        legal_nature,
        "⚠️ الطبيعة القانونية لهذه الجريمة (عمدية/غير عمدية) غير محددة بدقة في النظام حتى الآن. "
        "استنتج من نص التهمة ووقائع القضية نفسها هل الجريمة تتطلب قصداً جنائياً أم أنها قائمة على "
        "الخطأ/الإهمال، واستخدم المصطلح القانوني المطابق فقط ولا تفترض قصداً جنائياً في جريمة لم تُوصف كذلك."
    )

    return f"""أنت محامٍ مصري مخضرم ومتخصص في القضايا الجنائية بجميع أنواعها (مخدرات، قتل، تزوير، نصب، سلاح، إلكترونيات، أخلاقيات). أسلوبك فريد:
1. هجومي وليس محايداً: أنت تدافع عن بريء، فهاجم أدلة الاتهام بشراسة.
2. لغتك قانونية رصينة: تستخدم مصطلحات مثل (زعم الشاهد، المستند إلى محضر باطل، يتعين استبعاده، مبدأ ثمرة الشجرة المسمومة، يفسر لمصلحة المتهم).
3. ممنوع الجمل العامة: كل جملة لابد أن ترتبط بوقائع القضية المحددة (اذكر الأسماء والأماكن بدقة).

{"=" * 65}
مثال على المستوى المطلوب — تعلّم منه أسلوب الهجوم القانوني فقط
{"=" * 65}
{FEW_SHOT_EXAMPLE}

{"=" * 65}
المصادر القانونية للقضية الجديدة — استخدمها كأساس لهدمك على الاتهام
{"=" * 65}
{context_block}

{"=" * 65}
هيكل المذكرة الإلزامي
{"=" * 65}
{MEMO_TEMPLATE}

{"=" * 65}
✅️ التصنيف الآلي لنوع الجريمة في هذه القضية: {crime_type or 'غير محدد'}
✅️ الطبيعة القانونية للركن المعنوي: {legal_nature or 'غير محددة — استنتجها من الوقائع'}

توجيه إلزامي بخصوص طبيعة الركن المعنوي (عمدي/غير عمدي):
{nature_guidance}

توجيه خاص إضافي بنوع الجريمة تحديداً:
{specific_guidance}
{"=" * 65}
قواعد صارمة للاستشهاد والهجوم (تنطبق على أي جريمة)
{"=" * 65}
1. ⚠️⚠️ إلزامي وليس اختيارياً: كل حكم نقض ظاهر في قسم 'أحكام محكمة النقض' أعلاه
يجب أن يُذكر رقمه وسنته حرفياً في المذكرة مرة واحدة على الأقل (بصيغة: طعن رقم
XXX لسنة XX). إذا كان الحكم يخص نفس موضوع التهمة، استشهدي به مباشرة كسند لدفع
الأركان. إذا كان الحكم عاماً، استشهدي به كمبدأ إجرائي عام. في كل الأحوال لا
يجوز تجاهل أي حكم متاح في المصادر دون ذكره ولو مرة واحدة.
2. المواد القانونية: اذكرها من المصادر فقط. لو ملفقتش مادة للبطلان، اكتب الدفع دون رقم مادة.
3. الفرق بين الشكلية والموضوعية: الشكلية = بطلان الإجراءات (بما فيها بطلان القبض والتفتيش والإذن والإعلان). الموضوعية = انتفاء الركن (المادي أو المعنوي). لا تخلط بينهم!
4. المرونة في الركن الموضوعي: بناءً على التهمة الواردة في الوقائع، حدد ما هو "القصد الخاص" للجريمة وهاجمه بالوقائع والمصادر.
5. ⚠️ مانع الهلوسة في الطعون: لا تخترع أبداً أرقام طعون أو تواريخ جلسات غير موجودة في قسم "أحكام محكمة النقض" أعلاه. إذا لم تجد حكماً يناسب الدفع، اكتب الدفع بدون استشهاد بحكم نقض، أو قل "ومن المبادئ المستقرة في قضاء النقض أن..." بدون ذكر أرقام وهمية.
6. الأسلوب الشخصي: اكتب بأسلوب المحامي الواثق. استخدم عبارات مثل: "يصادف أن يجرأ...", "من المستحيل عقلاً ونقضاً...", "هذا مما يقطع ببراءة الموكل...".
7. ⚠️⚠️ ممنوع منعاً باتاً استيراد مفاهيم أو أدلة أو طلبات إجرائية من نوع جريمة مختلف عن التصنيف المذكور أعلاه (مثل: بصمات على مضبوطات، كاميرات مراقبة، دفع الحيازة، تفتيش سيارة) إلا إذا وردت هذه العناصر فعلاً وحرفياً في وقائع القضية المعروضة عليك. لو أي مصدر في "أحكام النقض" أو "مذكرات مشابهة" أعلاه يخص جريمة مختلفة عن هذه القضية، استخدمه فقط كأسلوب صياغة أو كمبدأ قانوني عام مجرد، ولا تستعير وقائعه أو تفاصيله الجزئية أبداً.
8. ⚠️ ممنوع اختراع دفع "بطلان" شكلي وهمي لمجرد ملء القالب. الدفع بالبطلان لازم يرتبط بعيب إجرائي حقيقي مذكور صراحة في الوقائع (غياب إذن تفتيش، انتفاء حالة تلبس فعلية، بطلان قبض، عدم إعلان صحيح بالجلسة). عدم استدعاء شاهد أو طرف ثالث أثناء التحقيق **ليس سبباً للبطلان أبداً** — هذا محله "الطلبات الإجرائية"، لا دفع بطلان إجراءات. إذا لم تجد في الوقائع عيباً إجرائياً حقيقياً، فاكتب في قسم "الدفوع الشكلية" جملة واحدة صريحة تفيد بعدم وجود عيب إجرائي جوهري، وانقل ثقل الدفاع كله إلى الدفوع الموضوعية.
9. ⚠️ الاقتباسات من أحكام النقض يجب أن تكون نصاً حرفياً منقولاً فعلاً من النص الموجود في قسم "أحكام محكمة النقض" أعلاه، ومرتبطاً برقم الطعن الصحيح لنفس هذا النص بالذات. **ممنوع** كتابة جملة من عندك ثم لصق رقم طعن عليها ليبدو مقتبساً.
10. ⚠️⚠️ ممنوع منعاً باتاً استخدام أي جملة أو اقتباس من قسم "مثال على المستوى المطلوب" (FEW_SHOT_EXAMPLE) في مذكرتك الحقيقية — هذا المثال مكتوب يدويًا للتوضيح فقط وليس من مصادر هذه القضية، ولا يحمل رقم طعن حقيقي. استخدمه فقط لفهم الأسلوب والبنية، ولا تنقل منه أي عبارة حرفية أو تنسبها لأي رقم طعن مهما بدت مناسبة للدفع.
11. ⚠️ عنوان كل دفع يجب أن يطابق مضمونه تماماً: لا تسمّي دفعاً "تلفيق وكيدية" إلا إذا كان محتواه فعلاً يزعم اختلاق الواقعة أو تلفيق المحضر ضد المتهم كيداً؛ خطأ الغير (كخطأ المجني عليه المروري) دفع سببية مستقل وليس تلفيقاً، فسمّه باسمه الصحيح.
12. ⚠️ الفرق بين "الشكلي" و"الموضوعي": الدفع الشكلي يتعلق حصرياً بصحة الإجراءات (بطلان قبض/تفتيش/إذن/إعلان/اختصاص/إجراءات). أي دفع يمس أركان الجريمة نفسها (الخطأ، القصد، السببية، الركن المادي، كفاية الأدلة، التلفيق) هو دفع **موضوعي** ويُكتب حصراً تحت قسم "الدفوع الموضوعية". ⚠️ "بطلان الإجراءات" دفع شكلي إجرائي — يُكتب تحت "الدفوع الشكلية" فقط.
13. ⚠️⚠️ إلزامية اكتمال الأقسام الخمسة: المذكرة يجب أن تحتوي على الأقسام الخمسة كاملة بعناوينها بالحرف (أولاً، ثانياً، ثالثاً، رابعاً، خامساً) — بما فيها "خامساً: الطلبات الإجرائية المصاحبة" في نهاية المذكرة. **ممنوع منعاً باتاً حذف أو إسقاط أي قسم من الخمسة** حتى لو كانت المذكرة طويلة.
14. ⚠️⚠️ إجبار دمج طعون الـ RAG: يجب عليك إلزاماً كتابة أرقام الطعون والسنوات القضائية المسترجعة في قسم "أحكام محكمة النقض" أعلاه وتضمينها حرفياً في صلب دفوعك. يُمنع منعاً باتاً كتابة دفوع مرسلة بدون أرقام طعون طالما يتوفر في المصادر طعن يناسب الدفع — ولو كان الطعن غير مطابق تماماً، اكتبه مع تمييز السياق، ولا تتجاهله. إذا لم يتوفر أي طعن مناسب فعلاً، فقط حينها يجوز كتابة الدفع بدون رقم طعن.
15. ⚠️ التمييز بين المصدرين: "نصوص القوانين الرسمية" هي الوحيدة التي يجوز الاستشهاد برقم مادتها. "شروح ومذكرات إيضاحية" تُستخدم فقط لفهم حكمة النص أو خلفيته — ممنوع نسبة رقم مادة لها أو معاملتها كنص ملزم.

"""


# ═══════════════════════════════════════════════════════════════════════
# ✏️ جديد: التوليد المقسّم (زي contract_pipeline.py) — 3 دوال prompt
# مركّزة، كل واحدة بتولّد جزء صغير بدل نداء واحد ضخم على المذكرة كاملة.
# ═══════════════════════════════════════════════════════════════════════

def build_static_memo_header(defendant_name: str, case_number: str, court: str) -> str:
    """ديباجة المذكرة ثابتة في بايثون — زي build_static_preamble في
    contract_pipeline.py. الموديل مش بيلمسها خالص، فمستحيل تحصل مشكلة
    'أمام None' أو أي تشويه تاني فيها."""
    case_num_display = case_number if (case_number and not case_number.startswith("[")) else "......."
    court_display = court if (court and not court.startswith("[")) else "......."
    return f"""بسم الله الرحمن الرحيم

مذكرة بدفاع
السيد/ {defendant_name}                                          المتهم
ضـــــد
النيابة العامة                                          المدعية بالحق العام
في الجناية/الجنحة رقم {case_num_display} لسنة [السنة] {court_display}"""


def build_facts_section_prompt(crime_type: str | None, legal_nature: str | None) -> str:
    """system prompt مركّز لقسم 'أولاً: وقائع الدعوى' بس."""
    return f"""أنت محامٍ مصري مخضرم. مهمتك محدودة جداً: اكتب **قسم واحد بس** من مذكرة
دفاع — سرد "وقائع الدعوى" بأسلوب هجومي يفضح تناقضات الاتهام.

نوع الجريمة: {crime_type or 'غير محدد'}
الطبيعة القانونية: {legal_nature or 'غير محددة'}

# قواعد صارمة:
- ابدئي مباشرة بنص الوقائع، من غير عنوان "أولاً" أو أي عنوان (أنا هحطه بنفسي).
- استخدمي كلمات مثل: زعم، ادّعى، المستند إلى محضر باطل.
- اذكري الأسماء والأماكن والتواريخ بدقة من الوقائع المُعطاة — بدون أقواس معقوفة
  أو معلومات مخترعة.
- ممنوع أي ذكر لحكم نقض أو رقم مادة قانونية هنا — ده مكانه أقسام تانية.
- ممنوع أي عنوان أو رقم قسم أو Markdown — نص الوقائع مباشرة بس."""


def build_defenses_section_prompt(context_block: str, crime_type: str | None,
                                   legal_nature: str | None) -> str:
    """system prompt مركّز لقسمي 'ثانياً: الدفوع الشكلية' و'ثالثاً: الدفوع
    الموضوعية' مع بعض (لازم يكونوا مع بعض عشان الموديل يقدر يميز بينهم صح
    ويتجنب التكرار)."""
    specific_guidance = CRIME_SPECIFIC_DEFENSE_GUIDANCE.get(crime_type, DEFAULT_CRIME_GUIDANCE)
    nature_guidance = NATURE_GUIDANCE.get(
        legal_nature,
        "استنتجي من الوقائع هل الجريمة عمدية أم لا، واستخدمي المصطلح القانوني الصحيح فقط."
    )

    return f"""أنت محامٍ مصري مخضرم. مهمتك محدودة جداً: اكتب **قسمين بس** من مذكرة دفاع:
"ثانياً: الدفوع الشكلية" ثم "ثالثاً: الدفوع الموضوعية".

{"=" * 60}
المصادر القانونية المتاحة لهذه القضية
{"=" * 60}
{context_block}

{"=" * 60}
قواعد صارمة
{"=" * 60}
1. اكتبي القسمين بعناوينهم بالحرف: "ثانياً: الدفوع الشكلية" ثم "ثالثاً: الدفوع الموضوعية".
2. الشكلية = بطلان إجراءات فقط (قبض/تفتيش/إذن/إعلان). لو مفيش عيب إجرائي حقيقي
   واضح في الوقائع، اكتبي جملة واحدة بس: "لا توجد دفوع شكلية جوهرية تثيرها
   ظروف هذه القضية." ثم انتقلي فوراً للموضوعية. ممنوع اختراع بطلان وهمي.
3. الموضوعية = انتفاء الركن المادي/المعنوي، التلفيق والكيدية، عدم كفاية الأدلة.
   ركّزي هنا على أركان الجريمة الحقيقية، مش تكرار كلام البطلان.
4. توجيه الركن المعنوي: {nature_guidance}
5. توجيه خاص بنوع الجريمة: {specific_guidance}
6. ⚠️⚠️ كل حكم نقض ظاهر في المصادر أعلاه لازم يُذكر رقمه وسنته حرفياً مرة
   واحدة على الأقل (بصيغة: طعن رقم XXX لسنة XX) — ممنوع تجاهل أي حكم متاح،
   وممنوع اختراع رقم طعن مش موجود في المصادر فوق.
7. المواد القانونية تُذكر فقط من "نصوص القوانين الرسمية" — مش من "شروح
   ومذكرات إيضاحية" (دي للفهم بس، مش نص ملزم).
8. ⚠️ ممنوع منعاً باتاً استيراد مفاهيم من جريمة مختلفة (بصمات، كاميرات
   مراقبة، دفع الحيازة) إلا لو وردت فعلاً وحرفياً في الوقائع.
9. ممنوع أي جملة أو اقتباس من مصدر لم يُذكر صراحة في المصادر أعلاه — ممنوع
   اختراع أي اقتباس بين علامتي تنصيص.
10. ممنوع أي عنوان قبل "ثانياً" أو أي Markdown."""


def build_requests_section_prompt(has_real_procedural_defense: bool) -> str:
    """system prompt مركّز لقسمي 'رابعاً: الطلبات الختامية' و'خامساً:
    الطلبات الإجرائية المصاحبة'."""
    procedural_note = (
        "⚠️ يوجد دفع شكلي حقيقي في الدفوع (بطلان إجراءات) — لازم الطلب الأصلي "
        "يطلب قبول الدفع الشكلي وبطلان الإجراءات، والاحتياطي انتفاء الأركان "
        "وعدم كفاية الأدلة."
        if has_real_procedural_defense else
        "⚠️ لا يوجد دفع شكلي حقيقي — الطلب الأصلي يكون مباشرة ببراءة المتهم "
        "لانتفاء الأركان وعدم كفاية أدلة الثبوت، بدون أي ذكر لـ'قبول الدفوع "
        "الشكلية' أو 'بطلان الإجراءات' إطلاقاً."
    )
    return f"""أنت محامٍ مصري مخضرم. مهمتك محدودة جداً: اكتب **قسمين بس** من مذكرة دفاع:
"رابعاً: الطلبات الختامية" ثم "خامساً: الطلبات الإجرائية المصاحبة".

{procedural_note}

# قواعد صارمة بالحرف — لازم تُتبع تماماً:
- ابدئي بـ "رابعاً: الطلبات الختامية"
- الطلب الأصلي يبدأ حرفياً بـ: "أولاً وبصفة أصلية:"
- الطلب الاحتياطي يبدأ حرفياً بـ: "ثانياً واحتياطياً عن الأول:"
- بعدهم مباشرة: "ثالثاً وفي جميع الأحوال: إخلاء سبيل المتهم فوراً إن كان
  محبوساً احتياطياً."
- بعد كده قسم "خامساً: الطلبات الإجرائية المصاحبة" فيه 2-3 طلبات إجرائية
  دقيقة بصيغة "يُلتمس"، مبنية على وقائع القضية فقط.
- ⚠️ ممنوع كتابة "استدعاء شهود النيابة" — النيابة العامة خصم في الدعوى
  وليس لها شهود؛ الصحيح "استدعاء المجني عليه وضابط الواقعة (مُحرر المحضر)
  أمام المحكمة لمناقشتهم".
- ⚠️ ممنوع طلب "كاميرات مراقبة" إلا لو الجريمة وقعت في مكان عام له كاميرات فعلاً.
- اختمي بالضبط بـ:
  "وتفضلوا بقبول فائق الاحترام والتقدير،،،"
  ثم سطر "المحامي"
  ثم سطر "[اسم المحامي]"
  ثم سطر "المقيد بنقابة المحامين المصريين"
- ممنوع أي Markdown أو عناوين إضافية."""


def generate_memo(case_facts: str, system_prompt: str = None, *,
                   context_block: str | None = None,
                   crime_type: str | None = None,
                   legal_nature: str | None = None,
                   case_metadata: dict | None = None,
                   is_correction: bool = False) -> str:
    """توليد مذكرة الدفاع عبر الـ LLM.

    ✏️ الوضع العادي (is_correction=False, الافتراضي): بيقسّم التوليد لـ 4
    أجزاء صغيرة — ديباجة ثابتة بالكود + 3 نداءات LLM مركّزة (وقائع / دفوع /
    طلبات) — بالظبط زي contract_pipeline.py بيولّد كل بند عقد لوحده. كل نداء
    بياخد بس الـ context اللي يخصه، فمحتاج context window أصغر بكتير من
    النداء الواحد الضخم الأصلي.

    جولات التصحيح (is_correction=True): لسه بتستخدم نداء واحد على
    system_prompt الكامل (build_system_prompt) + المذكرة الكاملة، زي المنطق
    الأصلي بالظبط — لأن التصحيح بيحتاج يشوف المذكرة كلها مع بعض عشان يصلح
    التناقضات بين الأقسام."""
    if not case_facts or not case_facts.strip():
        raise RuntimeError("وقائع القضية وصلت فاضية لمرحلة التوليد — على الأغلب خطوة سابقة "
                            "(تلخيص/توسيع الوقائع) فشلت في الرجوع بنص. جرّبي تاني.")

    # ── جولات التصحيح: سلوك قديم بلا تغيير ──────────────────────────
    if is_correction:
        if not system_prompt:
            raise RuntimeError("generate_memo(is_correction=True) محتاجة system_prompt.")
        return llm_text([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"وقائع القضية:\n{case_facts.strip()}"},
        ], temperature=0.15, max_tokens=7000)

    # ── التوليد العادي: 4 أجزاء (ديباجة + 3 نداءات مركّزة) ──────────
    meta = case_metadata or {}
    defendant_name = meta.get("defendant_name") or "[اسم المتهم]"
    case_number = meta.get("case_number") or ""
    court = meta.get("court") or ""

    header = build_static_memo_header(defendant_name, case_number, court)

    # 1) الوقائع
    facts_prompt = build_facts_section_prompt(crime_type, legal_nature)
    facts_section = llm_text([
        {"role": "system", "content": facts_prompt},
        {"role": "user", "content": f"وقائع القضية:\n{case_facts.strip()}"},
    ], temperature=0.15, max_tokens=2500)

    # 2) الدفوع (شكلية + موضوعية مع بعض)
    defenses_prompt = build_defenses_section_prompt(context_block or "", crime_type, legal_nature)
    defenses_section = llm_text([
        {"role": "system", "content": defenses_prompt},
        {"role": "user", "content": f"وقائع القضية:\n{case_facts.strip()}"},
    ], temperature=0.15, max_tokens=3000)

    # 3) الطلبات (بناءً على هل ظهر دفع شكلي حقيقي في الدفوع اللي طلعت فعلاً)
    has_real_procedural = any(k in defenses_section for k in PROCEDURAL_KEYWORDS)
    requests_prompt = build_requests_section_prompt(has_real_procedural)
    requests_section = llm_text([
        {"role": "system", "content": requests_prompt},
        {"role": "user", "content": (
            f"وقائع القضية:\n{case_facts.strip()}\n\n"
            f"ملخص الدفوع المكتوبة (عشان الطلبات تتوافق معاها):\n{defenses_section[:1200]}"
        )},
    ], temperature=0.15, max_tokens=2500)

    return f"{header}\n\nأولاً: وقائع الدعوى\n{facts_section}\n\n{defenses_section}\n\n{requests_section}"


CROSS_CONTAMINATION_TERMS = {
    "بصمات": ["مخدرات", "سلاح وذخيره", "سرقة وسطو", "قتل ومحاولة قتل عمد", "تزوير وتقليد"],
    "كاميرات المراقبة": ["سرقة وسطو", "قتل ومحاولة قتل عمد", "قتل خطأ وحوادث سيارات", "الإضرار والبلاغات"],
    "كاميرات الشوارع": ["سرقة وسطو", "قتل ومحاولة قتل عمد", "قتل خطأ وحوادث سيارات"],
    "انتفاء الصلة أو الحيازة": ["مخدرات", "سلاح وذخيره"],
    "انتفاء الحيازة": ["مخدرات", "سلاح وذخيره"],
    "استدعاء شهود النيابة": [],
    "بطلان محضر الضبط لعدم كفاية الأدلة": ["مخدرات", "سلاح وذخيره", "سرقة وسطو", "قتل ومحاولة قتل عمد", "تزوير وتقليد"],
    "بطلان الإيصال لكونه على بياض": [],
}


def check_crime_type_contamination(memo: str, crime_type: str | None,
                                    case_facts: str) -> list[str]:
    """فحص هل المذكرة تحتوي عبارات تخص نوع جريمة آخر غير المذكور في الوقائع."""
    warnings = []
    crime_is_known = crime_type in CRIME_CATEGORIES

    for term, allowed_types in CROSS_CONTAMINATION_TERMS.items():
        if term in memo and term not in case_facts:
            if not allowed_types:
                warnings.append(f"عبارة غير صحيحة قانونياً بلا شرط نوع الجريمة: '{term}'")
            elif crime_is_known and crime_type not in allowed_types:
                warnings.append(
                    f"خلط محتمل بين أنواع الجرائم: العبارة '{term}' لا تتوافق مع "
                    f"نوع الجريمة الحالي ({crime_type})"
                )
    return warnings


def _clean_memo_for_parsing(memo: str) -> str:
    """تنظيف المذكرة قبل أي parsing بالـ regex."""
    cleaned = re.sub(r'[-─═=]{3,}', '', memo)
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned


PROCEDURAL_KEYWORDS = [
    "بطلان القبض", "بطلان التفتيش", "بطلان الإعلان", "عدم الاختصاص",
    "بطلان الإذن", "عدم صحة الإجراءات", "بطلان محضر الضبط", "بطلان الإحالة",
    "بطلان الإجراءات",
]
SUBSTANTIVE_LEAKAGE_KEYWORDS = [
    "انتفاء الخطأ", "انتفاء أركان الجريمة", "عدم كفاية الأدلة",
    "انتفاء القصد", "انتفاء السببية", "انتفاء الركن المادي",
]


def check_procedural_substantive_mixup(memo: str) -> list[str]:
    """فحص هل قسم الدفوع الشكلية يحتوي دفعاً موضوعياً بالخطأ."""
    warnings = []
    cleaned = _clean_memo_for_parsing(memo)
    m = re.search(
        r"(?:ثانياً|ثانيًا)[:\s]*الدفوع\s+الشكلية(.*?)(?:ثالثاً|ثالثًا|الدفوع\s+الموضوعية)",
        cleaned, re.DOTALL
    )
    if not m:
        return warnings
    shakli_section = m.group(1)
    has_real_procedural = any(k in shakli_section for k in PROCEDURAL_KEYWORDS)
    has_substantive_leak = any(k in shakli_section for k in SUBSTANTIVE_LEAKAGE_KEYWORDS)
    if has_substantive_leak and not has_real_procedural:
        warnings.append(
            "خلط شكلي/موضوعي: قسم الدفوع الشكلية يحتوي دفعاً يمس أركان الجريمة وليس إجرائياً بحتاً"
        )
    return warnings


def check_intent_vs_negligence_logic(memo: str, legal_nature: str | None) -> list[str]:
    """فحص توافق المصطلحات القانونية مع طبيعة الجريمة (عمدي/غير عمدي)."""
    warnings = []
    if legal_nature == "غير عمدي" and "انتفاء القصد الجنائي" in memo:
        warnings.append(
            "خطأ قانوني: جريمة غير عمدية لا يصح فيها الدفع بـ'انتفاء القصد الجنائي'؛ "
            "الصحيح 'انتفاء ركن الخطأ' أو 'انقطاع السببية'"
        )
    if legal_nature == "عمدي" and (
        "انتفاء ركن الخطأ" in memo or "استغراق خطأ المجني عليه" in memo
    ):
        warnings.append(
            "خطأ قانوني: جريمة عمدية، الدفع بالركن المعنوي يجب أن يكون "
            "'انتفاء القصد الجنائي' لا 'انتفاء الخطأ'"
        )
    return warnings


PROCEDURAL_IN_SUBSTANTIVE_TRIGGERS = [
    "بطلان الإجراءات", "بطلان إجراءات", "بطلان المحضر",
    "بطلان محضر الضبط", "بطلان القبض", "بطلان التفتيش",
    "بطلان الإذن", "بطلان الإعلان", "بطلان الإحالة",
]


def check_procedural_in_substantive_section(memo: str) -> list[str]:
    """فحص حتمي — يكشف لو دفع شكلي إجرائي وقع في قسم الدفوع الموضوعية."""
    warnings = []
    sections = extract_memo_sections(memo)
    mawdo3i = sections.get("دفوع_موضوعية", "")

    if mawdo3i == "(القسم غير موجود أو فارغ)":
        return warnings

    for trigger in PROCEDURAL_IN_SUBSTANTIVE_TRIGGERS:
        if trigger in mawdo3i:
            warnings.append(
                f"دفع شكلي إجرائي ('{trigger}') وُضع خطأً تحت قسم الدفوع الموضوعية — "
                f"الصحيح نقله إلى قسم الدفوع الشكلية"
            )
    return warnings


def extract_memo_sections(memo: str) -> dict:
    """استخراج الأقسام الرئيسية من المذكرة كـ dict مهيكل."""
    cleaned = _clean_memo_for_parsing(memo)
    sections = {}

    m_shakli = re.search(
        r"(?:ثانياً|ثانيًا)[:\s]*الدفوع\s+الشكلية(.*?)(?:ثالثاً|ثالثًا|الدفوع\s+الموضوعية)",
        cleaned, re.DOTALL
    )
    sections["دفوع_شكلية"] = m_shakli.group(1).strip() if m_shakli else "(القسم غير موجود أو فارغ)"

    m_mawdo3i = re.search(
        r"(?:ثالثاً|ثالثًا)[:\s]*الدفوع\s+الموضوعية(.*?)(?:رابعاً|رابعًا|الطلبات\s+الختامية)",
        cleaned, re.DOTALL
    )
    sections["دفوع_موضوعية"] = m_mawdo3i.group(1).strip() if m_mawdo3i else "(القسم غير موجود أو فارغ)"

    m_talabat = re.search(
        r"(?:رابعاً|رابعًا)[:\s]*الطلبات\s+الختامية(.*?)(?:خامساً|خامسًا|$)",
        cleaned, re.DOTALL
    )
    sections["طلبات_ختامية"] = m_talabat.group(1).strip() if m_talabat else "(القسم غير موجود)"

    m_ijraeyah = re.search(
        r"(?:خامساً|خامسًا)[:\s]*الطلبات\s+الإجرائية(.*)",
        cleaned, re.DOTALL
    )
    sections["طلبات_إجرائية"] = m_ijraeyah.group(1).strip() if m_ijraeyah else "(القسم غير موجود)"

    return sections


CRITIC_LEGAL_DEFINITIONS = """\
═══════════════════════════════════════════════════
التعريفات القانونية الصارمة (القانون المصري)
═══════════════════════════════════════════════════

أولاً: الدفوع الشكلية / الإجرائية (Procedural Defenses)
هي دفوع تتعلق بصحة الإجراءات الشكلية فقط، ولا تمس أركان الجريمة ذاتها:
  • بطلان القبض
  • بطلان التفتيش
  • بطلان إذن النيابة العامة
  • بطلان الإعلان (إعلان الجلسة / إعلان المتهم)
  • عدم الاختصاص (محلي / نوعي)
  • بطلان الإجراءات (كدفع إجرائي بحت يتعلق بعيب شكلي في إجراء من إجراءات التحقيق أو المحاكمة)
  • انتفاء التلبس (كحالة واقعة تفتقر لشرط التلبس الحقيقي)
  • بطلان محضر الضبط (بطلان شكلي محض — مثلاً: محرر بعد فوات التلبس)
  • بطلان إحالة الدعوى

ثانياً: الدفوع الموضوعية (Substantive Defenses)
هي دفوع تمس أركان الجريمة أو عناصرها الموضوعية:
  • انتفاء الركن المادي للجريمة
  • انتفاء القصد الجنائي (نية ارتكاب الجريمة)
  • انتفاء الركن المعنوي بشكل عام
  • التلفيق والكيدية (اختلاق الواقعة أو تزوير المحضر)
  • شيوع الاتهام وعدم تحديد المتهم
  • عدم كفاية أدلة الثبوت
  • انتفاء السببية (في الجرائم غير العمدية)
  • انقطاع علاقة السببية
  • تناقض الأدلة

⚠️ قاعدة حاسمة: "بطلان الإجراءات" هو دفع شكلي إجرائي أصيل في القانون المصري.
   لا يُصنّف أبداً كدفع موضوعي حتى لو تطلّب فحص الأساس القانوني.

⚠️ قاعدة حاسمة: "التلفيق والكيدية" و"انتفاء الركن المادي" و"انتفاء القصد الجنائي"
   هي دفوع موضوعية دائماً ولا يجوز وضعها تحت الدفوع الشكلية.

ثالثاً: قواعد خاصة بطبيعة الجريمة (تُطبق تلقائياً حسب legal_nature، مش بالاسم)
  • أي جريمة طبيعتها "عمدي" (كالرشوة، النصب، التزوير، الغش التجاري، السرقة، القتل
    العمد...): الدفع بـ "انتفاء القصد الجنائي" هو دفع موضوعي سليم قانوناً تماماً،
    ولا يجوز اعتباره خطأ أو تناقضاً — بل هو الدفع الصحيح والمتوقع في الركن المعنوي.
  • أي جريمة طبيعتها "غير عمدي" (كالقتل الخطأ، الإصابة الخطأ): الدفع الصحيح هو
    "انتفاء ركن الخطأ" أو "انقطاع السببية"، والدفع بـ"انتفاء القصد الجنائي" هنا
    فقط هو الخطأ (لأن القانون أصلاً يفترض غياب القصد).
"""


def legal_coherence_critic(memo: str, crime_type: str | None,
                            legal_nature: str | None, case_facts: str) -> dict:
    """مراجعة قانونية بالـ LLM لفحص التناسق الداخلي للمذكرة."""
    sections = extract_memo_sections(memo)

    critic_prompt = f"""أنت ناقد قانوني مصري خبير. مهمتك فحص التناسق الداخلي للمذكرة فقط — لا تعد كتابتها.

{CRITIC_LEGAL_DEFINITIONS}

═══════════════════════════════════════════════════
بيانات القضية
═══════════════════════════════════════════════════
نوع الجريمة: {crime_type or 'غير محدد'}
الطبيعة القانونية (عمدي/غير عمدي): {legal_nature or 'غير محددة'}

═══════════════════════════════════════════════════
أقسام المذكرة (مهيكلة — كل قسم لوحده)
═══════════════════════════════════════════════════

## قسم الدفوع الشكلية:
{sections['دفوع_شكلية']}

## قسم الدفوع الموضوعية:
{sections['دفوع_موضوعية']}

## قسم الطلبات الختامية:
{sections['طلبات_ختامية']}

═══════════════════════════════════════════════════
قواعد الفحص الصارمة
═══════════════════════════════════════════════════
1. ⚠️ لا تهاجم تصنيف دفع إلا إذا كان فعلاً في القسم الخطأ.
   — مثلاً: لو "التلفيق والكيدية" مكتوب تحت "الدفوع الموضوعية" فهذا صحيح (موضوعي) — لا تنتقده.
   — لو "بطلان الإجراءات" مكتوب تحت "الدفوع الموضوعية" فهذا خطأ (الصحيح شكلي) — انتقده.
   — لو "انتفاء الركن المادي" مكتوب تحت "الدفوع الموضوعية" فهذا صحيح — لا تنتقده.

2. تحقق فقط من:
   (أ) هل دفع موضوعي وُضع تحت قسم الشكلية؟ (خطأ)
   (ب) هل دفع شكلي وُضع تحت قسم الموضوعية؟ (خطأ)
   (ج) هل عنوان الدفع لا يتطابق مع مضمونه؟
   (د) هل مصطلح قانوني يتناقض مع طبيعة الجريمة؟ (قصد في غير عمدي)
   (هـ) هل استشهاد (رقم طعن/مادة) غير مرتبط بسياقه؟

3. ⚠️ ممنوع إصدار ملاحظة على دفع لمجرد أنه "يتطلب فحص الأدلة".
   كثير من الدفوع — شكلية كانت أم موضوعية — تتطلب فحص أدلة. هذا لا يُغيّر تصنيفها.

4. ⚠️ لو لم تجد أي مشكلة حقيقية، أخرج: {{"issues": []}}
   لا تُصنّف ملاحظات وهمية فقط لتبدو نشيطاً.

أخرج فقط JSON: {{"issues": [{{"type": "...", "description": "...", "severity": "high|medium"}}]}}
إن لم تجد مشكلة: {{"issues": []}}"""

    try:
        raw = llm_text([{"role": "user", "content": critic_prompt}],
                        temperature=0.0, max_tokens=1500)
    except RuntimeError as e:
        return {"issues": [], "parse_error": str(e)}
    raw = re.sub(r"^```json|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except Exception:
        return {"issues": [], "parse_error": raw}


def extract_cassation_citations(text: str) -> set:
    """استخراج مجموعة (رقم الطعن, السنة) من نص المذكرة."""
    return set(re.findall(r'طعن رقم\s*(\d+)\s*لسنة\s*(\d+)', text))


def check_citation_fidelity(memo: str, cassation_used: list) -> dict:
    """فحص دقة الاستشهاد بأحكام النقض."""
    memo_citations = extract_cassation_citations(memo)
    source_citations = set()
    for h in cassation_used:
        meta = h.get("metadata", {})
        if meta.get("ruling_num") and meta.get("ruling_year"):
            source_citations.add((str(meta["ruling_num"]), str(meta["ruling_year"])))

    unverified_citations = memo_citations - source_citations

    quotes = re.findall(r'"([^"]{15,})"', memo)
    source_text = " ".join(h.get("content", "") for h in cassation_used)
    unverified_quotes = [q for q in quotes if q[:25] not in source_text]

    return {
        "memo_citations": sorted(memo_citations),
        "source_citations": sorted(source_citations),
        "unverified_citations": sorted(unverified_citations),
        "unverified_quotes": unverified_quotes,
    }


def check_fewshot_leak(memo: str) -> list[str]:
    """فحص هل المذكرة تسربت منها جمل من FEW_SHOT_EXAMPLE."""
    warnings = []
    quotes = re.findall(r'"([^"]{15,})"', memo)
    for q in quotes:
        if q[:30] in FEW_SHOT_EXAMPLE:
            warnings.append(
                f"تسريب مؤكد من FEW_SHOT_EXAMPLE: \"{q[:60]}...\" — ده مثال توضيحي ثابت مش مصدر حقيقي"
            )
    return warnings


NO_PROCEDURAL_DEFENSE_MARKERS = ["لا توجد دفوع شكلية جوهرية"]
PROCEDURAL_WIN_REQUEST_MARKERS = [
    "قبول الدفوع الشكلية", "بطلان الإجراءات المعيبة", "بطلان الإجراءات",
]


def check_request_consistency(memo: str) -> list[str]:
    """فحص توافق قسم الطلبات الختامية مع قسم الدفوع الشكلية."""
    warnings = []
    cleaned = _clean_memo_for_parsing(memo)
    m_shakli = re.search(
        r"(?:ثانياً|ثانيًا)[:\s]*الدفوع\s+الشكلية(.*?)(?:ثالثاً|ثالثًا|الدفوع\s+الموضوعية)",
        cleaned, re.DOTALL
    )
    m_talabat = re.search(
        r"(?:رابعاً|رابعًا)[:\s]*الطلبات\s+الختامية(.*?)(?:خامساً|خامسًا|$)",
        cleaned, re.DOTALL
    )
    if not m_shakli or not m_talabat:
        return warnings

    no_procedural = any(
        marker in m_shakli.group(1) for marker in NO_PROCEDURAL_DEFENSE_MARKERS
    )
    requests_procedural_win = any(
        marker in m_talabat.group(1) for marker in PROCEDURAL_WIN_REQUEST_MARKERS
    )

    if no_procedural and requests_procedural_win:
        warnings.append(
            "تناقض: قسم الدفوع الشكلية يقر بعدم وجود دفع شكلي جوهري، لكن الطلبات "
            "الختامية بصفة أصلية تطلب الحكم بقبول الدفوع الشكلية/بطلان الإجراءات"
        )
    return warnings


def check_procedural_defense_not_requested(memo: str) -> list[str]:
    """فحص عكسي: دفع شكلي حقيقي بلا طلب مقابل."""
    warnings = []
    sections = extract_memo_sections(memo)
    shakli = sections.get("دفوع_شكلية", "")
    talabat = sections.get("طلبات_ختامية", "")

    if shakli == "(القسم غير موجود أو فارغ)" or talabat == "(القسم غير موجود)":
        return warnings

    has_real_procedural = any(k in shakli for k in PROCEDURAL_KEYWORDS)
    requested_in_talabat = any(
        k in talabat for k in PROCEDURAL_WIN_REQUEST_MARKERS + ["بطلان"]
    )

    if has_real_procedural and not requested_in_talabat:
        warnings.append(
            "دفع شكلي حقيقي مذكور في قسم ثانياً (الدفوع الشكلية) لكنه لم يُترجم "
            "لأي طلب في قسم رابعاً (الطلبات الختامية) — الدفع يبقى بلا أثر قانوني"
        )
    return warnings


def validate_memo(memo: str, laws_used: list, cassation_used: list,
                   crime_type: str | None = None, legal_nature: str | None = None,
                   case_facts: str = "") -> dict:
    """فحص شامل للمذكرة يجمع كل الفحوصات الحتمية + الناقد القانوني."""
    results: dict = {}
    critic_high: list[dict] = []
    critic_issues: list[dict] = []

    structural = {
        "بسم الله": "بسم الله" in memo,
        "ديباجة المذكرة": "مذكرة بدفاع" in memo,
        "وقائع الدعوى": "وقائع" in memo,
        "دفوع شكلية": "شكلي" in memo or "الشكلية" in memo,
        "دفوع موضوعية": "موضوعي" in memo or "الموضوعية" in memo,
        "طلب أصلي": "بصفة أصلية" in memo or "أصلياً" in memo,
        "طلب احتياطي": "احتياطياً عن الأول" in memo or "واحتياطياً" in memo,
        "بند إخلاء السبيل المستقل": bool(re.search(r"ثالثاً\s*وفي جميع الأحوال", _clean_memo_for_parsing(memo))),
        "النيابة العامة": "النيابة العامة" in memo,
        "الطلبات الإجرائية": "خامساً" in memo and "الطلبات الإجرائية" in memo,
    }
    struct_score = sum(structural.values()) / len(structural)
    results["structural"] = structural
    results["structural_score"] = round(struct_score, 2)

    request_consistency_warnings = check_request_consistency(memo)
    results["request_consistency_warnings"] = request_consistency_warnings

    procedural_not_requested_warnings = check_procedural_defense_not_requested(memo)
    results["procedural_not_requested_warnings"] = procedural_not_requested_warnings

    memo_articles = set(re.findall(r'مادة\s*(\d+)', memo))
    source_articles = set()
    for h in laws_used:
        if h.get("article_num"):
            source_articles.add(h["article_num"])
        source_articles.update(re.findall(r'مادة\s*(\d+)', h.get("content", "")))
    unverified = memo_articles - source_articles
    results["memo_articles"] = sorted(memo_articles)
    results["source_articles"] = sorted(source_articles)
    results["unverified_articles"] = sorted(unverified)

    results["has_cassation_reference"] = bool(re.search(r'نقض|طعن|محكمة النقض', memo))

    contamination_warnings = check_crime_type_contamination(memo, crime_type, case_facts)
    results["contamination_warnings"] = contamination_warnings

    citation_fidelity = check_citation_fidelity(memo, cassation_used)
    results["citation_fidelity"] = citation_fidelity

    fewshot_leak_warnings = check_fewshot_leak(memo)
    results["fewshot_leak_warnings"] = fewshot_leak_warnings

    mixup_warnings = check_procedural_substantive_mixup(memo)
    results["mixup_warnings"] = mixup_warnings

    proc_in_sub_warnings = check_procedural_in_substantive_section(memo)
    results["proc_in_sub_warnings"] = proc_in_sub_warnings

    intent_warnings = check_intent_vs_negligence_logic(memo, legal_nature)
    results["intent_warnings"] = intent_warnings

    if struct_score >= 0.7:
        critic_result = legal_coherence_critic(memo, crime_type, legal_nature, case_facts)
    else:
        critic_result = {"issues": []}

    critic_issues = critic_result.get("issues", [])
    critic_high = [i for i in critic_issues if i.get("severity") == "high"]

    if proc_in_sub_warnings:
        wrong_direction = [
            i for i in critic_high
            if "بطلان الإجراءات" in i.get("description", "")
            and ("موضوعي" in i.get("description", ""))
        ]
        critic_high = [i for i in critic_high if i not in wrong_direction]

    critic_mixup_claims = [
        i for i in critic_issues
        if i.get("severity") == "high"
        and ("شكلي" in i.get("description", "") or "موضوعي" in i.get("description", ""))
    ]
    if critic_mixup_claims and not mixup_warnings and not proc_in_sub_warnings:
        critic_high = [i for i in critic_high if i not in critic_mixup_claims]

    results["critic_issues"] = critic_issues

    citation_fidelity = check_citation_fidelity(memo, cassation_used)
    has_available_sources = len(citation_fidelity["source_citations"]) > 0
    has_any_citation_in_memo = len(citation_fidelity["memo_citations"]) > 0
    crime_is_known = crime_type in CRIME_CATEGORIES
    results["ignored_available_citations"] = (
        crime_is_known and has_available_sources and not has_any_citation_in_memo
    )

    results["passed"] = (
        struct_score >= 0.8
        and len(unverified) == 0
        and len(contamination_warnings) == 0
        and len(citation_fidelity["unverified_citations"]) == 0
        and len(citation_fidelity["unverified_quotes"]) == 0
        and not results["ignored_available_citations"]
        and len(fewshot_leak_warnings) == 0
        and len(mixup_warnings) == 0
        and len(proc_in_sub_warnings) == 0
        and len(intent_warnings) == 0
        and len(procedural_not_requested_warnings) == 0
        and len(critic_high) == 0
    )

    return results


def _count_deterministic_issues(val: dict) -> int:
    """عدّاد صادق يشمل كل أسباب الفشل الفعلية."""
    list_based = sum(len(val.get(k, [])) for k in [
        'mixup_warnings', 'proc_in_sub_warnings', 'intent_warnings',
        'contamination_warnings', 'fewshot_leak_warnings',
        'request_consistency_warnings',
    ])
    list_based += len(val.get('unverified_articles', []))
    cf = val.get('citation_fidelity', {})
    list_based += len(cf.get('unverified_citations', []))
    list_based += len(cf.get('unverified_quotes', []))
    list_based += 1 if val.get('ignored_available_citations') else 0
    return list_based


def _build_correction_prompt(system_prompt: str, memo: str,
                              validation: dict) -> str:
    """بناء برومبت التصحيح من ملاحظات الـ Validator."""
    feedback_parts = []

    for issue in validation.get("critic_issues", []):
        feedback_parts.append(
            f"  - [{issue.get('severity', '?')}] {issue.get('description', '')}"
        )

    for key, label in [
        ("mixup_warnings", "خلط شكلي/موضوعي"),
        ("proc_in_sub_warnings", "دفع شكلي في قسم الموضوعية"),
        ("intent_warnings", "خطأ قصد/خطأ"),
        ("contamination_warnings", "تلوث أنواع جرائم"),
        ("fewshot_leak_warnings", "تسريب من المثال الثابت"),
        ("request_consistency_warnings", "تناقض الطلبات مع الدفوع"),
    ]:
        for w in validation.get(key, []):
            feedback_parts.append(f"  - [high] {label}: {w}")

    for key, label in [
        ("mixup_warnings", "خلط شكلي/موضوعي"),
        ("intent_warnings", "خطأ قصد/خطأ"),
        ("contamination_warnings", "تلوث أنواع جرائم"),
        ("fewshot_leak_warnings", "تسريب من المثال الثابت"),
        ("request_consistency_warnings", "تناقض الطلبات مع الدفوع"),
    ]:
        for w in validation.get(key, []):
            feedback_parts.append(f"  - [high] {label}: {w}")

    if validation.get("proc_in_sub_warnings"):
        feedback_parts.append(
            "  - [high] ⚠️⚠️ تعليمة حاسمة يجب تنفيذها بالحرف: يوجد دفع بطلان إجراءات "
            "مكتوب خطأً تحت قسم 'الدفوع الموضوعية'. احذفيه بالكامل من قسم ثالثاً، "
            "وانقليه بصياغة كاملة إلى قسم 'ثانياً: الدفوع الشكلية' تشرح العيب الإجرائي "
            "الفعلي في الوقائع. ممنوع ترك جملة 'لا توجد دفوع شكلية جوهرية' في قسم ثانياً "
            "طالما هذا الدفع الإجرائي حقيقي وموجود فعلاً."
        )

    if validation.get("unverified_articles"):
        feedback_parts.append(
            f"  - [high] مواد قانونية غير موثقة: {validation['unverified_articles']}"
        )

    unv_cit = validation.get("citation_fidelity", {}).get("unverified_citations", [])
    if unv_cit:
        feedback_parts.append(
            f"  - [high] أرقام طعون غير موجودة في المصادر: {unv_cit}"
        )
    unv_quotes = validation.get("citation_fidelity", {}).get("unverified_quotes", [])
    if unv_quotes:
        feedback_parts.append(
            "  - [high] توجد اقتباسات بين علامتي تنصيص غير موجودة حرفياً في "
            "المصادر — احذف علامات التنصيص أو أعد صياغة المبدأ بأسلوبك دون اقتباس وهمي."
        )

    structural = validation.get("structural", {})
    if not structural.get("الطلبات الإجرائية", True):
        feedback_parts.append(
            "  - [high] قسم 'خامساً: الطلبات الإجرائية المصاحبة' مفقود تماماً من "
            "المذكرة — أعد كتابته بالكامل في نهاية المذكرة مع 2-3 طلبات إجرائية "
            "مناسبة لوقائع القضية بصيغة 'يُلتمس'."
        )
    if not structural.get("طلب أصلي", True):
        feedback_parts.append(
            "  - [high] صيغة الطلب الأصلي يجب أن تبدأ حرفياً بـ 'أولاً وبصفة "
            "أصلية:' — لا يجوز اختصارها لمجرد 'أولاً:'. التزم بصيغة القالب الإلزامي بالحرف."
        )
    if not structural.get("طلب احتياطي", True):
        feedback_parts.append(
            "  - [high] صيغة الطلب الاحتياطي يجب أن تبدأ حرفياً بـ 'ثانياً "
            "واحتياطياً عن الأول:' — لا يجوز اختصارها. التزم بصيغة القالب الإلزامي بالحرف."
        )

    if not feedback_parts:
        return ""

    feedback_text = "\n".join(feedback_parts)

    return f"""{system_prompt}

{"=" * 65}
⚠️ ملاحظات المراجع القانوني على المسودة السابقة — أصلحها فوراً
{"=" * 65}
{feedback_text}

{"=" * 65}
✅ المذكرة السابقة (أعد كتابتها بالكامل مع تصحيح الملاحظات أعلاه)
{"=" * 65}
{memo}

تعليمات التصحيح:
1. أصلح كل ملاحظة واردة أعلاه بالضبط.
2. أعد كتابة المذكرة كاملة بأقسامها الخمسة — لا تحذف أي قسم كان موجوداً في
   المسودة السابقة حتى لو لم يُذكر في الملاحظات أعلاه.
3. لا تُضف ملاحظاتك أو تعليقاتك على الملاحظات — اكتب المذكرة فقط.
4. التزم بالهيكل الإلزامي والقواعد الصارمة الأصلية بالكامل، وبالصيغة الحرفية
   "أولاً وبصفة أصلية" و"ثانياً واحتياطياً عن الأول" في قسم الطلبات الختامية."""


def draft_defense_memo(
    case_facts: str,
    top_k_cassation: int = 4,
    top_k_laws: int = 4,
    top_k_memos: int = 3,
    max_correction_rounds: int | None = None,
    verbose: bool = True,
    case_metadata: dict | None = None,
) -> dict:
    """الـ Pipeline الكامل: استرجاع → توسيع وقائع → توليد مقسّم (وقائع/دفوع/
    طلبات) → تحقق → تصحيح (لو لازم). case_metadata اختياري (اسم المتهم/رقم
    القضية/المحكمة) عشان الديباجة الثابتة تتبنى بيه — لو مش متوفرة، بيتم
    استخراج الاسم من case_facts تلقائياً."""
    if max_correction_rounds is None:
        max_correction_rounds = MEMO_MAX_CORRECTION_ROUNDS
    max_correction_rounds = max(0, int(max_correction_rounds))

    if verbose:
        print("📚 [1/5] جاري الاسترجاع الذكي من Qdrant...")
    retrieved = smart_retrieve_all(case_facts, top_k_cassation, top_k_laws, top_k_memos)
    cassation = retrieved["cassation"]
    laws = retrieved["laws"]
    qa = retrieved["qa"]
    memos = retrieved["memos"]
    crime_type = retrieved["crime_type"]
    legal_nature = retrieved["legal_nature"]
    total = len(cassation) + len(laws) + len(qa) + len(memos)
    if verbose:
        print(f"   ✅ {total} مصدر")

    if verbose:
        print("🧠 [2/5] توسيع الوقائع...")
    rich_facts = expand_facts_and_extract_logic(case_facts, retrieved)

    if verbose:
        print("🏗️  [3/5] بناء الـ context...")
    context_block = build_context_block(cassation, laws, qa, memos, laws2=retrieved.get("laws2"))
    system_prompt = build_system_prompt(context_block, crime_type, legal_nature)  # للتصحيح بس

    # استخراج بيانات الديباجة من case_facts لو case_metadata مش متبعتة
    meta = dict(case_metadata) if case_metadata else {}
    if "defendant_name" not in meta:
        m = re.search(r"اسم المتهم\s*:\s*(.+)", case_facts)
        name = m.group(1).strip() if m else None
        meta["defendant_name"] = name if (name and not name.startswith("[")) else None
    if "case_number" not in meta:
        m = re.search(r"رقم القضية\s*:\s*(.+)", case_facts)
        num = m.group(1).strip() if m else None
        meta["case_number"] = num if (num and not num.startswith("[")) else None
    if "court" not in meta:
        m = re.search(r"المحكمة\s*:\s*(.+)", case_facts)
        crt = m.group(1).strip() if m else None
        meta["court"] = crt if (crt and not crt.startswith("[")) else None

    if verbose:
        print("✍️  [4/5] التوليد (3 نداءات مركّزة: وقائع / دفوع / طلبات)...")
    memo = generate_memo(
        rich_facts, context_block=context_block,
        crime_type=crime_type, legal_nature=legal_nature,
        case_metadata=meta,
    )

    if verbose:
        print("✅  [5/5] التحقق...")

    correction_round = 0
    for attempt in range(max_correction_rounds + 1):
        val = validate_memo(
            memo, laws, cassation,
            crime_type=crime_type, legal_nature=legal_nature, case_facts=case_facts,
        )

        if val["passed"] or attempt >= max_correction_rounds:
            break

        correction_prompt = _build_correction_prompt(system_prompt, memo, val)
        if not correction_prompt:
            # مفيش ملاحظات قابلة للتصحيح رغم عدم النجاح — يحصل نادراً
            break

        correction_round = attempt + 1
        if verbose:
            det_checks = _count_deterministic_issues(val)
            print(f"\n🔄 [Self-Correction] جولة التصحيح {correction_round}/{max_correction_rounds}")
            print(f"   ملاحظات: {len(val.get('critic_issues', []))} ناقد + {det_checks} فحص حتمي")

        # جولات التصحيح: نداء واحد على المذكرة الكاملة (زي المنطق الأصلي)
        memo = generate_memo(rich_facts, correction_prompt, is_correction=True)

        if verbose:
            print("   ✅ أُعيد التوليد — جاري إعادة التحقق...")

    if verbose:
        status = "PASSED ✅" if val["passed"] else "NEEDS REVIEW ⚠️"
        print(f"\n   🏁 {status} — اكتمال: {val['structural_score'] * 100:.0f}%"
              f"{' (بعد ' + str(correction_round) + ' جولة تصحيح)' if correction_round > 0 else ''}")
        if val["mixup_warnings"]:
            print(f"   ⚠️  خلط شكلي/موضوعي: {val['mixup_warnings']}")
        if val.get("proc_in_sub_warnings"):
            print(f"   ⚠️  دفع شكلي في الموضوعية: {val['proc_in_sub_warnings']}")
        if val["intent_warnings"]:
            print(f"   ⚠️  خطأ قصد/خطأ: {val['intent_warnings']}")
        if val.get("ignored_available_citations"):
            print("   ⚠️  المذكرة تجاهلت أحكام نقض متاحة في المصادر")
        if not val["structural"].get("الطلبات الإجرائية", True):
            print("   ⚠️  قسم 'خامساً: الطلبات الإجرائية' مفقود من المذكرة النهائية")
        if val["critic_issues"]:
            print("   ⚠️  ملاحظات الناقد القانوني:")
            for i in val["critic_issues"]:
                print(f"      [{i.get('severity')}] {i.get('description')}")

    return {
        "memo": memo,
        "validation": val,
        "crime_type": crime_type,
        "legal_nature": legal_nature,
        "sources": retrieved,
        "correction_rounds": correction_round,
    }


def expand_facts_and_extract_logic(case_facts: str, retrieved_context: dict) -> str:
    """توسيع الوقائع بأسلوب قانوني هجومي مع إضافة النقاط الإجرائية الدقيقة."""
    laws_summary = "\n".join(
        f"- {h['title']}: {h['content'][:200]}"
        for h in retrieved_context.get("laws", [])
    )
    cass_summary = "\n".join(
        f"- {h['title']}: {h['content'][:200]}"
        for h in retrieved_context.get("cassation", [])
    )
    crime_type = retrieved_context.get("crime_type")

    procedural_map = {
        "خيانة الأمانة": "أضف فقرة تركز على طبيعة العلاقة التعاقدية (هل التوقيع كان على بياض كضمان لمعاملة تجارية؟) وعلى انتفاء نية التبديد أو الاختلاس. **ممنوع** ذكر بصمات المتهم على الورقة (هو مُقرّ بالتوقيع أصلاً) و**ممنوع** ذكر كاميرات مراقبة.",
        "سرقة وسطو": "أضف فقرة تهاجم ركن الإكراه/التهديد بالقوة تحديداً: هل يوجد تقرير طبي يثبت إصابة المجني عليه؟ وهل كان الضبط في حالة تلبس حقيقية؟",
        "قتل خطأ وحوادث سيارات": "أضف فقرة تهاجم تقرير المعاينة المرورية وتناقضاته، وفقرة عن استغراق خطأ المجني عليه لخطأ المتهم (كعبور غير مخصص/إضاءة معطلة). لا تستخدم كلمة 'ضبط' أو 'تحريات' بالمعنى الجنائي التقليدي.",
        "مخدرات": "أضف فقرة تهاجم 'سلسلة حفظ المضبوطات' (التغليف، الأختام، من نقلها للمعمل)، وفقرة عن غياب أدوات التجزئة أو الاتصالات.",
        "سلاح وذخيره": "أضف فقرة تهاجم 'سلسلة حفظ المضبوطات' وصحة إجراءات التفتيش وإذن النيابة.",
        "تزوير وتقليد": "أضف فقرة تهاجم 'سلسلة حفظ الدليل' للمستند المزور (من ضبطه؟ كيف حفظه؟ هل تعرض للتلاعب؟).",
        "قتل ومحاولة قتل عمد": "أضف فقرة تهاجم تقرير الطب الشرعي وعدم وجود أسلحة أو آثار دم على المتهم، وتطالب بكاميرات الشوارع إن كانت الواقعة في مكان عام.",
        "غش تجاري وتموين": "أضف فقرة تهاجم 'سلسلة حفظ الحرز' (الأختام، الأوزان، من نقله للمعمل الكيماوي) وفقرة عن غياب تقرير معملي معتمد يثبت طبيعة المواد المضبوطة فعلياً.",
    }
    procedural_instruction = procedural_map.get(
        crime_type,
        "لا تضف أي فقرة إجرائية خاصة (بصمات/كاميرات/سلسلة حفظ مضبوطات) لأن نوع الجريمة غير مطابق لأي من الأنواع المعروفة أعلاه — اكتب السرد الوقائعي فقط دون افتراض عناصر تحقيق غير مذكورة."
    )

    expander_prompt = f"""أنت مستشار قانوني مخضرم ومتخصص في صياغة مذكرات الدفاع. مهمتك تحويل وقائع موجزة إلى "وقائع دعوى مهيكلة" جاهزة للطباعة، مع إضافة النقاط الإجرائية الدقيقة التي يغفل عنها المحامون غالباً.

وقائع المحامي المختصرة:
{case_facts}

🏷️ نوع الجريمة المصنف آلياً لهذه القضية بالتحديد: {crime_type or 'غير محدد'}
⚠️ قاعدة صارمة جداً: طبّق فقط التوجيه الإجرائي المطابق حرفياً لهذا التصنيف:
{procedural_instruction}
لا تخترع أو تستعير أي فقرة إجرائية من تصنيف آخر مهما بدا مشابهاً.

القوانين وأحكام النقض المتاحة:
{laws_summary}
{cass_summary}

مطلوب منك:
1. اكتب قسم "وقائع الدعوى" بأسلوب الجزم والقطع القانوني الهجومي.
2. ⚠️ قاعدة صارمة: ممنوع كتابة الأسئلة. اكتب الحقيقة كاملة بأسلوب هجومي.
3. ⚠️ قاعدة صارمة: ممنوع كتابة أرقام المواد القانونية.
4. ⚠️ إلزامية ذكر التفاصيل: استخدم الأسماء الدقيقة كما وردت. ممنوع استخدام أقواس معقوفة.
5. طبّق التوجيه الإجرائي المحدد أعلاه فقط (المطابق لنوع الجريمة المصنف)، ولا تُضف أي فقرة إجرائية غيره.
6. أخرج النص بالشكل التالي فقط:

وقائع الدعوى:
[اكتب هنا وقائع الدعوى بأسلوب محامي مخضرم: هجومي، جازم، يفضح التناقضات دون أن يسأل أسئلة، ومطبّقاً فيه التوجيه الإجرائي أعلاه فقط]"""

    return llm_text([{"role": "user", "content": expander_prompt}],
                     temperature=0.2, max_tokens=2000)


if __name__ == "__main__":
    USER_RAW_INPUT = """
اكتبي هنا كلام المحامي الحر — أي أسلوب، أي ترتيب، فقرة أو أكتر.
النظام يستخرج البيانات المطلوبة تلقائياً عبر extract_intake_from_freetext.
"""

    TEST_QUERY = build_case_from_freetext(USER_RAW_INPUT)
    print(f"\n📋 Case facts المُولَّدة جاهزة (طولها: {len(TEST_QUERY)} حرف)\n")

    print("=" * 70)
    print("🚀 End-to-End Test")
    print("=" * 70 + "\n")

    result = draft_defense_memo(TEST_QUERY)

    print("\n" + "=" * 70)
    print("📄 المذكرة النهائية:")
    print("=" * 70)
    print(result["memo"])

    print("\n" + "=" * 70)
    val = result["validation"]
    print(f"🏁 Validation: {'PASSED ✅' if val['passed'] else 'NEEDS REVIEW ⚠️'}")
    print(f"📊 اكتمال الهيكل: {val['structural_score'] * 100:.0f}%")

    if val["unverified_articles"]:
        print(f"⚠️  مواد غير موثقة: {val['unverified_articles']}")
    else:
        print("✅ كل المواد القانونية موثقة")

    if val["contamination_warnings"]:
        print("⚠️  تحذيرات خلط بين أنواع الجرائم:")
        for w in val["contamination_warnings"]:
            print(f"   - {w}")
    else:
        print("✅ لا يوجد خلط مكتشف بين أنواع الجرائم")

    _cf = val["citation_fidelity"]
    if _cf["unverified_citations"] or _cf["unverified_quotes"]:
        print("⚠️  مشاكل في دقة الاستشهاد بأحكام النقض:")
        if _cf["unverified_citations"]:
            print(f"   - أرقام طعون غير موجودة في المصادر: {_cf['unverified_citations']}")
        if _cf["unverified_quotes"]:
            for q in _cf["unverified_quotes"]:
                print(f"   - اقتباس مشتبه فيه: \"{q[:60]}...\"")
    else:
        print("✅ كل الاقتباسات من أحكام النقض موثقة بمصادرها")

    if val.get("ignored_available_citations"):
        print("⚠️  المذكرة تجاهلت أحكام نقض متاحة في المصادر رغم وجودها")

    if not val["structural"].get("الطلبات الإجرائية", True):
        print("⚠️  قسم 'خامساً: الطلبات الإجرائية' مفقود من المذكرة النهائية")
