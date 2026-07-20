import assert from "node:assert/strict";
import { renderVisualCommentReport } from "../dist/visual-comment-report.js";

const report = renderVisualCommentReport({
  version: 1,
  session: { id: "session-1", title: "</style><script>alert(1)</script>", startedAt: "2026-07-20T00:00:00Z", closedAt: null },
  captures: {
    "capture-1": {
      id: "capture-1",
      capturedAt: "2026-07-20T00:00:00Z",
      story: { id: "story", title: "Components/Button", name: "Primary", url: "javascript:alert(1)" },
      viewport: { width: 390, height: 844, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
      image: { path: "assets/hash.png", mimeType: "image/png", width: 1, height: 1, cssWidth: 390, cssHeight: 844, sha256: "hash", bytes: 10 },
    },
  },
  comments: [{ id: "comment-1", clientRequestId: "request-1", captureId: "capture-1", authorName: "<img onerror=alert(2)>", body: "</style><script>alert(3)</script>", pin: { xRatio: 0.43, yRatio: 0.61 }, createdAt: "2026-07-20T00:00:01Z" }],
});
assert.match(report, /Content-Security-Policy/);
assert.match(report, /assets\/hash\.png/);
assert.match(report, /&lt;\/style&gt;&lt;script&gt;/);
assert.doesNotMatch(report, /<script>alert/);
assert.doesNotMatch(report, /href="javascript:/);
assert.match(report, /left:43%/);
console.log("visual comment report checks passed");
