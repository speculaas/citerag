/**
 * permalink.js — Feature B
 * Restores FB's deprecated timestamp hyperlink that loaded the parent photo
 * in the main viewport and scrolled the comment thread to that comment.
 * Hash format: #photo-{photoId}/comment-{commentId}
 */
const Permalink = (() => {
  const handlers = [];

  function encode(photoId, commentId) {
    return commentId ? `#photo-${photoId}/comment-${commentId}` : `#photo-${photoId}`;
  }

  function decode(hash) {
    if (!hash || hash === "#") return null;
    const h = hash.startsWith("#") ? hash.slice(1) : hash;
    const photoMatch = h.match(/^photo-([^/]+)/);
    if (!photoMatch) return null;
    const commentMatch = h.match(/\/comment-(.+)$/);
    return { photoId: photoMatch[1], commentId: commentMatch ? commentMatch[1] : null };
  }

  function currentPhotoId()   { const p = decode(location.hash); return p ? p.photoId   : null; }
  function currentCommentId() { const p = decode(location.hash); return p ? p.commentId : null; }
  function navigate(photoId, commentId) { location.hash = encode(photoId, commentId); }

  function scrollToComment(commentId) {
    if (!commentId) return;
    const el = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (!el) return;
    document.querySelectorAll(".comment.highlighted").forEach(c => c.classList.remove("highlighted"));
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      el.classList.add("highlighted");
      el.addEventListener("animationend", () => el.classList.remove("highlighted"), { once: true });
    });
  }

  function onNavigate(callback) { handlers.push(callback); }

  window.addEventListener("hashchange", () => {
    handlers.forEach(cb => cb(decode(location.hash)));
  });
  window.addEventListener("DOMContentLoaded", () => {
    const parsed = decode(location.hash);
    if (parsed) handlers.forEach(cb => cb(parsed));
  });

  return { encode, decode, navigate, scrollToComment, currentPhotoId, currentCommentId, onNavigate };
})();
