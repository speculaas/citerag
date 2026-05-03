# citerag

A graph-native reader for citation networks, with optional RAG over
each paper. Each paper is a focus node with two outgoing edge types:
**references** (papers it cites) and **cited-by** (papers that cite
it). Click any edge card to switch focus; the right-column feed
re-renders for the new paper.

Edges are listed as cards in the right column and visualised as a
two-pane citation graph (toggled via the **Graph** button). RAG Q&A
layers on top in a subsequent commit.

## Run

```bash
pip install flask flask-cors
python server/app.py    # http://localhost:5000
```

The library is seeded with two arxiv papers; pick one in the left
strip. Use the two forms at the bottom of the feed to add references
or cited-by edges; they're persisted to `data/edges.json`
(hand-editable).

## Files

| File                    | Role                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `data/edges.json`       | The whole data model — papers map + edges list                |
| `server/app.py`         | Flask: `/api/library`, `/api/papers/<id>`, `/api/papers/<id>/edges`, `POST /api/edges` |
| `static/index.html`     | Three-column layout: library strip + viewport + feed panel    |
| `static/viewer.js`      | Fetch focus paper + edges, render cards, submit forms         |
| `static/style.css`      | Edge-card styling (`.edge-reference` / `.edge-cited_by`)      |
| `static/graph.js`       | `TreeGraph` — DFS-time / depth-space layout, ported from a comment-graph for the citation graph |
| `static/qa.js`          | **Unused in this minimal cut.** Reserved for Q&A turns in the feed. |
| `static/permalink.js`   | **Unused in this minimal cut.** Reserved for URL-hash routing. |

## Roadmap

1. ✅ **Edge feed.**
2. ✅ **Citation graph** — focus + 1-hop neighbours, two stacked
   canvases (References ↓ and Cited by ↑), click any node to refocus.
3. Wire RAG Q&A: `POST /api/papers/<id>/ask` over Chroma-embedded
   chunks, render Q&A turns interleaved in the feed.
4. Replace title/abstract viewport with PDF.js.
5. Optional: assisted edge-builder (Semantic Scholar candidates) and
   `.tex` `\bibitem` bulk import.

## Origin

Initially built for ECE 595-002 (Special Topics in ECE), University of
New Mexico, Spring 2026.
