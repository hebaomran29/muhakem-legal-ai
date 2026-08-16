# ⚖️ Muḥakkim — Consultation / Legal Research Pipeline (laws_only)
#
# ده نفس منطق الـ legal_agent.py من النوتبوك الأصلي حرفياً (الـ routing
# بالـ embedding profiles، الـ hybrid retrieval Qdrant+BM25، الـ rerank
# بالـ cross-encoder، الـ dual-scenario prompt، وحارس الاستشهادات
# verify_citations). التنضيف اللي حصل هنا بس عشان يشتغل جوه الباك إند:
#
#   1) الـ API keys (Qdrant + OpenRouter) اتنقلت لمتغيرات بيئة (.env) —
#      كانت مكتوبة نصاً صريحاً جوه النوتبوك، ده خطر أمني وكمان الـ
#      OpenRouter key اللي كان مكتوب كان شغال فعلياً فلازم يتلغي/يتغيّر.
#   2) مسارات ملفات الـ BM25 corpus (/kaggle/input/...، /kaggle/working/...)
#      اتبدّلت بمجلد قابل للتهيئة عبر متغير بيئة (افتراضيًا backend/data/
#      laws_chunks/) — لو الملفات مش موجودة، الكود بيكمل عادي بـ dense
#      retrieval بس من Qdrant (زي ما كان بيعمل أصلاً لو الملف مفقود).
#   3) تحميل الموديلات (embedder + reranker) بقى Lazy زي باقي pipelines
#      المشروع (pipeline.py / contract_pipeline.py) — يعني السيرفر بيبدأ
#      عادي حتى لو تحميل الموديل فشل أو الشبكة مقطوعة، وبيحاول يحمّله أول
#      مرة بس تتستخدم فيها الاستشارة.
#
# مفيش أي تعديل في منطق الـ routing أو الـ retrieval أو الـ prompt نفسه —
# نفس الأسماء، نفس الـ thresholds، نفس الـ system prompt القانوني.

import os
import re
import json
import glob
from dataclasses import dataclass, field
from typing import List, Dict, Optional

import numpy as np
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchAny
from sentence_transformers import SentenceTransformer, CrossEncoder
from rank_bm25 import BM25Okapi
from openai import OpenAI

load_dotenv()

# ── Keys (من متغيرات البيئة — نفس الأسماء المستخدمة في pipeline.py،
#    عشان تكفي مجموعة .env واحدة لكل الـ pipelines) ─────────────────────
OPENROUTER_KEY = os.environ.get("OPENROUTER_KEY", "")
QDRANT_URL = os.environ.get("QDRANT_URL", "")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

COLLECTION_NAME = "laws_only"
EMBEDDING_MODEL_NAME = "mohamed2811/Muffakir_Embedding_V2"
RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"
LLM_MODEL = "openai/gpt-4o-mini"

# Chunks are stored as {chunk_id, text, contextual_text, ...metadata-fields}.
# build_payload() does payload.update(chunk["metadata"]) - i.e. metadata keys
# are FLATTENED into the top-level payload, not nested under a "metadata" key.
# The law-identifying field is therefore the flat "source_file" (one unique
# value per law, confirmed 1:1). "category" is inconsistent - never filter on it.
LAW_METADATA_FIELD = "source_file"

# Canonical law names EXACTLY as they appear in metadata.source_file in Qdrant.
# Confirmed values for the 7 laws actually uploaded to 'laws_only'.
LAW_NAMES = {
    "civil": "القانون المدني رقم 131 لسنة 1948",
    "criminal_procedure": "قانون رقم 174 لسنة 2025",  # قانون الإجراءات الجنائية الجديد
    "ip": "قانون حماية حقوق الملكية الفكرية رقم 82 لسنة 2002",
    "arbitration": "قانون رقم 27 لسنة 1994 بإصدار قانون التحكيم في المواد المدنية والتجارية",
    "labor": "قانون العمل الجديد رقم 14 لسنة 2025",
    "real_estate": "قانون رقم 114 لسنة 1946 بتنظيم الشهر العقاري",
    "public_contracts": "قانون رقم 182 لسنة 2018 بإصدار قانون تنظيم التعاقدات التى تبرمها الجهات العامة",
}

