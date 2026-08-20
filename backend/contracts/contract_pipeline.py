# import warnings
# warnings.filterwarnings("ignore")
# import os
# os.environ["TRANSFORMERS_VERBOSITY"] = "error"
# os.environ["TOKENIZERS_PARALLELISM"] = "false"

# import re
# import json
# from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchAny
# from sentence_transformers import SentenceTransformer
# from openai import OpenAI  # هنستخدمه للاتصال بـ Ollama (OpenAI-compatible endpoint)
# from pypdf import PdfReader
# from docx import Document
# from docx.shared import Pt, Inches, RGBColor
# from docx.enum.text import WD_ALIGN_PARAGRAPH
# from dotenv import load_dotenv

# load_dotenv()  # بيقرأ ملف .env من نفس مجلد المشروع (لازم يكون فيه QDRANT_URL و QDRANT_API_KEY)

# # ──────────────────────────────────────────────────────────────────
# # إعدادات الاتصال والمسارات
# # ──────────────────────────────────────────────────────────────────
# QDRANT_URL = os.environ.get("QDRANT_URL")
# QDRANT_KEY = os.environ.get("QDRANT_API_KEY")  # نفس اسم المتغير المستخدم في pipeline.py و .env.example

# OLLAMA_MODEL = "qwen3:14b"
# OLLAMA_BASE_URL = "http://localhost:11434/v1"
# CLAUSE_TYPES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
#                                     "muhakkim_specific_clauses.json")

# # توليد بند واحد بيحتاج توكينز أقل بكتير من توليد العقد كله دفعة واحدة
# CLAUSE_MAX_TOKENS = 2500
# INTRO_MAX_TOKENS = 1200

# # ──────────────────────────────────────────────────────────────────
# # إعدادات الـ RAG
# # ──────────────────────────────────────────────────────────────────
# COLLECTION_LAWS = "laws_only"        # القوانين والتشريعات (المصدر الملزم)
# COLLECTION_CONTRACTS = "legal_contracts"        # عقود مرجعية / سوابق (استرشادية فقط)
# EMBED_MODEL_CONTRACTS = "intfloat/multilingual-e5-base"
# EMBED_MODEL_LAWS = "mohamed2811/Muffakir_Embedding_V2"
# LAWS_SCORE_THRESHOLD = 0.72

# # ──────────────────────────────────────────────────────────────────
# # خريطة الكلمات المفتاحية لتحديد نوع العقد
# # ──────────────────────────────────────────────────────────────────
# CONTRACT_TYPE_KEYWORDS = {
#     "sale": ["بيع", "شراء", "مبيع", "بائع", "مشتري", "بيع وشراء"],
#     "lease": ["ايجار", "إيجار", "استئجار", "مؤجر", "مستأجر", "تأجير"],
#     "contracting": ["مقاولة", "مقاول", "مقاولات", "تنفيذ أعمال", "بناء", "إنشاءات"],
#     "partnership": ["شراكة", "شركة", "شريك", "تأسيس شركة", "حصص"],
#     "deposit": ["وديعة", "إيداع", "ايداع", "استيداع", "مودع"],
#     "guarantee": ["كفالة", "ضمان", "كفيل", "ضامن"],
#     "employment_contract": ["عمل", "توظيف", "موظف", "عامل", "وظيفة", "تشغيل"],
#     "agency": ["وكالة", "وكيل", "موكل", "تفويض"],
# }

# # ──────────────────────────────────────────────────────────────────
# # السيستم برومبت الخاص بصياغة *بند واحد فقط* (مش العقد كله)
# #
# # ✏️ تعديل 1 (الأهم): الأولوية اتقلبت بالكامل.
# # قبل كده كان مكتوب "لو فيه أرقام في وصف الالتزام التزمي بيها حرفياً" —
# # وده اللي خلّى الموديل يعتمد على أرقام الـ JSON (اللي ممكن تتلخبط زي
# # حالة 180/90 يوم) بدل ما يستنى النص القانوني الحقيقي من RAG.
# # دلوقتي: description بقى مجرد "موضوع البند" (توجيه)، والرقم الملزم
# # الوحيد اللي الموديل مسموحله يستخدمه هو اللي جاي في "المرجع القانوني"
# # (لو موجود). لو مفيش مرجع قانوني، الموديل يكتب صياغة عامة بلا رقم.
# # ──────────────────────────────────────────────────────────────────
# CLAUSE_SYSTEM_PROMPT = """أنت مستشار قانوني مصري متخصص في صياغة العقود بالعربية الفصحى الرسمية.

