# citerag — roadmap beyond HW3

The HW3-frozen state is at commit `407c5b0` (May 2026). Anything past
that is open work, intended to be picked up by another agent/account
or a future me. This file is the handoff brief.

## What's shipped at the freeze

- Step 1–4 RAG pipeline migrated to LCEL (langchain.chains is gone).
- Per-paper Chroma store with `paper_id` metadata filter.
- `ConversationSummaryMemory` injected as `{history}` slot.
- Two improvement-technique knobs (`top_k`, `prompt_variant`) and a
  `stateless: true` flag for hermetic ablation runs.
- Branching dialogues — `parent_turn_id` walk on the backend, per-turn
  "branch from here" button, dialogue-tree visualization in the same
  graph panel as citations, click-node-to-scroll.
- Per-request model switcher (`/api/models` + frontend dropdown,
  per-model Ollama caching).
- `turns.json` is a self-describing experiment ledger
  (`rendered_prompt`, `top_k`, `prompt_variant`, `model`).

## Recommended sequence

Ordered by ROI and dependency. Don't do them out of order without
reading the dependencies note for each.

1. **PDF.js viewer** — high ROI, isolated, no LLM dependencies.
2. **Claude Code JSONL importer** — high ROI, isolated, no UI changes
   needed (reuses dialogue tree).
3. **Static export to GitHub Pages** — medium ROI, isolated.
4. **Clipboard image paste + vision LLM** — high ROI but
   gated by having a vision model loaded in Ollama.
5. **Semantic Scholar assisted edge entry** — low ROI for solo users,
   high for librarians; isolated.
6. **Cross-paper / citation-aware retrieval** — high research value,
   needs the seed library to grow first.
7. **Collapse/expand on Q&A turns** — pure UI nicety, defer until
   conversations regularly exceed 5–6 turns.

## Per-feature briefs

### 1. PDF.js viewer

**Goal.** Replace the title/abstract centre column with a real PDF
renderer. Click an anchor passage → scroll the PDF to that page.

**Interfaces.**
- Frontend only, mostly. Add `pdf.js` (or `react-pdf` if you want
  React). New `<canvas>` or container in the centre column.
- Backend: serve the PDF bytes for a given `paper_id`. New route
  `GET /api/papers/<id>/pdf` that streams from a local cache
  (`data/pdfs/<paper_id>.pdf`).

**Dependencies.** None on the LLM side. Don't try to wire this to
chunk highlighting in the first pass — too much surface area.

**Cost.** ~1 day. Most of it is making PDF.js play nicely with the
existing CSS grid.

**Watch out for.** PDF.js worker setup (the `pdf.worker.js` file
must be served from the right origin or it fails silently).

---

### 2. Claude Code JSONL importer

**Goal.** A short Python adapter that converts a Claude Code session
export into a citerag "paper" + `turns.json` chain so the dialogue
tree visualizes the entire session, including `isSidechain` branches.

**Schema isomorphism (verified against a real Claude Code jsonl).**

| citerag field          | Claude Code JSONL field          |
| ---------------------- | -------------------------------- |
| `id`                   | `uuid`                           |
| `parent_turn_id`       | `parentUuid`                     |
| `paper_id`             | `sessionId` (treat as a "paper") |
| `question` / `answer`  | `message.content` split by `type` (user/assistant) |
| `added_at`             | `timestamp`                      |
| (no equivalent)        | `isSidechain` — record as branch metadata |

**Interfaces.** New CLI: `python import_claude_jsonl.py <path.jsonl>`.
Adds a synthetic paper record to `data/edges.json` with the
`sessionId` as `paper_id`, and appends turns to `data/turns.json`.

**Dependencies.** None. Read-only conversion, doesn't touch the
running server.

**Cost.** ~2 hours. Mostly schema mapping and handling
user/assistant pairs (each Q&A turn in citerag corresponds to a
*pair* of Claude Code messages).

**Why this matters.** It generalizes citerag from "per-paper Q&A
viewer" to "any tree-shaped LLM conversation log viewer" — useful
for retrospectives, sidechain auditing, tutorial replay.

---

### 3. Static export to GitHub Pages

**Goal.** A `POST /api/export` route that emits a self-contained HTML
or Markdown bundle per paper (or per session), publishable as a
GitHub Pages site without running Flask.

**Interfaces.**
- Backend: `POST /api/papers/<id>/export?format=md|html` returns a
  zip or single file with the paper's edges + turns + (optionally)
  the dialogue-tree canvas as embedded SVG.
- For HTML: bundle `viewer.js` and `style.css` so the page is
  self-contained. Strip the ask-form (read-only export).

**Dependencies.** None.

**Cost.** ~half a day for Markdown, full day for self-contained HTML
with embedded canvases.

**Stretch.** A GitHub Action that runs the export on each push and
deploys to `gh-pages`.

---

### 4. Clipboard image paste + vision LLM

**Goal.** Paste an image (figure, chart, screenshot) into the ask
form; the model answers grounded in both the image and the retrieved
paper chunks.

**Model requirement.** Need a vision-capable model in Ollama. As of
this freeze, `gemma3` is the most accessible; `llava` and `qwen2-vl`
also work. Future models like `gemma4` (or whatever Google ships
next) should slot in once available — the design below is
model-agnostic.