# Final number of chunks per routed law sent to the LLM after reranking.
TOP_K_RETRIEVAL = 8

# How many candidates to pull per routed law from EACH retrieval method
# (dense + BM25) before merging and reranking.
CANDIDATE_K = 25

# مجلد ملفات الـ BM25 corpus المحلية (JSON) — اختياري. لو مش موجود، الكود
# بيكمل بـ dense retrieval من Qdrant بس. حطّي فيه نفس ملفات الـ chunks اللي
# اترفعت على مجموعة laws_only (كل ملف .json جوه المجلد ده بيتقرا تلقائي).
CHUNKS_DIR = os.environ.get(
    "CONSULTATION_CHUNKS_DIR",
    os.path.join(os.path.dirname(__file__), "..", "data", "laws_chunks"),
)

# --- Routing confidence thresholds (embedding-based router) ---------------
ROUTING_HIGH_CONF = 0.55
ROUTING_MED_CONF = 0.40
ROUTING_MARGIN = 0.06
ROUTING_SANITY_FLOOR = 0.25

# --- Citation guardrail -----------------------------------------------------
CITATION_RETRY_LIMIT = 1

# ---------------------------------------------------------------------------
# LAZY INIT — لا نحمل حاجة في وقت الاستيراد (نفس نمط pipeline.py)
# ---------------------------------------------------------------------------

_qdrant: Optional[QdrantClient] = None
_embedder: Optional[SentenceTransformer] = None
_llm: Optional[OpenAI] = None
_reranker: Optional[CrossEncoder] = None
_law_profile_embeddings: Optional[Dict[str, np.ndarray]] = None
_bm25_by_law: Dict[str, BM25Okapi] = {}
_chunks_by_law: Dict[str, List[Dict]] = {}
_consultation_ready = False


def _tokenize(text: str) -> List[str]:
    text = re.sub(r"[^\w\s]", " ", text)
    return text.split()