# مهمتك محدودة جداً: صياغة **فقرة قانونية واحدة فقط** (بند واحد) تعبّر عن الالتزام
# التالي بأسلوب تعاقدي ملزم، دقيق، ومفصّل (بحد أدنى 100-120 كلمة).

# # قواعد صارمة:
# - ممنوع كتابة عنوان البند أو رقمه أو كلمة "البند" — أنا (الكود) اللي هحطها، انت تكتب نص الفقرة بس.
# - ممنوع أي رموز Markdown (** أو # أو _).
# - ممنوع الترحيب أو أي مقدمة، ابدأي بصلب الفقرة القانونية مباشرة.
# - **أهم قاعدة (مصدر الأرقام):** "المرجع القانوني" بالأسفل (لو موجود) هو المصدر
#   الوحيد الملزم لأي رقم أو نسبة أو مدة زمنية. لو فيه رقم صريح جوه المرجع
#   القانوني، استخدميه حرفياً. **ممنوع تماماً** إنك تاخدي أي رقم من "وصف
#   الالتزام" لوحده لو مش مؤكَّد بنفس الرقم داخل المرجع القانوني.
# - لو "المرجع القانوني" مش موجود بالأسفل، اكتبي الالتزام بصياغة عامة دقيقة
#   قانونياً **بدون** اختراع أي رقم أو نسبة أو مدة من عندك. وصف الالتزام هنا
#   بيوضحلك موضوع البند فقط، مش مصدر أرقام يُعتمد عليه.
# - ممنوع الاختراع أو الإضافة من خارج البيانات المُعطاة لك.
# - لا تذكري رقم المادة القانونية في نص البند، اكتفي بصياغة المضمون القانوني.

# # بيانات هذا البند تحديداً:
# نوع العقد: {contract_type_ar}
# عنوان البند (الموضوع): {clause_title}
# وصف الالتزام (توجيه عام للموضوع فقط، مش مصدر أرقام): {clause_description}
# {laws_context_block}
# اكتبي فقرة الالتزام الآن مباشرة بدون أي عنوان أو ترقيم."""

# # ──────────────────────────────────────────────────────────────────
# # تحميل موارد الـ RAG
# # ──────────────────────────────────────────────────────────────────
# _rag_resources_cache: dict | None = None
_rag_resources_lock = threading.Lock()
_bm25_cache: dict[tuple[str, str], dict] = {}
_bm25_cache_lock = threading.Lock()


def load_rag_resources() -> dict:
    """تحميل موارد العقود مرة واحدة لكل Process.

    مسار توليد العقود الحالي يحتاج Qdrant وembedding القوانين فقط.
    لذلك لا نحمّل EMBED_MODEL_CONTRACTS في كل Job؛ بل نتركه None
    إلى أن يظهر مسار يحتاجه فعليًا.
    """
    global _rag_resources_cache
    if _rag_resources_cache is not None:
        return _rag_resources_cache

    with _rag_resources_lock:
        if _rag_resources_cache is not None:
            return _rag_resources_cache

        resources = {
            "qdrant_client": None,
            "embed_model": None,
            "embed_model_laws": None,
            "contracts_ready": False,
            "laws_ready": False,
        }

        if not QDRANT_URL or not QDRANT_KEY:
            print("❌ QDRANT_URL أو QDRANT_API_KEY مش متعرّفين — تأكدي من ملف .env")
            _rag_resources_cache = resources
            return resources

        try:
            print("⏳ تحميل موارد العقود مرة واحدة...")
            qdrant = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_KEY,
                port=443,
                https=True,
                timeout=30,
                check_compatibility=False,
            )
            resources["qdrant_client"] = qdrant

            collections = qdrant.get_collections().collections
            collection_names = [c.name for c in collections]
            resources["contracts_ready"] = COLLECTION_CONTRACTS in collection_names
            resources["laws_ready"] = COLLECTION_LAWS in collection_names

            if resources["laws_ready"]:
                print(f"⏳ تحميل embedding القوانين: {EMBED_MODEL_LAWS}")
                resources["embed_model_laws"] = SentenceTransformer(EMBED_MODEL_LAWS)
                try:
                    qdrant.create_payload_index(
                        collection_name=COLLECTION_LAWS,
                        field_name="category",
                        field_schema="keyword",
                    )
                except Exception as e:
                    print(f"⚠️ خطأ في إنشاء payload index لحقل category: {e}")

            print("✅ موارد العقود جاهزة وسيُعاد استخدامها في الطلبات التالية")
        except Exception as e:
            print(f"❌ خطأ في تحميل قاعدة البيانات: {e}")

        _rag_resources_cache = resources
        return resources

