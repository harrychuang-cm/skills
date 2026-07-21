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
  assert.equal(overview.comments[0].resolvedAt ?? null, null, "legacy comments default to Open");
  assert.equal(overview.activeSession.captureCount, 2);
  assert.equal(overview.activeSession.commentCount, 2);
  assert.deepEqual(overview.recentSessions, [], "active meeting is not duplicated in closed history");

  const immutableCommentFields = {
    authorName: first.comment.authorName,
    body: first.comment.body,
    captureId: first.comment.captureId,
    createdAt: first.comment.createdAt,
    pin: first.comment.pin,
  };
  const completed = await restarted.resolveComment(meetingId, first.comment.id, true);
  assert.ok(completed.comment.resolvedAt, "Complete stores a server timestamp");
  assert.deepEqual(
    {
      authorName: completed.comment.authorName,
      body: completed.comment.body,
      captureId: completed.comment.captureId,
      createdAt: completed.comment.createdAt,
      pin: completed.comment.pin,
    },
    immutableCommentFields,
    "resolving does not rewrite immutable comment content",
  );
  const repeatedComplete = await restarted.resolveComment(meetingId, first.comment.id, true);
  assert.equal(
    repeatedComplete.comment.resolvedAt,
    completed.comment.resolvedAt,
    "repeated Complete preserves the original timestamp",
  );
  const reopened = await restarted.resolveComment(meetingId, first.comment.id, false);
  assert.equal(reopened.comment.resolvedAt ?? null, null, "Reopen clears resolved state");
  await assert.rejects(
    () => restarted.resolveComment(meetingId, "missing-comment", true),
    (error) => error.code === "NOT_FOUND" && error.statusCode === 404,
  );
  await assert.rejects(
    () => restarted.deleteComment(meetingId, "missing-comment"),
    (error) => error.code === "NOT_FOUND" && error.statusCode === 404,
  );

  const canonical = await readFile(
    join(root, "design-system/figma-export-review/sessions", meetingId, "meeting.json"),
    "utf8",
  );
  assert.doesNotMatch(canonical, /data:image/);
  assert.match(canonical, /assets\/[a-f0-9]{64}\.png/);
  const generatedReport = await readFile(
    join(root, "design-system/figma-export-review/sessions", meetingId, "index.html"),
    "utf8",
  );
  assert.match(
    generatedReport,
    new RegExp(`"projectRelativePath":"design-system/figma-export-review/sessions/${meetingId}/assets/[a-f0-9]{64}\\.png"`),
    "default report receives a repository-root-relative screenshot path",
  );
  assert.doesNotMatch(generatedReport, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
  const closedComplete = await restarted.resolveComment(meetingId, first.comment.id, true);
  assert.ok(closedComplete.comment.resolvedAt, "closed meeting comments remain maintainable");
  assert.ok(closedComplete.meeting.session.closedAt, "resolving does not reopen the meeting");

  const secondCaptureId = second.comment.captureId;
  const secondAssetPath = (await restarted.getMeeting(meetingId)).captures[secondCaptureId].image.path;
  const deleted = await restarted.deleteComment(meetingId, second.comment.id);
  assert.equal(deleted.deletedCommentId, second.comment.id);
  assert.equal(deleted.deletedCaptureId, secondCaptureId);
  assert.equal(deleted.deletedAssetPath, null, "shared image asset is not reported as deleted");
  const afterDelete = await restarted.getMeeting(meetingId);
  assert.equal(afterDelete.comments.length, 1, "Delete removes only one comment");
  assert.equal(Object.keys(afterDelete.captures).length, 1, "Delete removes its unreferenced capture record");
  assert.equal(afterDelete.captures[secondCaptureId], undefined, "the deleted comment's capture is removed");
  assert.ok(
    (await readFile(join(root, "design-system/figma-export-review/sessions", meetingId, secondAssetPath))).length > 0,
    "Delete preserves an image asset still referenced by another capture",
  );
  const nextMeeting = await restarted.startMeeting("Next review");
  const historyOverview = await restarted.getOverview();
  assert.equal(historyOverview.activeSession.id, nextMeeting.meeting.session.id);
  assert.equal(historyOverview.activeSession.captureCount, 0);
  assert.equal(historyOverview.activeSession.commentCount, 0);
  assert.equal(historyOverview.recentSessions[0].id, meetingId);
  assert.equal(historyOverview.recentSessions[0].captureCount, 1);
  assert.equal(historyOverview.recentSessions[0].commentCount, 1);
  assert.ok(historyOverview.recentSessions[0].closedAt);
  assert.equal((await restarted.getMeeting(meetingId)).version, 1, "existing storage schema remains version 1");
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

  const externalProjectRoot = await mkdtemp(join(tmpdir(), "sbfx-comments-project-"));
  const externalCommentsRoot = await mkdtemp(join(tmpdir(), "sbfx-comments-external-"));
  try {
    const externalStore = createVisualCommentStore({
      cwd: externalProjectRoot,
      commentsDir: externalCommentsRoot,
    });
    const externalMeeting = (await externalStore.startMeeting("External evidence")).meeting.session.id;
    await externalStore.createComment(externalMeeting, request("external-1"));
    const externalReport = await readFile(
      join(externalCommentsRoot, "sessions", externalMeeting, "index.html"),
      "utf8",
    );
    assert.match(
      externalReport,
      /"projectRelativePath":null/,
      "reports outside the project mark the project-relative path unavailable",
    );
    assert.doesNotMatch(
      externalReport,
      new RegExp(externalCommentsRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "external absolute host paths are not embedded in reports",
    );
    assert.equal((await externalStore.getMeeting(externalMeeting)).version, 1);
  } finally {
    await rm(externalProjectRoot, { recursive: true, force: true });
    await rm(externalCommentsRoot, { recursive: true, force: true });
  }

  const tempFiles = (await readdir(join(root, "design-system/figma-export-review"))).filter((file) => file.endsWith(".tmp"));
  assert.deepEqual(tempFiles, [], "atomic writes leave no temp files");
  console.log("visual comment store checks passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