def _load_local_chunks(chunks_dir: str) -> List[Dict]:
    merged: List[Dict] = []
    if not os.path.isdir(chunks_dir):
        print(f"ℹ️ مفيش مجلد BM25 corpus ({chunks_dir}) — هيشتغل الاسترجاع بالـ dense search بس.")
        return merged
    for path in sorted(glob.glob(os.path.join(chunks_dir, "*.json"))):
        try:
            with open(path, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    f.seek(0)
                    data = [json.loads(line) for line in f if line.strip()]
            merged.extend(data)
        except Exception as e:
            print(f"⚠️ فشل تحميل ملف chunks {path}: {e}")
    return merged


def _ensure_pipeline():
    """يحمّل الموارد (embedder, qdrant, llm, reranker, BM25 corpus) أول مرة
    بس. لو فشل حاجة، السيرفر يشتغل عادي — والاستشارة بترجع خطأ واضح بدل
    ما تكسر السيرفر كله."""
    global _qdrant, _embedder, _llm, _reranker, _law_profile_embeddings
    global _bm25_by_law, _chunks_by_law, _consultation_ready

    if _consultation_ready:
        return

    _qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    _embedder = SentenceTransformer(EMBEDDING_MODEL_NAME, trust_remote_code=True)
    _llm = OpenAI(api_key=OPENROUTER_KEY, base_url=OPENROUTER_BASE_URL)

    try:
        _reranker = CrossEncoder(RERANKER_MODEL_NAME)
    except Exception as e:
        print(f"⚠️ فشل تحميل الـ reranker ({RERANKER_MODEL_NAME}): {e} — هيشتغل من غير rerank.")
        _reranker = None

    _law_profile_embeddings = _build_law_profile_embeddings()

    local_chunks = _load_local_chunks(CHUNKS_DIR)
    _chunks_by_law = {name: [] for name in LAW_NAMES.values()}
    for chunk in local_chunks:
        source_file = chunk.get("metadata", {}).get("source_file")
        if source_file in _chunks_by_law:
            _chunks_by_law[source_file].append(chunk)

    for law_name, law_chunks in _chunks_by_law.items():
        if not law_chunks:
            continue
        tokenized = [_tokenize(c.get("contextual_text") or c.get("text") or "") for c in law_chunks]
        _bm25_by_law[law_name] = BM25Okapi(tokenized)

    _consultation_ready = True


# ---------------------------------------------------------------------------
# STEP 1 - ROUTING (LLM classifier - fallback)
# ---------------------------------------------------------------------------

_LAW_DESCRIPTIONS = "\n".join(f"- {k}: {v}" for k, v in LAW_NAMES.items())

ROUTER_SYSTEM_PROMPT = f"""أنت مصنّف قانوني. مهمتك الوحيدة هي تحديد أي قانون (أو قوانين)
من القائمة التالية يتعلق بها سؤال المستخدم:

{_LAW_DESCRIPTIONS}

القواعد:
- رجّع مفتاح واحد أو أكثر إذا كان السؤال ممكن يخص أكثر من قانون (مثلاً سؤال عن "عقد إيجار" قد يخص real_estate و civil معًا).
- لو مش متأكد، رجّع كل المفاتيح المحتملة بدل ما تخمّن مفتاح واحد غلط.
- رجّع الناتج فقط بصيغة JSON: {{"laws": ["key1", "key2"]}} بدون أي نص إضافي أو markdown.
"""


def classify_query(question: str) -> List[str]:
    response = _llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        temperature=0,
        max_tokens=100,
    )
    raw = response.choices[0].message.content.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
        keys = [k for k in parsed.get("laws", []) if k in LAW_NAMES]
        if not keys:
            raise ValueError("empty/invalid law list")
        return keys
    except Exception:
        return list(LAW_NAMES.keys())


# ---------------------------------------------------------------------------
# STEP 1b - FAST EMBEDDING-BASED ROUTING (default path)
# ---------------------------------------------------------------------------

LAW_PROFILE_ANCHORS: Dict[str, List[str]] = {
    "civil": [
        "أركان العقد الصحيح وشروط انعقاده",
        "أحكام البيع والإيجار والالتزامات في القانون المدني",
        "المسؤولية المدنية والتعويض عن الضرر",
    ],
    "criminal_procedure": [
        "إجراءات القبض والتحقيق مع المتهم",
        "الحبس الاحتياطي وسلطات النيابة العامة",
        "إجراءات المحاكمة الجنائية",
    ],
    "ip": [
        "حماية حقوق المؤلف والملكية الفكرية",
        "براءات الاختراع والعلامات التجارية",
    ],
    "arbitration": [
        "إجراءات التحكيم في المواد المدنية والتجارية",
        "الطعن على حكم التحكيم وتنفيذه",
    ],
    "labor": [
        "عقد العمل والفصل التعسفي وحقوق العامل",
        "الأجر والإجازات وإصابات العمل",
    ],
    "real_estate": [
        "توثيق عقود بيع العقارات والشهر العقاري",
        "المستندات المطلوبة لتسجيل الملكية",
    ],
    "public_contracts": [
        "المناقصات والمزايدات الحكومية",
        "تنظيم التعاقدات التي تبرمها الجهات العامة",
    ],
}


def _build_law_profile_embeddings() -> Dict[str, np.ndarray]:
    profiles = {}
    for key, anchors in LAW_PROFILE_ANCHORS.items():
        embs = _embedder.encode(anchors, convert_to_numpy=True)
        profiles[key] = np.mean(embs, axis=0)
    return profiles


