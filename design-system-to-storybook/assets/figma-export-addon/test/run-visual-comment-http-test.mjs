import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVisualCommentsHandler } from "../dist/review-server.js";
import { createVisualCommentStore } from "../dist/visual-comment-store.js";

const root = await mkdtemp(join(tmpdir(), "sbfx-comments-http-"));
const apiPath = "/__figma_export_review_comments";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const store = createVisualCommentStore({ cwd: root });
const handler = createVisualCommentsHandler({ basePath: apiPath, store });
const server = http.createServer((request, response) => handler(request, response));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}${apiPath}`;

function commentRequest(id) {
  return {
    clientRequestId: id,
    authorName: "Mina",
    body: "Check alignment",
    story: { id: "demo--story", title: "Demo", name: "Story" },
    pin: { xRatio: 1.2, yRatio: -0.2 },
    viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    capture: { dataUrl: png, mimeType: "image/png", width: 1, height: 1, cssWidth: 800, cssHeight: 600 },
  };
}

async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

try {
  const [startA, startB] = await Promise.all([
    post("/sessions", { title: "Meeting A" }),
    post("/sessions", { title: "Meeting B" }),
  ]);
  const [startPayloadA, startPayloadB] = await Promise.all([startA.json(), startB.json()]);
  assert.deepEqual(
    [startA.status, startB.status].sort(),
    [201, 409],
    JSON.stringify([startPayloadA, startPayloadB]),
  );
  const createdResponse = startA.status === 201 ? startA : startB;
  const conflictResponse = startA.status === 409 ? startA : startB;
  const created = startA.status === 201 ? startPayloadA : startPayloadB;
  const conflict = startA.status === 409 ? startPayloadA : startPayloadB;
  const meetingId = created.meeting.session.id;
  assert.equal(conflict.code, "ACTIVE");
  assert.equal(conflict.activeMeeting.id, meetingId);
  assert.equal(createdResponse.headers.get("access-control-allow-origin"), null);

  const overviewResponse = await fetch(`${base}?storyId=demo--story`);
  const overview = await overviewResponse.json();
  assert.equal(overview.activeSession.id, meetingId);
  assert.equal(overview.reportUrl, `${apiPath}/reports`);

  const commentResponse = await post(`/sessions/${meetingId}/comments`, commentRequest("http-1"));
  assert.equal(commentResponse.status, 201);
  const comment = await commentResponse.json();
  assert.equal(comment.comment.pin.xRatio, 1);
  assert.equal(comment.comment.pin.yRatio, 0);

  const invalidBefore = (await (await fetch(`${base}/sessions/${meetingId}`)).json()).comments.length;
  const invalidJson = await post(`/sessions/${meetingId}/comments`, "{");
  assert.equal(invalidJson.status, 400);
  const oversized = await post(
    `/sessions/${meetingId}/comments`,
    JSON.stringify({ value: "x".repeat(4 * 1024 * 1024 + 1) }),
  );
  assert.equal(oversized.status, 413);
  const invalidAfter = (await (await fetch(`${base}/sessions/${meetingId}`)).json()).comments.length;
  assert.equal(invalidAfter, invalidBefore);

  const meeting = await (await fetch(`${base}/sessions/${meetingId}`)).json();
  const asset = Object.values(meeting.captures)[0].image.path.split("/").pop();
  assert.equal((await fetch(`${base}/reports`)).status, 200);
  assert.equal((await fetch(`${base}/reports/sessions/${meetingId}/index.html`)).status, 200);
  assert.equal((await fetch(`${base}/reports/sessions/${meetingId}/assets/${asset}`)).status, 200);
  assert.equal((await fetch(`${base}/reports/sessions/${meetingId}/assets/../../state.json`)).status, 404);

  assert.equal((await post(`/sessions/${meetingId}/close`)).status, 200);
  assert.equal((await post(`/sessions/${meetingId}/comments`, commentRequest("http-2"))).status, 409);
  console.log("visual comment HTTP checks passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