# ──────────────────────────────────────────────────────────────────
# 🆕 إضافة من النسخة الأولى: تنضيف عربي بسيط للـ BM25
# ──────────────────────────────────────────────────────────────────
def simple_arabic_tokenize(text: str) -> list:
    """تنضيف بسيط: شيل التشكيل والترقيم، تقسيم على المسافات."""
    text = re.sub(r'[\u064B-\u0652]', '', text)  # شيل التشكيل (الحركات)
    text = re.sub(r'[^\w\s]', ' ', text)          # شيل علامات الترقيم
    return text.split()

# ──────────────────────────────────────────────────────────────────
# 🆕 إضافة من النسخة الأولى: بناء BM25 index محلي مع كاش
# ──────────────────────────────────────────────────────────────────
def build_bm25_index(qdrant_client, collection_name: str, cache_path: str = BM25_CACHE_PATH) -> dict:
    """
    بيعمل scroll على كل نقاط الـ collection مرة واحدة، يبني BM25Okapi index،
    ويكاشيه على القرص عشان منعملش scroll تاني كل مرة نشغّل فيها السكريبت.
    لو ضفتي/عدّلتي بيانات في الـ collection، امسحي ملف الكاش يدوياً عشان
    يتعمل rebuild من جديد.
    """
    cache_key = (collection_name, os.path.abspath(cache_path))
    with _bm25_cache_lock:
        cached = _bm25_cache.get(cache_key)
        if cached is not None:
            print(f"✔️ BM25 index موجود في الذاكرة ({len(cached.get('texts', []))} نص).")
            return cached

    if os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                data = pickle.load(f)
            with _bm25_cache_lock:
                _bm25_cache[cache_key] = data
            print(f"✔️ BM25 index اتحمّل من الكاش ({len(data.get('texts', []))} نص).")
            return data
        except Exception as e:
            print(f"⚠️ فشل تحميل كاش BM25 ({e})، هيتعمل rebuild.")

    print("⏳ بناء BM25 index من laws_only (مرة واحدة، هياخد شوية وقت أول مرة فقط)...")
    all_points = []
    offset = None
    while True:
        points, offset = qdrant_client.scroll(
            collection_name=collection_name,
            limit=256,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        all_points.extend(points)
        if offset is None:
            break

    corpus_texts = []
    corpus_payloads = []
    for p in all_points:
        payload = p.payload or {}
        text = payload.get("text") or payload.get("page_content") or payload.get("content", "")
        if text and len(text.strip()) >= 30:
            corpus_texts.append(text.strip())
            corpus_payloads.append(payload)

    if not corpus_texts:
        print("⚠️ مفيش نصوص كافية في laws_only لبناء BM25 index.")
        return {"bm25": None, "texts": [], "payloads": []}

    tokenized_corpus = [simple_arabic_tokenize(t) for t in corpus_texts]
    bm25 = BM25Okapi(tokenized_corpus)

    data = {"bm25": bm25, "texts": corpus_texts, "payloads": corpus_payloads}
    try:
        with open(cache_path, "wb") as f:
            pickle.dump(data, f)
    except Exception as e:
        print(f"⚠️ مقدرناش نحفظ كاش BM25 ({e}) — هيتعمل rebuild في كل تشغيل.")

    with _bm25_cache_lock:
        _bm25_cache[cache_key] = data
    print(f"✔️ BM25 index جاهز — {len(corpus_texts)} نص متاح.")
    return data

# ──────────────────────────────────────────────────────────────────
# استخراج نص PDF استرشادي (اختياري)
# ──────────────────────────────────────────────────────────────────
def extract_pdf_text(pdf_path: str) -> str:
    text_content = ""
    try:
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_content += text + "\n"
    except Exception as e:
        print(f"❌ خطأ في قراءة ملف الـ PDF: {e}")
    return text_content

# ──────────────────────────────────────────────────────────────────
# تحميل ملف أنواع العقود والبنود
# ──────────────────────────────────────────────────────────────────
def load_clause_types(json_path: str = CLAUSE_TYPES_PATH) -> dict:
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ خطأ في تحميل ملف أنواع العقود: {e}")
        return {}

def detect_contract_type(user_query: str, clause_types_db: dict | None = None) -> str | None:
    normalized_query = user_query.strip()
    best_match = None
    best_match_len = 0
    for type_key, keywords in CONTRACT_TYPE_KEYWORDS.items():
        if clause_types_db and type_key not in clause_types_db:
            continue
        for kw in keywords:
            kw_len = len(kw)
            start = 0
            found = False
            while True:
                idx = normalized_query.find(kw, start)
                if idx == -1:
                    break
                ok_left = (idx == 0) or not _is_arabic(normalized_query[idx - 1])
                end_pos = idx + kw_len
                ok_right = (end_pos >= len(normalized_query)) or not _is_arabic(normalized_query[end_pos])
                if ok_left and ok_right:
                    found = True
                    break
                start = idx + 1
            if found and kw_len > best_match_len:
                best_match = type_key
                best_match_len = kw_len
    return best_match


def _is_arabic(ch: str) -> bool:
    """فحص هل الحرف ضمن نطاق الحروف العربية أو الهمزات أو التشكيل"""
    cp = ord(ch)
    return (
        (0x0621 <= cp <= 0x063A) or   # حروف عربية أساسية
        (0x0641 <= cp <= 0x0652) or   # حروف عربية إضافية + تشكيل
        (0x0671 <= cp <= 0x06D3) or   # أحرف موسعة
        (0x06D5 <= cp <= 0x06DC) or   # أحرف أخرى
        (0x06DE <= cp <= 0x06E8) or   # أحرف أخرى
        (0x06EA <= cp <= 0x06EF) or   # أحرف أخرى
        (0x06F0 <= cp <= 0x06F9)      # أرقام عربية
    )

# ──────────────────────────────────────────────────────────────────
# استرجاع سياق قانوني (قوانين ملزمة بس)
# ──────────────────────────────────────────────────────────────────
def _search_collection(query: str, qdrant_client, embed_model, collection_name: str,
                        top_k: int = 6, use_passage_prefix: bool = True,
                        score_threshold: float | None = None,
                        category_filter: list[str] | None = None) -> list:
    try:
        search_query = f"query: {query}" if use_passage_prefix else query
        query_vector = embed_model.encode(search_query).tolist()

        query_filter = None
        if category_filter:
            query_filter = Filter(
                must=[FieldCondition(key="category", match=MatchAny(any=category_filter))]
            )

        try:
            results = qdrant_client.query_points(
                collection_name=collection_name,
                query=query_vector,
                query_filter=query_filter,
                limit=top_k,
                with_payload=["text", "page_content", "legal_domain", "article_number", "type", "category"],
            ).points
        except Exception as inner_error:
            if query_filter is not None and "Index required but not found" in str(inner_error):
                print(f"⚠️ الفلتر على category فشل ({collection_name}) — استرجاع من غير فلتر كـ fallback.")
                results = qdrant_client.query_points(
                    collection_name=collection_name,
                    query=query_vector,
                    query_filter=None,
                    limit=top_k,
                    with_payload=["text", "page_content", "legal_domain", "article_number", "type", "category"],
                ).points
            else:
                raise

        if score_threshold is not None:
            results = [p for p in results if (p.score or 0) >= score_threshold]

        return results
    except Exception as e:
        print(f"⚠️ خطأ في استرجاع السياق من {collection_name}: {e}")
        return []

def retrieve_laws_context(query: str, resources: dict, top_k: int = 6) -> str:
    """النسخة الأصلية — dense search بس. بتبقى كـ fallback لو BM25 index مش متاح."""
    qdrant_client = resources.get("qdrant_client")
    if not qdrant_client or not resources.get("laws_ready") or not resources.get("embed_model_laws"):
        return ""

    context_parts = []
    laws_points = _search_collection(
        query, qdrant_client, resources["embed_model_laws"], COLLECTION_LAWS,
        top_k=top_k, use_passage_prefix=False, score_threshold=LAWS_SCORE_THRESHOLD
    )
    for point in laws_points:
        payload = point.payload or {}
        text = payload.get("text") or payload.get("page_content") or payload.get("content", "")
        if text and len(text.strip()) >= 30:
            context_parts.append(f"📌 [مرجع قانوني ملزم] {text.strip()}")

    return "\n\n".join(context_parts)

# ──────────────────────────────────────────────────────────────────
# 🆕 إضافة من النسخة الأولى: hybrid search بـ Reciprocal Rank Fusion
# ──────────────────────────────────────────────────────────────────
def hybrid_search_laws(query: str, resources: dict, bm25_data: dict,
                        top_k: int = 3, rrf_k: int = RRF_K,
                        candidate_k: int = HYBRID_CANDIDATE_K,
                        category_filter: list[str] | None = None) -> str:
    qdrant_client = resources.get("qdrant_client")
    if not qdrant_client or not resources.get("laws_ready") or not resources.get("embed_model_laws"):
        return ""

    # 1) dense search — من غير threshold عشان ناخد ranking كامل (الفلترة بتحصل بعد الدمج)
    dense_points = _search_collection(
        query, qdrant_client, resources["embed_model_laws"], COLLECTION_LAWS,
        top_k=candidate_k, use_passage_prefix=False, score_threshold=None,
        category_filter=category_filter,
    )
    dense_texts = []
    for p in dense_points:
        payload = p.payload or {}
        text = payload.get("text") or payload.get("page_content") or payload.get("content", "")
        if text:
            dense_texts.append(text.strip())

    # 2) BM25 search (لو الـ index مش جاهز، ارجعي على dense بس)
    bm25 = bm25_data.get("bm25") if bm25_data else None
    if bm25 is None:
        context_parts = [f"📌 [مرجع قانوني ملزم] {t}" for t in dense_texts[:top_k]]
        return "\n\n".join(context_parts)

    tokenized_query = simple_arabic_tokenize(query)
    bm25_scores = bm25.get_scores(tokenized_query)
    bm25_ranked_idx = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)
    if category_filter:
        payloads = bm25_data.get("payloads") or []
        bm25_ranked_idx = [
            i for i in bm25_ranked_idx
            if i < len(payloads) and payloads[i].get("category") in category_filter
        ]
    bm25_ranked_idx = bm25_ranked_idx[:candidate_k]
    bm25_texts = [bm25_data["texts"][i] for i in bm25_ranked_idx]

    # 3) دمج بـ RRF: كل نص بياخد score = مجموع 1/(rrf_k + rank + 1) من كل مصدر ظهر فيه
    rrf_scores: dict[str, float] = {}
    for rank, text in enumerate(dense_texts):
        rrf_scores[text] = rrf_scores.get(text, 0.0) + 1.0 / (rrf_k + rank + 1)
    for rank, text in enumerate(bm25_texts):
        rrf_scores[text] = rrf_scores.get(text, 0.0) + 1.0 / (rrf_k + rank + 1)

    fused = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

    context_parts = [f"📌 [مرجع قانوني ملزم] {text}" for text, _ in fused]
    return "\n\n".join(context_parts)