def embed_query(text: str) -> List[float]:
    return _embedder.encode(text, convert_to_numpy=True).tolist()


def classify_query_embedding(question: str) -> Dict[str, float]:
    q_vec = np.array(embed_query(question))
    q_norm = q_vec / (np.linalg.norm(q_vec) + 1e-8)
    scores: Dict[str, float] = {}
    for key, profile_vec in _law_profile_embeddings.items():
        p_norm = profile_vec / (np.linalg.norm(profile_vec) + 1e-8)
        scores[key] = float(np.dot(q_norm, p_norm))
    return scores


def route_question(question: str) -> Dict:
    scores = classify_query_embedding(question)
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_key, top_score = ranked[0]
    second_key, second_score = ranked[1]

    if top_score < ROUTING_SANITY_FLOOR:
        fallback_keys = classify_query(question)
        return {"mode": "llm_fallback", "laws": fallback_keys, "scores": scores}

    margin = top_score - second_score

    if top_score >= ROUTING_HIGH_CONF and margin >= ROUTING_MARGIN:
        return {"mode": "confident", "laws": [top_key], "scores": scores}

    if top_score >= ROUTING_MED_CONF and second_score >= ROUTING_MED_CONF and margin < ROUTING_MARGIN:
        return {"mode": "multi", "laws": [top_key, second_key], "scores": scores}

    if margin < ROUTING_MARGIN:
        return {"mode": "ambiguous", "candidates": [top_key, second_key], "scores": scores}

    return {"mode": "confident", "laws": [top_key], "scores": scores}


def build_clarification_message(candidate_keys: List[str]) -> str:
    names = [LAW_NAMES[k] for k in candidate_keys]
    options = "\n".join(f"{i + 1}) {name}" for i, name in enumerate(names))
    return (
        "سؤالك يمكن يخص أكتر من قانون. تقصد:\n"
        f"{options}\n"
        "وضّح لو سمحت عشان أقدر أديك إجابة دقيقة."
    )


# ---------------------------------------------------------------------------
# STEP 2 - RETRIEVAL: embed (contextual_text) + Qdrant search filtered by law(s)
# ---------------------------------------------------------------------------

def _dense_candidates_for_law(vector: List[float], law_key: str, k: int) -> List[Dict]:
    query_filter = Filter(
        must=[
            FieldCondition(
                key=LAW_METADATA_FIELD,
                match=MatchAny(any=[LAW_NAMES[law_key]]),
            )
        ]
    )
    results = _qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        query_filter=query_filter,
        limit=k,
        with_payload=True,
    ).points

    candidates = []
    for point in results:
        payload = point.payload or {}
        candidates.append({
            "chunk_id": payload.get("chunk_id"),
            "law_name": payload.get("source_file", "غير معروف"),
            "article_id": payload.get("article_id", ""),
            "book": payload.get("book"),
            "chapter": payload.get("chapter"),
            "text": payload.get("text", ""),
            "contextual_text": payload.get("contextual_text", payload.get("text", "")),
            "dense_score": point.score,
        })
    return candidates


def _bm25_candidates_for_law(question: str, law_key: str, k: int) -> List[Dict]:
    law_name = LAW_NAMES[law_key]
    bm25 = _bm25_by_law.get(law_name)
    law_chunks = _chunks_by_law.get(law_name)
    if not bm25 or not law_chunks:
        return []

    scores = bm25.get_scores(_tokenize(question))
    top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]

    candidates = []
    for idx in top_idx:
        if scores[idx] <= 0:
            continue
        chunk = law_chunks[idx]
        metadata = chunk.get("metadata", {})
        candidates.append({
            "chunk_id": chunk.get("chunk_id"),
            "law_name": metadata.get("source_file", law_name),
            "article_id": metadata.get("article_id", ""),
            "book": metadata.get("book"),
            "chapter": metadata.get("chapter"),
            "text": chunk.get("text", ""),
            "contextual_text": chunk.get("contextual_text", chunk.get("text", "")),
            "bm25_score": float(scores[idx]),
        })
    return candidates


