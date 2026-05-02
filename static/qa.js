/**
 * comments.js — Feature A
 * Restores FB's deprecated 2-level nested comments.
 * depth 0 → Reply button shown
 * depth 1 → Reply button shown
 * depth 2 → NO Reply button (max depth)
 */
const Comments = (() => {

  function render(tree, photoId, container) {
    container.innerHTML = "";
    if (!tree || tree.length === 0) {
      container.innerHTML = '<p class="empty">No comments yet.</p>';
      return;
    }
    tree.forEach(comment => container.appendChild(buildNode(comment, photoId)));
  }

  function buildNode(comment, photoId) {
    const wrapper = document.createElement("div");
    wrapper.className = "comment";
    wrapper.dataset.depth = comment.depth;
    wrapper.dataset.commentId = comment.id;

    const bubble = document.createElement("div");
    bubble.className = "comment-bubble";
    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = comment.author;
    const body = document.createElement("span");
    body.className = "comment-body";
    body.textContent = comment.body;
    bubble.appendChild(author);
    bubble.appendChild(body);
    wrapper.appendChild(bubble);

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    // Feature B: timestamp as hyperlink
    const tsLink = document.createElement("a");
    tsLink.className = "comment-ts";
    tsLink.textContent = comment.timestamp;
    tsLink.href = Permalink.encode(photoId, comment.id);
    tsLink.title = "Open this comment in context";
    tsLink.addEventListener("click", e => { e.preventDefault(); Permalink.navigate(photoId, comment.id); });
    meta.appendChild(tsLink);

    // Feature A: Reply button at depth 0 and 1 only
    if (comment.depth < 2) {
      const replyBtn = document.createElement("button");
      replyBtn.className = "reply-btn";
      replyBtn.textContent = "Reply";
      replyBtn.addEventListener("click", () => toggleReplyForm(wrapper, comment, photoId));
      meta.appendChild(replyBtn);
    }
    wrapper.appendChild(meta);

    if (comment.children && comment.children.length > 0) {
      comment.children.forEach(child => wrapper.appendChild(buildNode(child, photoId)));
    }
    return wrapper;
  }

  function toggleReplyForm(parentEl, parentComment, photoId) {
    const existing = parentEl.querySelector(".reply-form");
    if (existing) { existing.remove(); return; }

    const form = document.createElement("div");
    form.className = "reply-form";

    const textarea = document.createElement("textarea");
    textarea.placeholder = `Reply to ${parentComment.author}…`;
    textarea.rows = 1;
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Send";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "cancel-btn";
    cancelBtn.addEventListener("click", () => form.remove());

    submitBtn.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) return;
      const newComment = {
        id: `mock-${Date.now()}`, photo_id: photoId,
        parent_id: parentComment.id, depth: parentComment.depth + 1,
        author: "You", body: text, timestamp: "Just now", children: [],
      };
      const newNode = buildNode(newComment, photoId);
      form.replaceWith(newNode);
      requestAnimationFrame(() => {
        newNode.classList.add("highlighted");
        newNode.addEventListener("animationend", () => newNode.classList.remove("highlighted"), { once: true });
      });
    });

    form.appendChild(textarea);
    form.appendChild(submitBtn);
    form.appendChild(cancelBtn);
    parentEl.querySelector(".comment-meta").insertAdjacentElement("afterend", form);
    textarea.focus();
  }

  function appendComment(commentData, parentEl) {
    parentEl.appendChild(buildNode(commentData, commentData.photo_id));
  }

  return { render, appendComment };
})();
