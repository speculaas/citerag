"""Minimal Flask backend for paper-navigator.

Persists papers + edges to data/edges.json. No RAG, no graph, no Q&A yet —
that's deliberate. See ../../paper-navigator-plan.md for the layered plan.

Run:  python server/app.py   (from the paper-navigator/ directory)
"""
import json
import os
from datetime import datetime, timezone
from flask import Flask, jsonify, request, abort
from flask_cors import CORS

HERE      = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "data", "edges.json")

app = Flask(__name__, static_folder="../static", static_url_path="")
CORS(app)


def load():
    with open(DATA_PATH) as f:
        return json.load(f)


def save(data):
    with open(DATA_PATH, "w") as f:
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


if __name__ == "__main__":
    if not os.path.exists(DATA_PATH):
        raise SystemExit(f"ERROR: {DATA_PATH} not found.")
    app.run(debug=True, port=5000)