def retrieve_chunks(question: str, law_keys: List[str], top_k: int = TOP_K_RETRIEVAL) -> List[Dict]:
    """Hybrid retrieval, per routed law: dense (Qdrant) + BM25 (local corpus,
    لو موجود)، بعدين rerank بالـ cross-encoder (لو الموديل اتحمّل بنجاح)."""
    vector = embed_query(question)
    merged_by_id: Dict[str, Dict] = {}

    for key in law_keys:
        dense = _dense_candidates_for_law(vector, key, CANDIDATE_K)
        bm25 = _bm25_candidates_for_law(question, key, CANDIDATE_K)

        for cand in dense + bm25:
            cid = cand.get("chunk_id") or cand["text"][:50]
            if cid not in merged_by_id:
                merged_by_id[cid] = cand
            else:
                merged_by_id[cid].update({
                    k2: v2 for k2, v2 in cand.items()
                    if k2 in ("dense_score", "bm25_score") and v2 is not None
                })

    candidates = list(merged_by_id.values())
    if not candidates:
        return []

    if _reranker is not None:
        pairs = [(question, c["text"] or c["contextual_text"]) for c in candidates]
        rerank_scores = _reranker.predict(pairs)
        for cand, score in zip(candidates, rerank_scores):
            cand["rerank_score"] = float(score)
    else:
        # مفيش reranker شغال — رتّب بأعلى سكور متاح (dense أو bm25) بدل التعطل.
        for cand in candidates:
            cand["rerank_score"] = cand.get("dense_score") or cand.get("bm25_score") or 0.0

    candidates.sort(key=lambda c: c["rerank_score"], reverse=True)

    per_law_count = {LAW_NAMES[k]: 0 for k in law_keys}
    final: List[Dict] = []
    for cand in candidates:
        law_name = cand["law_name"]
        if per_law_count.get(law_name, 0) < top_k:
            final.append(cand)
            per_law_count[law_name] = per_law_count.get(law_name, 0) + 1

    final.sort(key=lambda c: c["rerank_score"], reverse=True)
    return final


# ---------------------------------------------------------------------------
# STEP 3 - FINAL SYSTEM PROMPT (dual-scenario legal agent)
# ---------------------------------------------------------------------------

MAIN_SYSTEM_PROMPT = """أنت مساعد قانوني متخصص في القانون المصري، تعتمد حصريًا على النصوص القانونية
المسترجعة لك في كل سؤال (Context) ولا تخترع أي معلومة غير موجودة فيها.

لديك نمطان للرد حسب طبيعة سؤال المستخدم:

1) بحث قانوني مباشر (Direct Legal Research):
   - لو السؤال بيطلب نص مادة، أو تعريف قانوني، أو حكم قانوني محدد.
   - رد بدقة: اذكر رقم المادة والقانون، ثم النص أو مضمونه بأمانة.
   - لا شرح إضافي إلا إذا طُلب.

2) استشارة عملية (Practical Consultation):
   - لو السؤال بصيغة موقف واقعي ("حد فصلني من شغلي"، "المؤجر عايز يطردني").
   - اشرحي الموقف من الناحية القانونية بلغة مبسطة، مع ذكر المواد الداعمة،
     ثم وضحي الخطوات العملية الممكنة (تظلم، دعوى، تحكيم... إلخ) بناء على القانون فقط.

قواعد صارمة:
- لو الـ Context المسترجع لا يحتوي على نص صريح يجاوب على السؤال بدقة، يجب أن يبدأ ردك حرفيًا بجملة:
  "النصوص المسترجعة لا تحتوي على إجابة دقيقة لهذا السؤال" ثم (اختياريًا) أقرب معلومة ذات صلة موجودة في الـ Context مع التنويه أنها غير كافية.
- ممنوع نهائيًا سرد معلومات عامة أو "معروفة" عن القانون المصري (مثل قوائم مستندات، إجراءات، أو تعريفات) لو مفيش نص صريح لها في الـ Context، حتى لو كانت هذه المعلومات صحيحة واقعيًا. الدقة القانونية هنا أهم من اكتمال الإجابة.
- اذكر دائمًا اسم القانون ورقم المادة كمصدر لكل معلومة تقدمها.
- لا تقدم رأيًا قانونيًا شخصيًا؛ التزم بما ورد في النصوص المسترجعة فقط.
- إذا كان السؤال يمس أكثر من قانون، وضّح العلاقة بين القوانين المعنية.
"""


