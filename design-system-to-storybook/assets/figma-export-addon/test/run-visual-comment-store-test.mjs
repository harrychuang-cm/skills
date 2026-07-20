import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVisualCommentStore } from "../dist/visual-comment-store.js";

const root = await mkdtemp(join(tmpdir(), "sbfx-comments-"));
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const pngBytes = Buffer.from(png.split(",")[1], "base64");
const differentBytes = Buffer.from(pngBytes);
differentBytes[differentBytes.length - 10] ^= 1;
const differentPng = `data:image/png;base64,${differentBytes.toString("base64")}`;

function request(clientRequestId, body = "Adjust this spacing", dataUrl = png) {
  return {
    clientRequestId,
    authorName: "Mina",
    body,
    story: {
      id: "components-button--primary",
      title: "Components/Button",
      name: "Primary",
      url: "http://localhost:6006/?path=/story/components-button--primary",
      routeId: "/portfolio",
      stateId: "modal-open",
    },
    pin: { xRatio: 0.43, yRatio: 0.61 },
    viewport: { width: 390, height: 844, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
    capture: { dataUrl, mimeType: "image/png", width: 1, height: 1, cssWidth: 390, cssHeight: 844 },
  };
}

try {
  const legacyStatusPath = join(root, "design-system/figma-export-review-status.json");
  await mkdir(join(root, "design-system"), { recursive: true });
  await writeFile(legacyStatusPath, '{"version":1,"stories":{"demo":{"notes":"keep me"}}}\n');

  const store = createVisualCommentStore({ cwd: root });
  const started = await store.startMeeting("Weekly design review");
  const meetingId = started.meeting.session.id;
  const [first, second] = await Promise.all([
    store.createComment(meetingId, request("request-1")),
    store.createComment(meetingId, request("request-2", "Align the label")),
  ]);
  assert.equal(first.comment.authorName, "Mina");
  assert.notEqual(first.comment.id, second.comment.id);
  assert.equal((await store.getMeeting(meetingId)).comments.length, 2, "parallel writes are serialized");

  const replay = await store.createComment(meetingId, request("request-1"));
  assert.equal(replay.replay, true);
  assert.equal((await store.getMeeting(meetingId)).comments.length, 2);
  await assert.rejects(
    () => store.createComment(meetingId, request("request-1", "different")),
    (error) => error.code === "CONFLICT" && error.statusCode === 409,
  );

  const restarted = createVisualCommentStore({ cwd: root });
  assert.equal((await restarted.getState()).activeSessionId, meetingId);
  assert.equal((await restarted.getMeeting(meetingId)).comments.length, 2);
  const overview = await restarted.getOverview("components-button--primary");
  assert.equal(overview.comments.length, 2);

  const canonical = await readFile(
    join(root, "design-system/figma-export-review/sessions", meetingId, "meeting.json"),
    "utf8",
  );
  assert.doesNotMatch(canonical, /data:image/);
  assert.match(canonical, /assets\/[a-f0-9]{64}\.png/);
  assert.equal(await readFile(legacyStatusPath, "utf8"), '{"version":1,"stories":{"demo":{"notes":"keep me"}}}\n');

  const countBeforeInvalid = (await restarted.getMeeting(meetingId)).comments.length;
  await assert.rejects(
    () => restarted.createComment(meetingId, { ...request("bad-pin"), pin: { xRatio: Number.NaN, yRatio: 0 } }),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    () => restarted.createComment(meetingId, { ...request("bad-mime"), capture: { ...request("x").capture, mimeType: "image/webp" } }),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    () => restarted.createComment(meetingId, { ...request("bad-author"), authorName: "a".repeat(81) }),
    (error) => error.statusCode === 400,
  );
  assert.equal((await restarted.getMeeting(meetingId)).comments.length, countBeforeInvalid);

  await restarted.closeMeeting(meetingId);
  await assert.rejects(
    () => restarted.createComment(meetingId, request("request-3")),
    (error) => error.code === "CLOSED" && error.statusCode === 409,
  );
  assert.match(
    await readFile(join(root, "design-system/figma-export-review/index.html"), "utf8"),
    /Visual review meetings/,
  );

  const budgetRoot = await mkdtemp(join(tmpdir(), "sbfx-comments-budget-"));
  try {
    const budgetStore = createVisualCommentStore({
      cwd: budgetRoot,
      limits: { maxSessionAssetsBytes: pngBytes.length },
    });
    const budgetMeeting = (await budgetStore.startMeeting("Budget")).meeting.session.id;
    await budgetStore.createComment(budgetMeeting, request("budget-1"));
    const before = await budgetStore.getMeeting(budgetMeeting);
    await assert.rejects(
      () => budgetStore.createComment(budgetMeeting, request("budget-2", "new", differentPng)),
      (error) => error.statusCode === 413,
    );
    assert.equal((await budgetStore.getMeeting(budgetMeeting)).comments.length, before.comments.length);
    assert.equal(
      (await readdir(join(budgetRoot, "design-system/figma-export-review/sessions", budgetMeeting, "assets"))).length,
      1,
      "budget failure leaves no orphan asset",
    );
  } finally {
    await rm(budgetRoot, { recursive: true, force: true });
  }

  const staleRoot = await mkdtemp(join(tmpdir(), "sbfx-comments-stale-"));
  try {
    let failReports = true;
    const staleStore = createVisualCommentStore({
      cwd: staleRoot,
      reportRenderer: {
        index: () => {
          if (failReports) throw new Error("report failure");
          return "index repaired";
        },
        meeting: () => "meeting repaired",
      },
    });
    const staleStart = await staleStore.startMeeting("Stale report");
    assert.equal(staleStart.reportStale, true);
    failReports = false;
    const repaired = await staleStore.createComment(staleStart.meeting.session.id, request("repair-1"));
    assert.equal(repaired.reportStale, false);
    assert.equal(
      await readFile(join(staleRoot, "design-system/figma-export-review/index.html"), "utf8"),
      "index repaired",
    );
  } finally {
    await rm(staleRoot, { recursive: true, force: true });
  }

  const tempFiles = (await readdir(join(root, "design-system/figma-export-review"))).filter((file) => file.endsWith(".tmp"));
  assert.deepEqual(tempFiles, [], "atomic writes leave no temp files");
  console.log("visual comment store checks passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
