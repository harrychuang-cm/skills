// src/visualCommentReport.ts
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
}
var csp = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function renderVisualCommentReport(meeting) {
  const captures = Object.values(meeting.captures).sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt)
  );
  const sections = captures.map((capture) => {
    const comments = meeting.comments.filter((comment) => comment.captureId === capture.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const pins = comments.map(
      (comment, index) => `<span class="pin" style="left:${comment.pin.xRatio * 100}%;top:${comment.pin.yRatio * 100}%">${index + 1}</span>`
    ).join("");
    const cards = comments.map(
      (comment, index) => `<article><strong>${index + 1}. ${escapeHtml(comment.authorName)}</strong><time>${escapeHtml(comment.createdAt)}</time><p>${escapeHtml(comment.body)}</p></article>`
    ).join("");
    const storyUrl = safeHttpUrl(capture.story.url);
    const heading = storyUrl ? `<a href="${escapeHtml(storyUrl)}">${escapeHtml(capture.story.title)} / ${escapeHtml(capture.story.name)}</a>` : `${escapeHtml(capture.story.title)} / ${escapeHtml(capture.story.name)}`;
    const metadata = [capture.story.routeId, capture.story.stateId].filter(Boolean).map(escapeHtml).join(" \xB7 ");
    return `<section><h2>${heading}</h2>${metadata ? `<p class="metadata">${metadata}</p>` : ""}<div class="snapshot" style="aspect-ratio:${capture.image.width}/${capture.image.height}"><img src="${escapeHtml(capture.image.path)}" alt="Captured ${escapeHtml(capture.story.name)}">${pins}</div><div class="comments">${cards}</div></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(meeting.session.title)}</title><style>body{font:16px system-ui;margin:2rem;color:#222}a{color:inherit}.metadata{color:#666}.snapshot{position:relative;max-width:960px}.snapshot img{display:block;width:100%;height:100%;object-fit:contain}.pin{position:absolute;transform:translate(-50%,-50%);background:#d33;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px}.comments{display:grid;gap:.5rem;max-width:960px}article{border:1px solid #ddd;padding:.75rem}time{float:right;color:#666}p{white-space:pre-wrap}</style></head><body><h1>${escapeHtml(meeting.session.title)}</h1><p>${escapeHtml(meeting.session.startedAt)}${meeting.session.closedAt ? ` \u2013 ${escapeHtml(meeting.session.closedAt)}` : " (active)"}</p>${sections || "<p>No comments yet.</p>"}</body></html>`;
}
function renderVisualCommentIndex(meetings, activeSessionId) {
  const links = [...meetings].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(
    (meeting) => `<li><a href="sessions/${encodeURIComponent(meeting.id)}/index.html">${escapeHtml(meeting.title)}</a> <small>${escapeHtml(meeting.startedAt)}</small>${meeting.id === activeSessionId ? " (active)" : ""}</li>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visual review meetings</title></head><body><h1>Visual review meetings</h1><ul>${links}</ul></body></html>`;
}
export {
  renderVisualCommentIndex,
  renderVisualCommentReport
};
//# sourceMappingURL=visual-comment-report.js.map