def build_context_block(chunks: List[Dict]) -> str:
    lines = []
    for c in chunks:
        lines.append(f"[{c['law_name']} - مادة {c['article_id']}]\n{c['text']}")
    return "\n\n---\n\n".join(lines)


# ---------------------------------------------------------------------------
# STEP 3b - GUARDRAIL: verify every cited article number actually exists
# ---------------------------------------------------------------------------

_CITATION_PATTERN = re.compile(r"(?:مادة|المادة)\s*(?:رقم\s*)?\(?(\d+(?:\s*مكرر)?(?:\s*[أ-ي])?)\)?")


def extract_cited_articles(text: str) -> set:
    return {m.strip() for m in _CITATION_PATTERN.findall(text) if m.strip()}


def verify_citations(answer: str, chunks: List[Dict]) -> Dict:
    cited = extract_cited_articles(answer)
    available = {str(c.get("article_id", "")).strip() for c in chunks if c.get("article_id")}
    hallucinated = {a for a in cited if a and a not in available}
    return {
        "is_valid": len(hallucinated) == 0,
        "cited": cited,
        "available": available,
        "hallucinated": hallucinated,
    }


def _regenerate_with_citation_warning(question: str, context_block: str, hallucinated: set) -> str:
    warning = (
        "تنبيه: في المحاولة السابقة ذكرت أرقام مواد غير موجودة في النصوص المسترجعة "
        f"({', '.join(sorted(hallucinated))}). أعد الإجابة معتمدًا فقط على أرقام المواد الظاهرة "
        "فعليًا في النصوص أدناه، ولا تذكر أي رقم مادة غير موجود فيها."
    )
    user_message = f"""السؤال: {question}

{warning}

النصوص القانونية المسترجعة:
{context_block}
"""
    response = _llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": MAIN_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.0,
        max_tokens=800,
    )
    return response.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# STEP 4 - MULTI-TURN: remember context across follow-up questions
# ---------------------------------------------------------------------------

@dataclass
class ConversationState:
    """احتفظي بنفس الـ instance عبر الاستدعاءات المتتالية لنفس جلسة
    الاستشارة عشان الأسئلة التابعة (زي "وإيه لو كان العامل معاق؟") تشتغل
    صح. في الباك إند بنبنيها من chat_messages المحفوظة في الداتابيز لكل
    session_id بدل ما نحتفظ بيها في الذاكرة."""
    history: List[Dict[str, str]] = field(default_factory=list)
    max_turns: int = 8

    def add_turn(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        self.history = self.history[-self.max_turns:]

    def as_text(self, last_n: int = 4) -> str:
        recent = self.history[-last_n:]
        return "\n".join(f"{h['role']}: {h['content']}" for h in recent)

    @classmethod
    def from_db_history(cls, db_messages: List[Dict], max_turns: int = 8) -> "ConversationState":
        """بتبني ConversationState من نتيجة repo.get_chat_history() —
        [{"role": "user"|"assistant", "text": "..."}]."""
        state = cls(max_turns=max_turns)
        for m in db_messages:
            state.add_turn(m["role"], m.get("text", ""))
        return state


REWRITE_SYSTEM_PROMPT = """أنت أداة صغيرة مهمتك إعادة صياغة سؤال المستخدم الأخير ليصبح مستقلاً
وكاملاً بذاته (self-contained) بالاعتماد على المحادثة السابقة، مع الحفاظ التام على نفس المعنى
والنية. لا تجب على السؤال ولا تضف أي شرح - فقط رجّع السؤال المعاد صياغته كنص عادي بدون أي
تنسيق إضافي."""


def rewrite_query_with_history(question: str, state: "ConversationState") -> str:
    if not state.history:
        return question

    user_content = f"""المحادثة السابقة:
{state.as_text(last_n=4)}

السؤال الأخير: {question}

أعد صياغة السؤال الأخير فقط."""

    response = _llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0,
        max_tokens=120,
    )
    rewritten = response.choices[0].message.content.strip()
    return rewritten or question


