# citerag

A graph-native reader for citation networks, with per-paper RAG. Each
paper is a focus node with two outgoing edge types: **references**
(papers it cites) and **cited-by** (papers that cite it). Click any
edge card to switch focus; the feed re-renders for the new paper.

The current slice ships:

- a list-view feed of references + cited-by + Q&A turns,
- a two-pane visual citation graph (toggled via the **Graph** button), and
- per-paper RAG Q&A over Chroma-embedded PDF chunks
  (`POST /api/papers/<id>/ask`).

## Run

```bash
pip install -r requirements.txt
ollama serve &                          # in another terminal; install once: ollama pull mistral
python ingest.py arxiv-2407.04180 path/to/Slice-100K.pdf
python server/app.py                    # http://localhost:5000
```

The library is seeded with two arxiv papers; pick one in the left
strip. Add references / cited-by edges via the two forms at the bottom
of the feed (persisted to `data/edges.json`). Ask questions about the
focused paper in the Q&A box at the top of the feed (persisted to
`data/turns.json`).

You only need to ingest a paper once. The `/ask` endpoint will refuse
with a 409 if the focused paper has no chunks indexed yet — run
`python ingest.py <paper_id> <pdf>` to fix.

## Files

| File                    | Role                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `data/edges.json`       | Papers map + typed edge list (hand-editable)                  |
| `data/turns.json`       | Q&A turns, append-only                                        |
| `data/chroma/`          | Chroma persistent vector store (created on first ingest)      |
| `ingest.py`             | CLI: load a PDF into Chroma under a given `paper_id`          |
| `server/app.py`         | Flask: edges, turns, library, and `POST .../ask` endpoints    |
| `server/rag.py`         | RAG layer — Ollama mistral + HF all-mpnet-base-v2 + Chroma    |
| `static/index.html`     | Three-column layout: library strip + viewport + feed panel    |
| `static/viewer.js`      | Fetches paper + edges + turns, renders the feed and graph    |
| `static/style.css`      | Edge cards, Q&A bubbles, ask form, graph panel                |
| `static/graph.js`       | `TreeGraph` — DFS-time / depth-space layout (citation graph)  |
| `static/qa.js`          | **Unused.** Reserved for nested Q&A follow-ups.               |
| `static/permalink.js`   | **Unused.** Reserved for URL-hash routing.                    |

## Roadmap

1. ✅ **Edge feed.**
2. ✅ **Citation graph** — focus + 1-hop neighbours, two stacked
   canvases (References ↓ and Cited by ↑), click any node to refocus.
3. ✅ **RAG Q&A** — per-paper retrieval over a Chroma store filtered
   by `paper_id` metadata, rendered as Q&A turns in the feed.
4. Replace title/abstract viewport with PDF.js.
5. Optional: nested Q&A follow-ups; assisted edge-builder (Semantic
   Scholar candidates); `.tex` `\bibitem` bulk import.

## Origin

Initially built for ECE 595-002 (Special Topics in ECE), University of
New Mexico, Spring 2026.