# ──────────────────────────────────────────────────────────────────
# شبكة أمان: شيل أي رموز Markdown لو الموديل سرّبها
# ──────────────────────────────────────────────────────────────────
def strip_markdown_formatting(text: str) -> str:
    if not text:
        return text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'\1', text)
    text = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'\1', text)
    text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
    return text.strip()

# ──────────────────────────────────────────────────────────────────
# شبكة أمان ضد الـ degeneration loop
# ──────────────────────────────────────────────────────────────────
def truncate_repetition_loop(text: str, min_repeats: int = 4) -> str:
    if not text:
        return text
    words = text.split()
    for window in range(1, 6):  # نافذة من كلمة لغاية 5 كلمات
        i = 0
        while i + window * min_repeats <= len(words):
            chunk = words[i:i + window]
            repeats = 1
            j = i + window
            while j + window <= len(words) and words[j:j + window] == chunk:
                repeats += 1
                j += window
            if repeats >= min_repeats:
                return " ".join(words[:i + window]).strip()
            i += 1
    return text

# ──────────────────────────────────────────────────────────────────
# التوليد عبر Ollama
# ──────────────────────────────────────────────────────────────────
def generate_with_ollama(messages: list, max_tokens: int) -> str:
    try:
        client = OpenAI(api_key="ollama", base_url=OLLAMA_BASE_URL)
        response = client.chat.completions.create(
            model=OLLAMA_MODEL,
            messages=messages,
            temperature=0.15,
            top_p=0.95,
            max_tokens=max_tokens,
            frequency_penalty=0.4,                    # جديد
            extra_body={"repeat_penalty": 1.3},        # جديد (صياغة Ollama الأصلية)
        )
        raw = response.choices[0].message.content
        cleaned = re.sub(r'<think >[\s\S]*?</think >', '', raw, flags=re.DOTALL)
        return cleaned.strip()
    except Exception as e:
        return (
            f"❌ خطأ في التوليد. تأكدي إن (1) أمر `ollama serve` شغال و"
            f"(2) المودل متحمّل بـ `ollama pull {OLLAMA_MODEL}`.\n\nتفاصيل الخطأ: {str(e)}"
        )