**Interfaces.**
- Frontend: `paste` event on the textarea reads the clipboard,
  extracts image blobs, base64-encodes, attaches to the POST body
  as `images: [b64, ...]`. Show a thumbnail strip below the textarea.
- Backend: `/ask` accepts `images` field. When present and the
  selected model supports vision, the LCEL chain switches to a
  `ChatPromptTemplate` with multimodal content blocks
  (`{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}`).
- Vision-capable detection: filter `/api/models` to flag which
  models accept images; frontend disables image paste when a
  text-only model is selected. Lookup table is maintained in
  `rag.py`.

**Dependencies.**
- Ollama 0.5+ for vision support.
- LangChain's `ChatOllama` (different class than `Ollama`) for
  multimodal — you'll need to swap the LCEL chain depending on
  whether images are present.

**Cost.** ~1.5 days. The frontend paste handling is fast; the
backend dual-chain (text vs. multimodal) and the model-capability
lookup are the time sinks.

**Watch out for.** Token budget. A single 1024×1024 image can
consume 1k+ tokens depending on the vision encoder. Cap image
count and resize on the frontend before sending.

---

### 5. Semantic Scholar assisted edge entry

**Goal.** Click "Suggest references" on the focused paper → the
backend hits the Semantic Scholar Graph API
(`/paper/<id>/citations` and `/references`) → the user reviews
candidate edges in a list and accepts/rejects each.

**Interfaces.**
- Backend: `GET /api/papers/<id>/suggested-edges?source=semantic-scholar`.
- Frontend: a "Suggest" button on each empty edge form; a candidate
  list with accept buttons.

**Dependencies.** Semantic Scholar API key (free tier is rate-limited
to 100 req/5min, sufficient for solo use). Map paper IDs in
`data/edges.json` to S2 corpus IDs at ingest.

**Cost.** ~1 day.

**Stretch.** A `.tex` `\bibitem` bulk importer that parses a
bibliography file and creates one edge per citation. Useful when
adding a new paper whose bib is already typeset.

---

### 6. Cross-paper / citation-aware retrieval

**Goal.** When asking a question on paper A whose answer requires
context from a referenced paper B, retrieve from both. The structural
prior is the citation edge.

**Interfaces.**
- A `scope` parameter on `/ask`: `"single"` (default, current
  behavior), `"references"` (focus + 1-hop refs), or `"all"`.
- The Chroma filter changes from `{"paper_id": A}` to
  `{"paper_id": {"$in": [A, B, C, ...]}}`.

**Dependencies.** This is the original motivation for citerag's
graph structure (the rubric's "more sophisticated retrieval
strategy" line). Requires the seed library to be larger than 2
papers and have actual reference edges populated. Otherwise the
results are noise.

**Cost.** ~2 hours of code, weeks of seed-data curation. Defer
until you have ≥10 papers with real reference edges.

**Why interesting.** Direct evaluation against MTRAG's "non-standalone
question" category — questions that require resolving references
to a prior turn or a related document. Currently citerag handles
the prior-turn case (via `ConversationSummaryMemory`) but not the
related-document case.

---

### 7. Collapse/expand on Q&A turns

**Goal.** Each Q&A turn is collapsible from the question alone to
the full Q+A+sources block.

**Interfaces.** Use `<details><summary>` like the edge forms; CSS
only.

**Cost.** ~30 minutes.

**Why deferred.** The scrollable answer block already solves most
of the visual-overflow problem. Add this only when conversations
regularly exceed 5–6 turns, at which point density wins over
preview.

---

## Things that are *not* on the roadmap (and why)

- **Real bibtex** in the .tex report. The `\renewcommand{\cite}`
  shim is fine for a homework; venue paper later, sure.
- **PostgreSQL or SQLite swap** for `edges.json` / `turns.json`. JSON
  files are fine to ~1k turns. Swap when query latency becomes
  visible, not before.
- **Authentication.** This is single-user dev tooling. If you want
  multi-user, fork into a separate project — auth touches every
  endpoint and isn't worth retrofitting.

## Dev workflow advice for handoff

If you're picking this up as a different agent or another personal
account:

1. **Start by running the existing system end-to-end** before
   touching any code. The runbook is in
   `chat/S26/ECE595_002/hw3/note-eval-runbook.md` — follow sections
   0 and 1 verbatim.
2. **Read `server/rag.py` first.** It's small and dense. Once you
   understand the LCEL chain and the per-model `_ollama` cache,
   the rest of the codebase is plumbing.
3. **`turns.json` is the dataset.** Every change to the RAG layer
   should preserve the schema fields already there
   (`rendered_prompt`, `top_k`, `prompt_variant`, `model`,
   `parent_turn_id`). Adding fields is fine; removing is breaking.
4. **`stateless: true`** is your friend during development. Use it
   on every dev curl so you don't pollute the user's real history.
5. **Don't refactor the LCEL chain into a class.** It's 30 lines
   of imperative code on purpose; a class hides which steps are
   chained and which are explicit. The current shape is the right
   shape.
6. **Commit frequently to citerag**, not to the parent zimmnotes
   monorepo. The two are nested but separate; `cd citerag/ &&
   git status` is the source of truth for code.
