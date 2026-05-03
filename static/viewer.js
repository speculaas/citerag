/**
 * viewer.js — minimal paper-navigator UI.
 * Single focus paper (the root). Right column lists references + cited-by.
 * Two forms append edges via POST /api/edges; reload re-renders the feed.
 *
 * No graph, no RAG, no PDF rendering yet — those layer on later.
 */
const $ = id => document.getElementById(id);

let focusId = null;

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${opts?.method || "GET"} ${path} → ${res.status}`);
  return res.json();
}

async function loadFocus(id) {
  focusId = id;
  const [paper, edges, turns] = await Promise.all([
    api(`/api/papers/${id}`),
    api(`/api/papers/${id}/edges`),
    api(`/api/papers/${id}/turns`),
  ]);
  renderPaper(paper);
  renderFeed(edges, turns);
  renderGraphs(paper, edges);
  document.querySelectorAll("#library-strip .lib-item").forEach(el =>
    el.classList.toggle("active", el.dataset.paperId === id));
}

function paperLabel(p) {
  const firstAuthor = (p.authors || "").split(",")[0].trim().split(" ").pop();
  const year = p.year ? ` ${p.year}` : "";
  return (firstAuthor || p.id) + year;
}

function renderGraphs(focus, edges) {
  const focusNode = id => ({
    id, parent_id: null, depth: 0,
    label: paperLabel({ ...focus, id }),
  });
  const childNode = e => ({
    id: e.other_id, parent_id: focusId, depth: 1,
    label: e.other_title || e.other_id,
    children: [],
  });

  const refTree = [{ ...focusNode(focusId), children: edges.references.map(childNode) }];
  const cbTree  = [{ ...focusNode(focusId), children: edges.cited_by.map(childNode)  }];

  const opts = { activeId: focusId, onNodeClick: id => loadFocus(id).catch(err => alert(err.message)) };
  TreeGraph.render(refTree, $("graph-references"), opts);
  TreeGraph.render(cbTree,  $("graph-cited-by"),   opts);
}

function renderLibrary(items) {
  const strip = $("library-strip");
  strip.innerHTML = "";
  items.forEach(p => {
    const el = document.createElement("div");
    el.className = "lib-item";
    el.dataset.paperId = p.id;
    el.innerHTML = `
      <div class="lib-title">${escape(p.title)}</div>
      <div class="lib-meta">${escape(p.authors || "")}${p.year ? ` · ${p.year}` : ""}</div>
    `;
    el.addEventListener("click", () => loadFocus(p.id).catch(err => alert(err.message)));
    strip.appendChild(el);
  });
}

function renderPaper(p) {
  $("paper-meta").innerHTML = `
    <h2>${escape(p.title || p.id)}</h2>
    <p class="meta-line">
      ${p.authors ? escape(p.authors) : ""}
      ${p.year ? ` · ${p.year}` : ""}
      ${p.venue ? ` · ${escape(p.venue)}` : ""}
      ${p.url ? ` · <a href="${p.url}" target="_blank" rel="noreferrer">${p.url}</a>` : ""}
    </p>
    ${p.abstract ? `<p class="abstract">${escape(p.abstract)}</p>` : ""}
  `;
}

function renderFeed({ references, cited_by }, turns) {
  const feed = $("feed");
  feed.innerHTML = "";

  feed.appendChild(qaSection(turns));

  if (references.length) {
    feed.appendChild(section("References ↓", references, "reference"));
  }
  if (cited_by.length) {
    feed.appendChild(section("Cited by ↑", cited_by, "cited_by"));
  }
}

function qaSection(turns) {
  const wrap = document.createElement("div");
  wrap.className = "feed-section qa-section";
  wrap.innerHTML = `<h3>Q&amp;A</h3>`;

  if (turns.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-q";
    empty.textContent = "No questions asked yet.";
    wrap.appendChild(empty);
  } else {
    turns.forEach(t => wrap.appendChild(turnNode(t)));
  }

  const form = document.createElement("div");
  form.className = "ask-form";
  form.innerHTML = `
    <textarea class="ask-q" placeholder="Ask a question about this paper…"></textarea>
    <button class="ask-btn">Ask</button>
  `;
  form.querySelector(".ask-btn").addEventListener("click", askQuestion);
  form.querySelector(".ask-q").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askQuestion();
  });
  wrap.appendChild(form);
  return wrap;
}

function turnNode(t) {
  const el = document.createElement("div");
  el.className = "qa-turn";
  el.dataset.turnId = t.id;
  el.innerHTML = `
    <div class="qa-q"><span class="qa-label">Q</span> ${escape(t.question)}</div>
    <div class="qa-a"><span class="qa-label">A</span> ${escape(t.answer)}</div>
    ${t.sources && t.sources.length ? `<div class="qa-sources">${t.sources.map(escape).join(" · ")}</div>` : ""}
  `;
  return el;
}

async function askQuestion() {
  const ta  = document.querySelector(".ask-q");
  const btn = document.querySelector(".ask-btn");
  const q   = ta.value.trim();
  if (!q) return;
  btn.disabled = true; btn.textContent = "Thinking…";
  try {
    await api(`/api/papers/${focusId}/ask`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question: q }),
    });
    ta.value = "";
    await loadFocus(focusId);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Ask";
  }
}

function section(label, edges, type) {
  const wrap = document.createElement("div");
  wrap.className = "feed-section";
  wrap.innerHTML = `<h3>${label}</h3>`;
  edges.forEach(e => wrap.appendChild(card(e, type)));
  return wrap;
}

function card(edge, type) {
  const el = document.createElement("div");
  el.className = `edge-card edge-${type}`;
  el.innerHTML = `
    <div class="edge-arrow">${type === "reference" ? "→" : "←"}</div>
    <div class="edge-body">
      <div class="edge-title">${escape(edge.other_title || edge.other_id)}</div>
      <div class="edge-id">${escape(edge.other_id)}</div>
      ${edge.anchor ? `<div class="edge-anchor">"${escape(edge.anchor)}"</div>` : ""}
    </div>
  `;
  el.addEventListener("click", () => loadFocus(edge.other_id).catch(err => alert(err.message)));
  return el;
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function submitEdge(type) {
  const prefix = type === "reference" ? "ref" : "cb";
  const get = cls => document.querySelector(`.${prefix}-${cls}`);
  const otherId = get("id").value.trim();
  if (!otherId) return alert("Other paper id is required.");

  try {
    await api("/api/edges", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        focus_paper_id:  focusId,
        other_paper_id:  otherId,
        other_title:     get("title").value,
        other_url:       get("url").value,
        anchor:          get("anchor").value,
        type,
      }),
    });
    [`${prefix}-id`, `${prefix}-title`, `${prefix}-url`, `${prefix}-anchor`]
      .forEach(c => { document.querySelector(`.${c}`).value = ""; });
    await loadFocus(focusId);
  } catch (err) {
    alert(err.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("button[data-add]").forEach(btn =>
    btn.addEventListener("click", () => submitEdge(btn.dataset.add))
  );

  const graphToggle = $("graph-toggle");
  const graphPanel  = $("graph-panel");
  graphToggle.addEventListener("click", () => {
    const open = graphPanel.classList.toggle("open");
    graphToggle.classList.toggle("active", open);
  });
  try {
    const lib = await api("/api/library");
    renderLibrary(lib);
    if (lib.length === 0) throw new Error("Library is empty.");
    await loadFocus(lib[0].id);
  } catch (err) {
    $("paper-meta").innerHTML =
      `<p class="error">Could not load. Run <code>python server/app.py</code> from the paper-navigator/ directory.</p>`;
  }
});