# ──────────────────────────────────────────────────────────────────
# صياغة بند واحد بالظبط
# ──────────────────────────────────────────────────────────────────
def generate_single_clause(clause: dict, contract_type_ar: str, laws_context: str) -> str:
    laws_context_block = (
        f"المرجع القانوني (المصدر الملزم للأرقام):\n{laws_context}\n"
        if laws_context else
        "المرجع القانوني: غير متاح لهذا البند — اكتبي صياغة عامة بدون أرقام.\n"
    )

    system_content = CLAUSE_SYSTEM_PROMPT.format(
        contract_type_ar=contract_type_ar,
        clause_title=clause.get("title", ""),
        clause_description=clause.get("description") or "بدون وصف إضافي",
        laws_context_block=laws_context_block,
    )
    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": "اكتبي نص هذا البند الآن."},
    ]
    raw = generate_with_ollama(messages, CLAUSE_MAX_TOKENS)
    cleaned = strip_markdown_formatting(raw)
    cleaned = truncate_repetition_loop(cleaned)

    # شبكة أمان: لو الموديل رجع بفارغ (أو التكرار قطع النص لحد حتة صغيرة أوي)،
    # نرجع وصف الـ JSON الأصلي كنص بديل
    if not cleaned or len(cleaned) < 20:
        fallback_text = clause.get("description") or "تم الاتفاق على هذا البند وفقاً للقانون."
        print(f"   ⚠️ تحذير: الموديل لم يُنتج نصاً صالحاً للبند [{clause.get('title')}]. تم استخدام النص الاحتياطي.")
        return fallback_text

    return cleaned

