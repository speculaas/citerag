"""RAG layer for citerag — per-paper retrieval over a shared Chroma store.

All paper chunks live in a single Chroma persistent directory; each chunk
carries metadata.paper_id and the retriever filters on it. This keeps
the on-disk footprint compact and makes cross-paper retrieval (a future
"citation-aware" improvement) a one-line filter change.

Models match steps 1-4 of the assignment: HuggingFace all-mpnet-base-v2
for embeddings, Ollama mistral for generation, the [INST] prompt template
from step 3.

Heavy modules (HF, Chroma, Ollama) load lazily so app.py startup doesn't
require Ollama to be running.
"""
import os

EMBED_MODEL = "all-mpnet-base-v2"
LLM_MODEL   = "gpt-oss:20b"
CHUNK_SIZE  = 2000
CHUNK_OVER  = 30
TOP_K       = 4

CHROMA_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "chroma")
)

_embed   = None
_db      = None
_llm     = None
_chain   = None  # cached per-paper-id

PROMPT_TEMPLATE = """
<s>[INST]
Given the prior conversation summary and the retrieved context below, answer the question.
If the prior conversation is empty, treat this as a fresh question.

Prior conversation:
{history}

Context:
{context}

Question:
{question}

[/INST]
"""


def _embedding():
    global _embed
    if _embed is None:
        from langchain_huggingface import HuggingFaceEmbeddings
        _embed = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    return _embed


def _vectordb():
    global _db
    if _db is None:
        from langchain_community.vectorstores import Chroma
        _db = Chroma(persist_directory=CHROMA_DIR, embedding_function=_embedding())
    return _db


def _ollama():
    global _llm
    if _llm is None:
        from langchain_community.llms import Ollama
        _llm = Ollama(model=LLM_MODEL)
    return _llm


def ingest_pdf(paper_id: str, pdf_path: str) -> int:
    """Load a PDF, split into chunks, tag with paper_id, persist to Chroma."""
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_community.document_loaders import PyPDFLoader

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVER, length_function=len,
    )
    docs = PyPDFLoader(pdf_path).load_and_split(text_splitter=splitter)
    for d in docs:
        d.metadata["paper_id"] = paper_id

    db = _vectordb()
    db.add_documents(docs)
    return len(docs)


def chunk_count(paper_id: str) -> int:
    """How many chunks are indexed for this paper. 0 means not yet ingested."""
    db = _vectordb()
    try:
        got = db.get(where={"paper_id": paper_id}, include=[])
        return len(got.get("ids", []))
    except Exception:
        return 0


def _summarize_history(prior_turns: list) -> str:
    """Replay prior Q/A turns into a ConversationSummaryMemory and return its summary.
    Empty list → empty string (the prompt template handles the empty case)."""
    if not prior_turns:
        return ""
    try:
        from langchain.memory import ConversationSummaryMemory
    except ImportError:
        # Memory module not present; fall back to a literal Q/A transcript.
        return "\n".join(f"Q: {t['question']}\nA: {t['answer']}" for t in prior_turns)

    memory = ConversationSummaryMemory(llm=_ollama())
    for t in prior_turns:
        memory.save_context({"input": t["question"]}, {"output": t["answer"]})
    return memory.load_memory_variables({}).get("history", "")


def ask(paper_id: str, question: str, prior_turns: list = None) -> dict:
    """Run the RAG chain scoped to one paper. Returns {answer, sources}.
    prior_turns: list of earlier {question, answer} dicts for this paper —
    summarised via ConversationSummaryMemory and injected as {history}."""
    from langchain_core.prompts import PromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    prompt = PromptTemplate(
        template=PROMPT_TEMPLATE,
        input_variables=["context", "question", "history"],
    )
    retriever = _vectordb().as_retriever(
        search_kwargs={"k": TOP_K, "filter": {"paper_id": paper_id}},
    )
    docs = retriever.invoke(question)
    context = "\n\n".join(d.page_content for d in docs)
    history = _summarize_history(prior_turns or [])

    chain = prompt | _ollama() | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question, "history": history})

    sources = []
    for d in docs:
        page = d.metadata.get("page")
        src  = d.metadata.get("source", "")
        sources.append(f"{os.path.basename(src) if src else paper_id}#p{page}" if page is not None else (src or paper_id))
    return {"answer": answer.strip(), "sources": sources, "history": history}