# ---------------------------------------------------------------------------
# STEP 5 - END-TO-END ANSWER (routing -> retrieval -> generation -> guardrail)
# ---------------------------------------------------------------------------

def answer_question(
    question: str,
    conversation_state: Optional["ConversationState"] = None,
    verbose: bool = False,
) -> Dict:
    """نقطة الدخول الوحيدة المطلوبة من main.py. بتحمّل الموارد أول مرة
    (lazy) وبترجّع dict فيه: answer, needs_clarification, routing,
    retrieved_chunks, citation_check."""
    _ensure_pipeline()

    if conversation_state and conversation_state.history:
        effective_question = rewrite_query_with_history(question, conversation_state)
    else:
        effective_question = question

    routing = route_question(effective_question)

    if routing["mode"] == "ambiguous":
        clarification = build_clarification_message(routing["candidates"])
        if conversation_state is not None:
            conversation_state.add_turn("user", question)
            conversation_state.add_turn("assistant", clarification)
        if verbose:
            print("Ambiguous routing, asked for clarification:", routing["candidates"], routing["scores"])
        return {
            "question": question,
            "effective_question": effective_question,
            "routing": routing,
            "answer": clarification,
            "retrieved_chunks": [],
            "citation_check": None,
            "needs_clarification": True,
        }

    law_keys = routing["laws"]

    chunks = retrieve_chunks(effective_question, law_keys)
    context_block = build_context_block(chunks)

    user_message = f"""السؤال: {effective_question}

النصوص القانونية المسترجعة:
{context_block}
"""

    response = _llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": MAIN_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=800,
    )
    answer = response.choices[0].message.content.strip()

    verification = verify_citations(answer, chunks)
    retries = 0
    while not verification["is_valid"] and retries < CITATION_RETRY_LIMIT:
        answer = _regenerate_with_citation_warning(effective_question, context_block, verification["hallucinated"])
        verification = verify_citations(answer, chunks)
        retries += 1

    if not verification["is_valid"]:
        answer += (
            "\n\n⚠️ تنبيه: قد تحتوي هذه الإجابة على إشارة لرقم مادة لم يتم التحقق منه بشكل كامل "
            "في المصادر المسترجعة. يُنصح بمراجعة النص الأصلي للتأكد."
        )

    if conversation_state is not None:
        conversation_state.add_turn("user", question)
        conversation_state.add_turn("assistant", answer)

    result = {
        "question": question,
        "effective_question": effective_question,
        "routing": routing,
        "retrieved_chunks": chunks,
        "citation_check": verification,
        "answer": answer,
        "needs_clarification": False,
    }
    if verbose:
        print("Routing mode:", routing["mode"], "-> laws:", law_keys, "scores:", routing.get("scores"))
        print("Retrieved", len(chunks), "chunks")
        print("Citation check valid:", verification["is_valid"], "| hallucinated:", verification["hallucinated"])
        print("\n--- ANSWER ---\n", answer)
    return result