# ──────────────────────────────────────────────────────────────────
# بناء الديباجة (تمهيد + بيانات الطرفين) — قالب ثابت في بايثون
# ──────────────────────────────────────────────────────────────────
def build_static_preamble(contract_type_ar: str) -> str:
    return (
        f"عقد {contract_type_ar}\n\n"
        "إنه في يوم ........... الموافق ___/___/_______ م\n"
        "تحرر هذا العقد بين كل من:\n\n"
        "أولاً: الطرف الأول\n"
        "الاسم: [الاسم الكامل] | الرقم القومي: [14 رقم] | العنوان: [العنوان الكامل] | الصفة: [صفة الطرف الأول]\n\n"
        "ثانياً: الطرف الثاني\n"
        "الاسم: [الاسم الكامل] | الرقم القومي: [14 رقم] | العنوان: [العنوان الكامل] | الصفة: [صفة الطرف الثاني]\n\n"
        "تمهيد:\n"
        "بعد أن أقر الطرفان بأهليتهما القانونية الكاملة للتعاقد والتصرف، اتفقا على ما يلي:\n"
    )

def build_static_closing(contract_data: dict) -> str:
    lines = [
        "\nالطرف الأول: التوقيع ....................",
        "الطرف الثاني: التوقيع ....................\n",
        "المستندات القانونية الملحقة والمطلوبة للتوثيق:",
    ]
    notes = contract_data.get("notes") or []
    if notes:
        for note in notes:
            lines.append(f"• {note}")
    else:
        lines.append("• صورة من الهوية الوطنية للطرفين")
    return "\n".join(lines)

# ──────────────────────────────────────────────────────────────────
# فحص تأكيدي بسيط
# ──────────────────────────────────────────────────────────────────
def build_clause_validation_report(expected_count: int, generated_count: int) -> dict:
    return {
        "checked": True,
        "expected_count": expected_count,
        "found_count": generated_count,
        "missing_titles": [],
        "fuzzy_titles": [],
        "is_complete": expected_count == generated_count,
    }

