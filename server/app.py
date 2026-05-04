"""Flask backend for citerag.

Persists papers + edges to data/edges.json and Q&A turns to data/turns.json.
RAG (POST /api/papers/<id>/ask) is delegated to server/rag.py and runs
against a Chroma store filtered by paper_id metadata.

Run:  python server/app.py     (Ollama must be running for /ask)
"""
import json
import os
import sys
from datetime import datetime, timezone
from flask import Flask, jsonify, request, abort
from flask_cors import CORS

HERE       = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # make `import rag` work from the /ask handler
DATA_PATH  = os.path.join(HERE, "..", "data", "edges.json")
TURNS_PATH = os.path.join(HERE, "..", "data", "turns.json")

app = Flask(__name__, static_folder="../static", static_url_path="")
CORS(app)


def load():
    with open(DATA_PATH) as f:
        return json.load(f)


def save(data):
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, indent=2)


def load_turns():
    if not os.path.exists(TURNS_PATH):
        return {"turns": []}
    with open(TURNS_PATH) as f:
        return json.load(f)


def save_turns(data):
    with open(TURNS_PATH, "w") as f:
        json.dump(data, f, indent=2)


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/api/library")
def library():
    data = load()
    out = []
    for pid in data.get("library", []):
        p = data["papers"].get(pid, {})
        out.append({"id": pid, "title": p.get("title", pid),
                    "authors": p.get("authors", ""), "year": p.get("year")})
    return jsonify(out)


@app.route("/api/papers/<paper_id>")
def get_paper(paper_id):
    data = load()
    paper = data["papers"].get(paper_id)
    if paper is None:
        abort(404)
    return jsonify({"id": paper_id, **paper})


@app.route("/api/papers/<paper_id>/edges")
def get_edges(paper_id):
    """Return edges where paper_id is at one end, plus titles for the other end."""
    data = load()
    refs, cited_by = [], []
    for e in data["edges"]:
        if e["from"] == paper_id and e["type"] == "reference":
            other = data["papers"].get(e["to"], {"title": e["to"]})
            refs.append({**e, "other_id": e["to"], "other_title": other.get("title", e["to"])})
        elif e["to"] == paper_id and e["type"] == "cited_by":
            other = data["papers"].get(e["from"], {"title": e["from"]})
            cited_by.append({**e, "other_id": e["from"], "other_title": other.get("title", e["from"])})
    return jsonify({"references": refs, "cited_by": cited_by})


@app.route("/api/edges", methods=["POST"])
def add_edge():
    """Body: {focus_paper_id, other_paper_id, other_title, other_url, type, anchor}.
    type ∈ {reference, cited_by}. Direction is derived from type:
      reference → focus cites other (from=focus, to=other)
      cited_by  → other cites focus (from=other,  to=focus)
    """
    body = request.get_json(force=True)
    focus = body["focus_paper_id"]
    other = body["other_paper_id"].strip()
    if not focus or not other:
        abort(400, "focus_paper_id and other_paper_id required")
    edge_type = body["type"]
    if edge_type not in ("reference", "cited_by"):
        abort(400, "type must be 'reference' or 'cited_by'")

    data = load()

    if other not in data["papers"]:
        data["papers"][other] = {
            "title": body.get("other_title", "").strip() or other,
            "url":   body.get("other_url", "").strip(),
        }

    edge = {
        "from":     focus if edge_type == "reference" else other,
        "to":       other if edge_type == "reference" else focus,
        "type":     edge_type,
        "anchor":   body.get("anchor", "").strip(),
        "added_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    data["edges"].append(edge)
    save(data)
    return jsonify({"ok": True, "edge": edge})


@app.route("/api/papers/<paper_id>/turns")
def get_turns(paper_id):
    turns = load_turns()["turns"]
    return jsonify([t for t in turns if t["paper_id"] == paper_id])


@app.route("/api/papers/<paper_id>/ask", methods=["POST"])
def ask(paper_id):
    body = request.get_json(force=True)
    question = (body.get("question") or "").strip()
    if not question:
        abort(400, "question is required")

    data = load()
    if paper_id not in data["papers"]:
        abort(404, f"unknown paper: {paper_id}")

    import rag as rag_module
    if rag_module.chunk_count(paper_id) == 0:
        abort(409, f"no chunks indexed for {paper_id}; run `python ingest.py {paper_id} <pdf>` first")

    top_k          = int(body.get("top_k") or 4)
    prompt_variant = body.get("prompt_variant") or "base"
    stateless      = bool(body.get("stateless"))

    if stateless:
        turns_data, prior_turns = None, []
    else:
        turns_data  = load_turns()
        prior_turns = [t for t in turns_data["turns"] if t["paper_id"] == paper_id]

    try:
        result = rag_module.ask(
            paper_id, question, prior_turns=prior_turns,
            top_k=top_k, prompt_variant=prompt_variant,
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        abort(503, f"RAG call failed (is Ollama running?): {e}")

    now = datetime.now(timezone.utc)
    turn = {
        "id":             f"t-{int(now.timestamp() * 1000)}",
        "paper_id":       paper_id,
        "parent_turn_id": body.get("parent_turn_id"),
        "question":       question,
        "answer":         result["answer"],
        "sources":        result["sources"],
        "history":        result.get("history", ""),
        "rendered_prompt": result.get("rendered_prompt", ""),
        "top_k":          result.get("top_k"),
        "prompt_variant": result.get("prompt_variant"),
        "added_at":       now.isoformat(timespec="seconds"),
    }
    if not stateless:
        turns_data["turns"].append(turn)
        save_turns(turns_data)
    return jsonify(turn)


if __name__ == "__main__":
    if not os.path.exists(DATA_PATH):
        raise SystemExit(f"ERROR: {DATA_PATH} not found.")
    app.run(host="0.0.0.0", debug=True, port=5000)
