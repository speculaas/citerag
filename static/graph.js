/**
 * graph.js — CommentGraph (Feature C)
 *
 * Adapts the concepts from GitLab's network/graph.rb and network.js:
 *   time  → DFS traversal order, maps to y-axis (like commit timeline)
 *   space → horizontal lane derived from depth, maps to x-axis (like branch lanes)
 *
 * Renders the comment tree on a <canvas> with elbow connector lines, one
 * coloured lane per depth level. Click any node to navigate (Permalink).
 */
const CommentGraph = (() => {
  const NODE_R   = 5;
  const NODE_H   = 28;
  const LANE_W   = 20;
  const PAD_X    = 14;
  const PAD_Y    = 16;
  const MAX_LABEL = 11;
  const LANE_COLORS = ["#1877f2", "#e3008c", "#13a852", "#f7941d", "#7b61ff"];

  let _canvas, _ctx, _nodes, _photoId, _activeId;

  // Flatten tree → ordered list with time (DFS index) and space (depth lane).
  // Mirrors graph.rb's index_commits: each node gets c.time = i, c.space = lane.
  function flatten(tree) {
    const nodes = [];
    function dfs(comment) {
      nodes.push({
        id:       comment.id,
        parentId: comment.parent_id || null,
        depth:    comment.depth,
        author:   comment.author,
        time:     nodes.length,   // graph.rb: c.time = i
        space:    comment.depth,  // graph.rb: space = visual lane
      });
      (comment.children || []).forEach(dfs);
    }
    tree.forEach(dfs);
    return nodes;
  }

  function xy(node) {
    return {
      x: PAD_X + node.space * LANE_W,
      y: PAD_Y + node.time  * NODE_H,
    };
  }

  function draw() {
    if (!_canvas || !_nodes || _nodes.length === 0) return;

    const byId     = {};
    _nodes.forEach(n => { byId[n.id] = n; });
    const maxSpace = Math.max(..._nodes.map(n => n.space));
    const labelW   = MAX_LABEL * 6 + 8;
    const w        = PAD_X * 2 + (maxSpace + 1) * LANE_W + labelW;
    const h        = PAD_Y * 2 + (_nodes.length - 1) * NODE_H + NODE_R * 2;

    _canvas.width  = w;
    _canvas.height = h;
    _ctx = _canvas.getContext("2d");
    _ctx.clearRect(0, 0, w, h);

    // Vertical lane rails — mirrors the continuous lines in GitLab network graph
    const bySpace = {};
    _nodes.forEach(n => { (bySpace[n.space] = bySpace[n.space] || []).push(n); });
    Object.entries(bySpace).forEach(([sp, group]) => {
      if (group.length < 2) return;
      const color = LANE_COLORS[Number(sp) % LANE_COLORS.length];
      const x0    = xy(group[0]).x;
      _ctx.beginPath();
      _ctx.strokeStyle = color + "30";
      _ctx.lineWidth   = 2;
      _ctx.moveTo(x0, xy(group[0]).y);
      _ctx.lineTo(x0, xy(group[group.length - 1]).y);
      _ctx.stroke();
    });

    // Elbow connector: parent → child (vertical then horizontal).
    // Mirrors graph.rb's parent_spaces / place_chain logic.
    _nodes.forEach(node => {
      if (!node.parentId || !byId[node.parentId]) return;
      const p     = byId[node.parentId];
      const color = LANE_COLORS[node.space % LANE_COLORS.length];
      const { x: px, y: py } = xy(p);
      const { x: cx, y: cy } = xy(node);
      _ctx.beginPath();
      _ctx.strokeStyle = color + "90";
      _ctx.lineWidth   = 1.5;
      _ctx.moveTo(px, py + NODE_R);
      _ctx.lineTo(px, cy);
      _ctx.lineTo(cx - NODE_R, cy);
      _ctx.stroke();
    });

    // Nodes + author labels
    _nodes.forEach(node => {
      const { x, y } = xy(node);
      const color     = LANE_COLORS[node.space % LANE_COLORS.length];
      const isActive  = node.id === _activeId;

      _ctx.beginPath();
      _ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
      _ctx.fillStyle   = isActive ? color : "#ffffff";
      _ctx.fill();
      _ctx.strokeStyle = color;
      _ctx.lineWidth   = isActive ? 2.5 : 1.5;
      _ctx.stroke();

      // First-name label — truncated to MAX_LABEL chars
      const label = node.author.split(" ")[0].slice(0, MAX_LABEL);
      _ctx.fillStyle    = isActive ? color : "#65676b";
      _ctx.font         = `${isActive ? 600 : 400} 10px -apple-system, BlinkMacSystemFont, sans-serif`;
      _ctx.textBaseline = "middle";
      _ctx.fillText(label, x + NODE_R + 5, y);
    });
  }

  function render(tree, photoId, canvasEl) {
    _canvas   = canvasEl;
    _photoId  = photoId;
    _activeId = Permalink.currentCommentId();
    _nodes    = (tree && tree.length > 0) ? flatten(tree) : [];
    draw();

    _canvas.onclick = e => {
      if (!_nodes || _nodes.length === 0) return;
      const rect  = _canvas.getBoundingClientRect();
      const scaleX = _canvas.width  / rect.width;
      const scaleY = _canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top)  * scaleY;
      const hit = _nodes.find(n => {
        const { x, y } = xy(n);
        return Math.hypot(mx - x, my - y) <= NODE_R + 6;
      });
      if (hit) Permalink.navigate(_photoId, hit.id);
    };
  }

  function highlight(commentId) {
    _activeId = commentId;
    draw();
  }

  return { render, highlight };
})();