# ──────────────────────────────────────────────────────────────────
# توليد ملف Word (.docx)
# ──────────────────────────────────────────────────────────────────
def create_word_document(contract_text: str, output_path: str = "عقد.docx") -> str:
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    section = doc.sections[0]
    section.header_distance = Inches(0.5)

    lines = contract_text.split('\n')
    for line in lines:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p.paragraph_format.line_spacing = 1.3

        run = p.add_run(line)
        run.font.name = 'Arial'
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(0, 0, 0)

    doc.save(output_path)
    return output_path

# ──────────────────────────────────────────────────────────────────
# دالة تجميعية: من سؤال المستخدم لحد ملف Word جاهز
# 🆕 معدّل: بقى بيستخدم Hybrid Search (BM25 + Dense) مع fallback لـ dense بس
# ──────────────────────────────────────────────────────────────────
def generate_contract(user_query: str, pdf_context: str = "") -> dict:
    clause_types_db = load_clause_types()
    contract_type_key = detect_contract_type(user_query, clause_types_db)

    if not contract_type_key:
        print("⚠️ لم يتم تحديد نوع العقد من كلام المستخدم.")
        return {"contract_text": None, "docx_path": None, "contract_type_key": None, "clause_validation": {"checked": False}}

    contract_data = clause_types_db.get(contract_type_key, {})
    contract_type_ar = contract_data.get("contract_type_ar", "")
    specific_clauses = contract_data.get("specific_clauses", [])
    category_filter = contract_data.get("legal_domains") or None
    expected_n = len(specific_clauses)
    print(f"ℹ️ هيتم توليد {expected_n} بند لنوع العقد '{contract_type_key}' (مع RAG خاص لكل بند).")

    # تحميل موارد RAG مرة واحدة فقط للأداء
    rag_resources = load_rag_resources()

    # 🆕 بناء BM25 index (مرة واحدة، مع كاش على القرص)
    bm25_data = None
    if rag_resources.get("laws_ready"):
        bm25_data = build_bm25_index(rag_resources["qdrant_client"], COLLECTION_LAWS)

    body_parts = []
    for idx, clause in enumerate(specific_clauses, start=1):
        title = clause.get("title", "")
        description = clause.get("description") or ""
        keywords = clause.get("search_keywords") or []

        # استعلام الـ RAG بيضم الـ search_keywords كمان
        clause_search_query = f"{title}. {description}. {' '.join(keywords)}".strip()

        # 🆕 لو BM25 متاح، نستخدم hybrid search؛ لو لأ، ن fallback على dense بس
        if bm25_data and bm25_data.get("bm25") is not None:
            laws_context = hybrid_search_laws(
                clause_search_query, rag_resources, bm25_data, top_k=3,
                category_filter=category_filter,
            )
        else:
            laws_context = retrieve_laws_context(clause_search_query, rag_resources, top_k=3)

        if pdf_context:
            laws_context = (laws_context + "\n\n" + pdf_context).strip()

        # توليد البند بالسياق الدقيق الخاص به
        clause_body = generate_single_clause(clause, contract_type_ar, laws_context)

        body_parts.append(f"البند {idx} — {title}: {clause_body}")
        print(f"   ✔️ اتولّد بند {idx}/{expected_n}: {title}")

    full_text = "\n\n".join(
        [build_static_preamble(contract_type_ar)] + body_parts + [build_static_closing(contract_data)]
    )

    clause_validation = build_clause_validation_report(expected_n, len(body_parts))
    docx_path = create_word_document(full_text)

    return {
        "contract_text": full_text,
        "docx_path": docx_path,
        "contract_type_key": contract_type_key,
        "clause_validation": clause_validation,
    }

# ──────────────────────────────────────────────────────────────────
# تشغيل مباشر من الـ terminal للتجربة
# ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    query = input("📝 اكتبي طلب العقد: ")
    result = generate_contract(query)

    print("\n" + "=" * 60)
    print(f"🏷️ نوع العقد المكتشف: {result['contract_type_key'] or 'غير محدد'}")
    print("=" * 60)
    if result["contract_text"]:
        print(result["contract_text"])
    print("=" * 60)

    if result["docx_path"]:
        print(f"\n✔️ تم حفظ العقد في: {result['docx_path']}")
    else:
        print("\n⚠️ لم يتم استخراج نص عقد منظم من الرد.")

    cv = result.get("clause_validation") or {}
    if cv.get("checked"):
        status = "✅ مكتمل" if cv.get("is_complete") else "⚠️ ناقص"
        print(f"\n📋 تغطية البنود: {status} ({cv.get('found_count')}/{cv.get('expected_count')})")
