#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storybookCli = path.join(
  addonRoot,
  "node_modules",
  "storybook",
  "dist",
  "bin",
  "dispatcher.js",
);
const probeVueGap = process.argv.includes("--probe-vue-gap");
const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

if (!chrome) throw new Error("No Chrome/Chromium binary found.");

async function main() {
  const browser = await startBrowser(chrome);
  const cdp = await connectBrowser(browser);
  const sharedDataRoot = fs.mkdtempSync(path.join(
    process.env.TMPDIR || "/tmp",
    "sbfx-parity-data-",
  ));

  try {
    const results = {};
    for (const renderer of ["react", "vue"]) {
      results[renderer] = await runRendererContract(
        renderer,
        cdp,
        sharedDataRoot,
      );
    }

    assertContractPassed("react", results.react);
    if (probeVueGap) {
      const failedVueCases = results.vue.filter((entry) => !entry.passed);
      assert.ok(
        failedVueCases.length > 0,
        "Vue gap probe expected at least one renderer-specific failure",
      );
      console.log(
        `Vue gap probe detected ${failedVueCases.length} pending case(s): ${failedVueCases
          .map((entry) => entry.name)
          .join(", ")}`,
      );
    } else {
      assertContractPassed("vue", results.vue);
    }
  } finally {
    cdp.socket.close();
    await stopProcess(browser);
    fs.rmSync(sharedDataRoot, { recursive: true, force: true });
  }
}

function assertContractPassed(renderer, results) {
  const failed = results.filter((entry) => !entry.passed);
  assert.equal(
    failed.length,
    0,
    `${renderer} renderer parity failures: ${failed
      .map((entry) => `${entry.name} (${entry.detail})`)
      .join("; ")}`,
  );
  console.log(`${renderer} renderer parity baseline: ${results.length} cases passed`);
}

async function runRendererContract(renderer, cdp, sharedDataRoot) {
  const fixtureRoot = path.join(addonRoot, "test", "fixtures", renderer);
  fs.rmSync(path.join(fixtureRoot, ".data"), { recursive: true, force: true });
  const port = await getAvailablePort();
  const storybook = spawn(
    process.execPath,
    [
      storybookCli,
      "dev",
      "--ci",
      "--no-open",
      "--port",
      String(port),
      "--config-dir",
      path.join(fixtureRoot, ".storybook"),
    ],
    {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        SBFX_PARITY_DATA_DIR: sharedDataRoot,
        STORYBOOK_DISABLE_TELEMETRY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  storybook.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  storybook.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForUrl(`http://127.0.0.1:${port}/index.json`, storybook, () => serverOutput);
    const target = await openPage(
      cdp,
      `http://127.0.0.1:${port}/iframe.html?id=parity-fixture--default&viewMode=story&globals=figmaExport:on`,
    );
    try {
      await waitForPageReady(cdp, target.sessionId);
      const results = await evaluateContract(cdp, target.sessionId, renderer);
      results.push(
        ...(await evaluateKindContinuation(cdp, target.sessionId)),
      );
      return results;
    } finally {
      await cdp.send("Target.closeTarget", { targetId: target.targetId });
    }
  } finally {
    await stopProcess(storybook);
  }
}

async function evaluateContract(cdp, sessionId, renderer) {
  const evaluation = await cdp.send(
    "Runtime.evaluate",
    {
      expression: `Promise.resolve((async () => {
        const renderer = ${JSON.stringify(renderer)};
        const waitUntil = async (predicate, timeout = 15000) => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < timeout) {
            if (predicate()) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return false;
        };
        await waitUntil(() =>
          document.querySelector('[data-parity-story]') ||
          document.querySelector('[aria-label="Figma export review"]') ||
          document.querySelector('.sb-errordisplay'),
        );
        await new Promise((resolve) => setTimeout(resolve, 500));

        const text = document.body.textContent || '';
        const story = document.querySelector('[data-parity-story]');
        const review = document.querySelector('[aria-label="Figma export review"]');
        const exportWorkspace = document.querySelector('[aria-label="Figma export"]');
        const visualComments = document.querySelector('[aria-label="Visual comments"]');
        const reviewToggle = review?.querySelector(
          'button[aria-label*="export review panel"]',
        );
        reviewToggle?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const collapsedReview = document.querySelector(
          '[aria-label="Figma export review"]',
        );
        const collapsed = collapsedReview?.getAttribute('data-collapsed') === 'true';
        collapsedReview?.querySelector(
          'button[aria-label*="export review panel"]',
        )?.click();
        let overviewStatus = 0;
        let reportStatus = 0;
        let failureStatus = 0;
        let meetingStarted = false;
        let meetingJoined = false;
        let commentEdited = false;
        let commentDeleted = false;
        let trackingCommentDetail = 'not attempted';
        let trackingCommentCreated = false;
        let meetingEnded = false;
        let historyAvailable = false;
        let captureSurfaceComplete = false;
        let crossRendererDataAvailable = renderer === 'react';
        try {
          const overviewResponse = await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default');
          overviewStatus = overviewResponse.status;
          if (overviewResponse.ok) {
            const overview = await overviewResponse.json();
            if (overview.reportUrl) {
              reportStatus = (await fetch(overview.reportUrl)).status;
            }
            if (renderer === 'vue') {
              const reactMeeting = overview.recentSessions?.find(
                (entry) => entry.title === 'React parity meeting',
              );
              if (reactMeeting) {
                const reactReport = await fetch(
                  '/__sbfx_fixture_comments/reports/sessions/' +
                    encodeURIComponent(reactMeeting.id) +
                    '/index.html',
                );
                crossRendererDataAvailable =
                  reactReport.ok &&
                  (await reactReport.text()).includes('Shared react evidence');
              }
            }
          }
          failureStatus = (
            await fetch('/__sbfx_fixture_comments/not-a-valid-route')
          ).status;

          visualComments?.querySelector(
            'button[aria-label="Open comments"]',
          )?.click();
          await waitUntil(() => {
            const detail = document.querySelector(
              '[aria-label="Visual comments"] [data-comments-capability]',
            );
            return detail && !detail.hidden &&
              detail.getAttribute('data-comments-capability') === 'available';
          });

          [...document.querySelectorAll('button')].find(
            (entry) => entry.textContent?.trim() === 'Start a named meeting',
          )?.click();
          await waitUntil(() => document.querySelector('[aria-label="Meeting title"]'));
          const meetingTitle = document.querySelector(
            '[aria-label="Meeting title"]',
          );
          if (meetingTitle) {
            meetingTitle.value =
              renderer[0].toUpperCase() + renderer.slice(1) + ' parity meeting';
            meetingTitle.dispatchEvent(new Event('input', { bubbles: true }));
          }
          await waitUntil(() => {
            const button = [...document.querySelectorAll('button')].find(
              (entry) => entry.textContent?.trim() === 'Start meeting',
            );
            return button && !button.disabled;
          });
          [...document.querySelectorAll('button')].find(
            (entry) => entry.textContent?.trim() === 'Start meeting',
          )?.click();
          meetingStarted = await waitUntil(
            () =>
              document.querySelector('[aria-label="Visual comments"]')
                ?.textContent?.includes(
                  renderer[0].toUpperCase() +
                    renderer.slice(1) +
                    ' parity meeting',
                ),
          );

          const joinedA = await (
            await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
          ).json();
          const joinedB = await (
            await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
          ).json();
          const meetingId = joinedA.activeSession?.id;
          meetingJoined = Boolean(meetingId && meetingId === joinedB.activeSession?.id);

          if (meetingId) {
            const addCommentButton = [...document.querySelectorAll('button')].find(
              (entry) => entry.textContent?.trim() === 'Add comment',
            );
            addCommentButton?.click();
            const captureArmed = await waitUntil(
              () => document.documentElement.dataset.sbfxCaptureMode === 'true',
            );
            const action = document.querySelector('[data-parity-action]');
            const stateBeforeCapture = document.querySelector(
              '[data-parity-state]',
            )?.textContent;
            if (captureArmed && action) {
              const rect = action.getBoundingClientRect();
              const eventInit = {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width * 0.4,
                clientY: rect.top + rect.height * 0.6,
                pointerId: 1,
              };
              action.dispatchEvent(new PointerEvent('pointerdown', eventInit));
              action.dispatchEvent(new PointerEvent('pointerup', eventInit));
              action.dispatchEvent(new MouseEvent('click', eventInit));
            }
            const composerReady = await waitUntil(
              () => Boolean(document.querySelector('[data-comment-composer="true"]')),
            );
            const pendingPin = document.querySelector(
              '[data-pending-comment-pin="true"]',
            );
            const captureTargetRect = document
              .querySelector('#storybook-root')
              ?.getBoundingClientRect();
            const leftRatio = captureTargetRect
              ? (Number.parseFloat(pendingPin?.style.left ?? '') - captureTargetRect.left) /
                captureTargetRect.width
              : Number.NaN;
            const topRatio = captureTargetRect
              ? (Number.parseFloat(pendingPin?.style.top ?? '') - captureTargetRect.top) /
                captureTargetRect.height
              : Number.NaN;
            captureSurfaceComplete =
              composerReady &&
              stateBeforeCapture === 'State B' &&
              document.querySelector('[data-parity-state]')?.textContent === 'State B' &&
              Number.isFinite(leftRatio) &&
              leftRatio >= 0 &&
              leftRatio <= 1 &&
              Number.isFinite(topRatio) &&
              topRatio >= 0 &&
              topRatio <= 1 &&
              !document.querySelector('#storybook-root')?.contains(
                document.querySelector('[data-comment-composer="true"]'),
              ) &&
              !document.querySelector('[aria-label="Visual comments"]')?.contains(
                document.querySelector('[data-comment-composer="true"]'),
              ) &&
              !document.querySelector('#storybook-root')?.contains(pendingPin) &&
              Boolean(
                document
                  .querySelector('[aria-label="Visual comments"]')
                  ?.hasAttribute('data-sbfx-capture-ignore'),
              );
            document.querySelector('[data-comment-composer-cancel="true"]')?.click();
            await waitUntil(
              () => !document.querySelector('[data-comment-composer="true"]'),
            );

            // Tracking kind: chosen in the composer, stored, and labelled.
            const findButton = (label) =>
              [...document.querySelectorAll('button')].find(
                (entry) => entry.textContent?.trim() === label,
              );
            const kindControl = () =>
              document.querySelector('[data-comment-kind-select="true"]');
            findButton('Add comment')?.click();
            const trackingArmed = await waitUntil(
              () => document.documentElement.dataset.sbfxCaptureMode === 'true',
            );
            if (trackingArmed && action) {
              const rect = action.getBoundingClientRect();
              const eventInit = {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width * 0.4,
                clientY: rect.top + rect.height * 0.6,
                pointerId: 1,
              };
              action.dispatchEvent(new PointerEvent('pointerdown', eventInit));
              action.dispatchEvent(new PointerEvent('pointerup', eventInit));
              action.dispatchEvent(new MouseEvent('click', eventInit));
            }
            await waitUntil(() => Boolean(kindControl()));
            const defaultKind = kindControl()?.dataset.commentKindValue;
            const kindLabel = kindControl()?.getAttribute('aria-label');
            kindControl()
              ?.querySelector('button[data-comment-kind-option="tracking"]')
              ?.click();
            const trackingSelected = await waitUntil(
              () => kindControl()?.dataset.commentKindValue === 'tracking',
            );
            const trackingTextarea = document.querySelector(
              '.sbfx-review__composer textarea',
            );
            if (trackingTextarea) {
              trackingTextarea.value = 'Tracking parity comment';
              trackingTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await waitUntil(() => {
              const button = findButton('Save comment');
              return button && !button.disabled;
            });
            findButton('Save comment')?.click();
            const trackingArticle = () =>
              [...document.querySelectorAll('[data-comment-id]')].find((entry) =>
                entry.textContent?.includes('Tracking parity comment'),
              );
            const trackingLabelled = await waitUntil(
              () =>
                trackingArticle()
                  ?.querySelector('[data-comment-kind="tracking"]')
                  ?.textContent === 'Tracking',
            );
            const trackingStored = (
              await (
                await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
              ).json()
            ).comments?.find((entry) => entry.body === 'Tracking parity comment');
            trackingCommentCreated =
              defaultKind === 'visual-fix' &&
              kindLabel === 'Comment type' &&
              trackingSelected &&
              trackingLabelled &&
              trackingStored?.kind === 'tracking';
            trackingCommentDetail = [
              defaultKind,
              kindLabel,
              trackingSelected,
              trackingLabelled,
              trackingStored?.kind,
            ].join('/');
            if (trackingStored) {
              await fetch(
                '/__sbfx_fixture_comments/sessions/' +
                  encodeURIComponent(meetingId) +
                  '/comments/' +
                  encodeURIComponent(trackingStored.id),
                { method: 'DELETE' },
              );
              await waitUntil(() => !trackingArticle(), 7000);
            }

            const createResponse = await fetch(
              '/__sbfx_fixture_comments/sessions/' +
                encodeURIComponent(meetingId) +
                '/comments',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  clientRequestId: 'parity-comment-' + Date.now(),
                  authorName: 'Mina',
                  body: 'Parity comment',
                  story: {
                    id: 'parity-fixture--default',
                    title: 'Parity/Fixture',
                    name: 'Default',
                  },
                  pin: { xRatio: 0.25, yRatio: 0.75 },
                  viewport: {
                    width: 800,
                    height: 600,
                    devicePixelRatio: 1,
                    scrollX: 0,
                    scrollY: 0,
                  },
                  capture: {
                    dataUrl:
                      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    mimeType: 'image/png',
                    width: 1,
                    height: 1,
                    cssWidth: 800,
                    cssHeight: 600,
                  },
                }),
              },
            );
            const created = await createResponse.json();
            const commentId = created.comment?.id;
            await waitUntil(
              () => document.querySelector('[data-comment-id="' + commentId + '"]'),
              7000,
            );

            const article = document.querySelector(
              '[data-comment-id="' + commentId + '"]',
            );
            article?.querySelector('button[aria-label="Edit comment"]')?.click();
            await waitUntil(() => document.querySelector('[data-comment-edit-modal="true"]'));
            const editTextarea = document.querySelector(
              '[data-comment-edit-modal="true"] textarea',
            );
            if (editTextarea) {
              editTextarea.value = 'Updated parity comment';
              editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await waitUntil(() => {
              const button = document.querySelector('[data-comment-edit-save="true"]');
              return button && !button.disabled;
            });
            document.querySelector('[data-comment-edit-save="true"]')?.click();
            commentEdited = await waitUntil(
              () =>
                document.querySelector('[data-comment-id="' + commentId + '"]')
                  ?.textContent?.includes('Updated parity comment'),
            );

            document
              .querySelector('[data-comment-id="' + commentId + '"]')
              ?.querySelector('button[aria-label="Delete comment"]')
              ?.click();
            await waitUntil(() =>
              document.querySelector('[data-comment-delete-confirm="true"]'),
            );
            document.querySelector('[data-comment-delete-confirm="true"]')?.click();
            commentDeleted = await waitUntil(
              () => !document.querySelector('[data-comment-id="' + commentId + '"]'),
            );

            await fetch(
              '/__sbfx_fixture_comments/sessions/' +
                encodeURIComponent(meetingId) +
                '/comments',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  clientRequestId: 'shared-' + renderer + '-' + Date.now(),
                  authorName: 'Shared reviewer',
                  body: 'Shared ' + renderer + ' evidence',
                  story: {
                    id: 'parity-fixture--default',
                    title: 'Parity/Fixture',
                    name: 'Default',
                  },
                  pin: { xRatio: 0.4, yRatio: 0.6 },
                  viewport: {
                    width: 800,
                    height: 600,
                    devicePixelRatio: 1,
                    scrollX: 0,
                    scrollY: 0,
                  },
                  capture: {
                    dataUrl:
                      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    mimeType: 'image/png',
                    width: 1,
                    height: 1,
                    cssWidth: 800,
                    cssHeight: 600,
                  },
                }),
              },
            );
            [...document.querySelectorAll('button')].find(
              (entry) => entry.textContent?.trim() === 'End meeting',
            )?.click();
            meetingEnded = await waitUntil(() =>
              [...document.querySelectorAll('button')].some(
                (entry) => entry.textContent?.trim() === 'Start a named meeting',
              ),
            );
            historyAvailable = Boolean(
              document.querySelector(
                '[aria-label="Recent meetings"] [data-meeting-id="' +
                  meetingId +
                  '"] a[href*="/reports/sessions/"]',
              ),
            );
          }
        } catch {}

        return [
          {
            name: 'story-render-result',
            passed: Boolean(story),
            detail: story ? 'rendered' : text.slice(0, 180),
          },
          {
            name: 'export-workspace',
            passed: Boolean(exportWorkspace),
            detail: exportWorkspace ? 'available' : 'missing',
          },
          {
            name: 'review-workspace',
            passed: Boolean(review),
            detail: review ? 'available' : 'missing',
          },
          {
            name: 'review-workspace-outside-story',
            passed:
              Boolean(review) &&
              !document.querySelector('#storybook-root')?.contains(review) &&
              !document.querySelector('#storybook-root')?.contains(visualComments) &&
              Boolean(document.body.querySelector('[data-sbfx-review-host="true"]')),
            detail: 'body-mounted DOM host',
          },
          {
            name: 'review-workspace-collapse',
            passed: collapsed,
            detail: collapsed ? 'interaction passed' : 'collapse did not persist',
          },
          {
            name: 'visual-comments',
            passed: Boolean(visualComments),
            detail: visualComments?.textContent?.slice(0, 180) || 'comments missing',
          },
          {
            name: 'persistence-api',
            passed: overviewStatus === 200,
            detail: 'HTTP ' + overviewStatus,
          },
          {
            name: 'report-surface',
            passed: reportStatus === 200,
            detail: 'HTTP ' + reportStatus,
          },
          {
            name: 'source-action',
            passed: Boolean(review?.querySelector('a[href*="figma.com/design/"]')),
            detail: review?.querySelector('a')?.getAttribute('href') || 'link missing',
          },
          {
            name: 'failure-state-contract',
            passed: failureStatus === 404,
            detail: 'HTTP ' + failureStatus,
          },
          {
            name: 'meeting-start-and-join',
            passed: meetingStarted && meetingJoined,
            detail: meetingStarted + '/' + meetingJoined,
          },
          {
            name: 'cross-renderer-persisted-data',
            passed: crossRendererDataAvailable,
            detail: crossRendererDataAvailable
              ? 'shared meeting, comment evidence, and report passed'
              : 'Vue could not read React-created review data',
          },
          {
            name: 'pre-action-capture-and-pin',
            passed: captureSurfaceComplete,
            detail: captureSurfaceComplete
              ? 'pre-action state, composer, portal, and normalized pin passed'
              : 'capture surface contract failed',
          },
          {
            name: 'tracking-comment-kind',
            passed: trackingCommentCreated,
            detail: trackingCommentDetail,
          },
          {
            name: 'comment-edit-and-delete',
            passed: commentEdited && commentDeleted,
            detail: commentEdited + '/' + commentDeleted,
          },
          {
            name: 'meeting-end-and-history',
            passed: meetingEnded && historyAvailable,
            detail: meetingEnded + '/' + historyAvailable,
          },
        ];
      })())`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.text ?? "Renderer contract evaluation failed");
  }
  return evaluation.result.value;
}

// Comment kind continuation across real page reloads. A dev server reloads the
// preview when comment evidence is written inside the project; the fixtures keep
// their data outside the watched tree, so the reload is issued here instead.
const kindContinuationHelpers = `
  const waitUntil = async (predicate, timeout = 15000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };
  const findButton = (label) =>
    [...document.querySelectorAll('button')].find(
      (entry) => entry.textContent?.trim() === label,
    );
  const panel = () => document.querySelector('[aria-label="Visual comments"]');
  const openPanel = async () => {
    await waitUntil(() => Boolean(panel()));
    panel()?.querySelector('button[aria-label="Open comments"]')?.click();
    return waitUntil(() => {
      const detail = document.querySelector(
        '[aria-label="Visual comments"] [data-comments-capability]',
      );
      return detail && !detail.hidden &&
        detail.getAttribute('data-comments-capability') === 'available';
    });
  };
  const kindControl = () =>
    document.querySelector('[data-comment-kind-select="true"]');
  const openComposer = async () => {
    await waitUntil(() => findButton('Add comment') && !findButton('Add comment').disabled);
    findButton('Add comment')?.click();
    await waitUntil(() => document.documentElement.dataset.sbfxCaptureMode === 'true');
    const action = document.querySelector('[data-parity-action]');
    const rect = action.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width * 0.4,
      clientY: rect.top + rect.height * 0.6,
      pointerId: 1,
    };
    action.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    action.dispatchEvent(new PointerEvent('pointerup', eventInit));
    action.dispatchEvent(new MouseEvent('click', eventInit));
    return waitUntil(() => Boolean(kindControl()));
  };
  const closeComposer = async () => {
    document.querySelector('[data-comment-composer-cancel="true"]')?.click();
    await waitUntil(() => !document.querySelector('[data-comment-composer="true"]'));
  };
  const clickStoryAction = () => {
    const action = document.querySelector('[data-parity-action]');
    const rect = action.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width * 0.4,
      clientY: rect.top + rect.height * 0.6,
      pointerId: 1,
    };
    action.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    action.dispatchEvent(new PointerEvent('pointerup', eventInit));
    action.dispatchEvent(new MouseEvent('click', eventInit));
  };
  // The four comment surface visual rules, read from computed styles.
  const auditSurfaces = (selector) => {
    const alpha = (color) => {
      if (color === 'transparent') return 0;
      const modern = color.match(/\\/\\s*([\\d.]+%?)\\s*\\)$/);
      if (modern) {
        const value = Number.parseFloat(modern[1]);
        return modern[1].endsWith('%') ? value / 100 : value;
      }
      const legacy = color.match(/^rgba\\(([^)]+)\\)$/);
      return legacy ? Number.parseFloat(legacy[1].split(',')[3] ?? '1') : 1;
    };
    const translucent = (color) => alpha(color) > 0 && alpha(color) < 1;
    const violations = [];
    let audited = 0;
    for (const surface of document.querySelectorAll(selector)) {
      for (const element of [surface, ...surface.querySelectorAll('*')]) {
        if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) continue;
        audited += 1;
        const style = getComputedStyle(element);
        const listItem = element.closest('.sbfx-comments-panel__comment');
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        const hasBorder = sides.some(
          (side) => Number.parseFloat(style['border' + side + 'Width']) > 0,
        );
        const hasText =
          element.matches('input, textarea, select') ||
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
        const name = element.tagName.toLowerCase() + '.' + String(element.className).split(' ')[0];
        if (hasText && Number.parseFloat(style.fontSize) < 12) {
          violations.push(name + ' font-size ' + style.fontSize);
        }
        if (translucent(style.backgroundColor)) violations.push(name + ' background ' + style.backgroundColor);
        for (const side of sides) {
          if (
            Number.parseFloat(style['border' + side + 'Width']) > 0 &&
            translucent(style['border' + side + 'Color'])
          ) {
            violations.push(name + ' border ' + style['border' + side + 'Color']);
          }
        }
        if (style.backgroundImage.includes('gradient')) violations.push(name + ' gradient');
        if (style.backdropFilter && style.backdropFilter !== 'none') violations.push(name + ' backdrop-filter');
        if (element === listItem && hasBorder) violations.push(name + ' list item border');
        if (listItem && element !== listItem && (hasBorder || alpha(style.backgroundColor) > 0)) {
          violations.push(name + ' nested border or fill');
        }
      }
    }
    return { audited, violations: [...new Set(violations)].slice(0, 10) };
  };
  const kindEntry = () => sessionStorage.getItem('sbfx:visual-comments-kind');
  const readComposerKind = async () => {
    await openPanel();
    const opened = await openComposer();
    const kind = opened ? kindControl()?.dataset.commentKindValue : 'composer missing';
    const entryAfterMount = kindEntry();
    await closeComposer();
    return { kind, entryAfterMount };
  };
`;

async function evaluateKindContinuation(cdp, sessionId) {
  const run = async (body) => {
    const evaluation = await cdp.send(
      "Runtime.evaluate",
      {
        expression: `Promise.resolve((async () => { ${kindContinuationHelpers} ${body} })())`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (evaluation.exceptionDetails) {
      throw new Error(
        evaluation.exceptionDetails.exception?.description ??
          evaluation.exceptionDetails.text ??
          "Kind continuation evaluation failed",
      );
    }
    return evaluation.result.value;
  };
  const reload = async () => {
    await run(`window.__sbfxBeforeReload = true;`);
    await cdp.send("Page.reload", {}, sessionId);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        if (
          await run(
            `return document.readyState === 'complete' && window.__sbfxBeforeReload !== true;`,
          )
        ) {
          return;
        }
      } catch {
        // The execution context is replaced while the page navigates.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Storybook iframe did not reload");
  };

  let saved = { saved: false, detail: "not attempted" };
  let afterRequestReload = { kind: "not attempted" };
  let afterSecondReload = { kind: "not attempted" };
  let unexpired = { kind: "not attempted" };
  const unusable = [];
  try {
    saved = await run(`
      // Direct commenting: no meeting is active, the panel is collapsed, and the
      // comment is started and saved from the keyboard.
      await waitUntil(() => Boolean(panel()));
      if (panel()?.dataset.expanded === 'true') {
        panel().querySelector('.sbfx-comments-panel__toggle')?.click();
        await waitUntil(() => panel()?.dataset.expanded === 'false');
      }
      const before = await (
        await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
      ).json();
      const shortcut = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'c' });
      document.body.dispatchEvent(shortcut);
      const armed = await waitUntil(
        () => document.documentElement.dataset.sbfxCaptureMode === 'true',
      );
      const promptOnStory =
        Boolean(document.querySelector('[data-capture-prompt="true"]')) &&
        !panel()?.contains(document.querySelector('[data-capture-prompt="true"]'));
      const stateBefore = document.querySelector('[data-parity-state]')?.textContent;
      clickStoryAction();
      const opened = await waitUntil(() => Boolean(kindControl()));
      const composerElement = document.querySelector('[data-comment-composer="true"]');
      const composerOutsidePanel =
        Boolean(composerElement) &&
        !panel()?.contains(composerElement) &&
        !document.querySelector('#storybook-root')?.contains(composerElement) &&
        !composerElement.querySelector('img, input');
      const defaultKind = kindControl()?.dataset.commentKindValue;
      kindControl()?.querySelector('button[data-comment-kind-option="tracking"]')?.click();
      await waitUntil(() => kindControl()?.dataset.commentKindValue === 'tracking');
      const textarea = document.querySelector('.sbfx-review__composer textarea');
      const bodyFocused = document.activeElement === textarea;
      if (textarea) {
        textarea.value = 'Kind continuation comment';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await waitUntil(() => findButton('Save comment') && !findButton('Save comment').disabled);
      const composerAudit = auditSurfaces('[data-comment-composer="true"], [data-pending-comment-pin="true"]');
      textarea?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'Enter' }),
      );
      await waitUntil(() => !document.querySelector('[data-comment-composer="true"]'));
      await openPanel();
      const stored = await waitUntil(() =>
        [...document.querySelectorAll('[data-comment-id]')].some((entry) =>
          entry.textContent?.includes('Kind continuation comment'),
        ),
      );
      const after = await (
        await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
      ).json();
      const today = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const notesTitle =
        'Notes ' + today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
      const panelAudit = auditSurfaces('[aria-label="Visual comments"]');
      // Saved pins on the Story and the panel handoff.
      const pinSelector = '[data-saved-comment-pin]';
      await waitUntil(() => document.querySelectorAll(pinSelector).length === 1);
      const savedPin = document.querySelector(pinSelector);
      const pinLabel = savedPin?.getAttribute('aria-label');
      const pinOnStoryLayer =
        Boolean(savedPin) &&
        savedPin.hasAttribute('data-sbfx-capture-ignore') &&
        !document.querySelector('#storybook-root')?.contains(savedPin) &&
        !panel()?.contains(savedPin);
      const pinAudit = auditSurfaces(pinSelector);
      savedPin?.click();
      const pinSelectsItem = await waitUntil(() =>
        Boolean(document.querySelector('[data-comment-id][aria-current="true"]')) &&
          document.querySelectorAll(pinSelector + '[data-selected="true"]').length === 1,
      );
      const stateAfterPinClick = document.querySelector('[data-parity-state]')?.textContent;
      const clipboardWrites = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { clipboardWrites.push(text); } },
      });
      document.querySelector('[data-panel-tracking-copy="story"]')?.click();
      await waitUntil(() => clipboardWrites.length === 1);
      const copyMessage = document.querySelector('[data-panel-tracking-status]')?.textContent;
      panel()?.querySelector('.sbfx-comments-panel__toggle')?.click();
      const pinsHiddenWhenCollapsed = await waitUntil(
        () => document.querySelectorAll(pinSelector).length === 0,
      );
      await openPanel();
      const pinsBackWhenExpanded = await waitUntil(
        () => document.querySelectorAll(pinSelector).length === 1,
      );
      return {
        overview: {
          copied: clipboardWrites[0] ?? '',
          copyAllOffered: Boolean(document.querySelector('[data-panel-tracking-copy="all"]')),
          copyMessage,
          pinAudit,
          pinLabel,
          pinOnStoryLayer,
          pinSelectsItem,
          pinsBackWhenExpanded,
          pinsHiddenWhenCollapsed,
          stateAfterPinClick,
        },
        saved: opened && stored,
        direct: {
          armed,
          bodyFocused,
          composerOutsidePanel,
          meetingBefore: before.activeSession?.title ?? null,
          meetingAfter: after.activeSession?.title ?? null,
          notesTitle,
          promptOnStory,
          shortcutPrevented: shortcut.defaultPrevented,
          stateKept:
            stateBefore === 'State B' &&
            document.querySelector('[data-parity-state]')?.textContent === 'State B',
          storedKind: after.comments?.find((entry) => entry.body === 'Kind continuation comment')?.kind,
        },
        audit: { composer: composerAudit, panel: panelAudit },
        detail: [opened, defaultKind, stored, kindEntry()].join('/'),
        persisted: Object.keys(localStorage).filter(
          (key) => /kind/i.test(key) || /tracking|visual-fix/.test(localStorage.getItem(key) ?? ''),
        ),
      };
    `);
    await reload();
    afterRequestReload = await run(`return readComposerKind();`);
    await reload();
    afterSecondReload = await run(`return readComposerKind();`);
    // Entries are written in the page so their expiry is relative to its clock.
    for (const [label, entryExpression] of [
      ["expired 1 ms ago", `JSON.stringify({ kind: 'tracking', expiresAt: Date.now() - 1 })`],
      ["unknown kind", `JSON.stringify({ kind: 'analytics', expiresAt: Date.now() + 10000 })`],
      ["not JSON", `'tracking'`],
    ]) {
      await run(
        `sessionStorage.setItem('sbfx:visual-comments-kind', ${entryExpression});`,
      );
      await reload();
      unusable.push({ label, ...(await run(`return readComposerKind();`)) });
    }
    await run(
      `sessionStorage.setItem('sbfx:visual-comments-kind', JSON.stringify({ kind: 'tracking', expiresAt: Date.now() + 10000 }));`,
    );
    await reload();
    unexpired = await run(`return readComposerKind();`);
  } finally {
    // The next renderer starts its own meeting, so none may stay active.
    await run(`
      const overview = await (
        await fetch('/__sbfx_fixture_comments?storyId=parity-fixture--default')
      ).json();
      if (overview.activeSession?.id) {
        await fetch(
          '/__sbfx_fixture_comments/sessions/' +
            encodeURIComponent(overview.activeSession.id) +
            '/close',
          { method: 'POST' },
        );
      }
    `).catch(() => undefined);
  }

  const direct = saved.direct ?? {};
  const audit = saved.audit ?? {};
  const overview = saved.overview ?? {};
  return [
    {
      name: "saved-pins-and-panel-handoff",
      passed:
        overview.pinLabel === "Comment 1, Tracking, Open" &&
        overview.pinOnStoryLayer === true &&
        overview.pinSelectsItem === true &&
        overview.stateAfterPinClick === "State B" &&
        overview.pinsHiddenWhenCollapsed === true &&
        overview.pinsBackWhenExpanded === true &&
        overview.pinAudit?.violations.length === 0 &&
        overview.copyAllOffered === false &&
        overview.copyMessage === "Tracking prompt copied. Comments included: 1." &&
        overview.copied.startsWith("# Tracking Instrumentation Request\n") &&
        overview.copied.includes("### Comment 1") &&
        overview.copied.includes('"Kind continuation comment"') &&
        /- Project-relative screenshot path: (?:unavailable|\S+\/assets\/[a-f0-9]{64}\.(?:png|webp))/.test(
          overview.copied,
        ),
      detail: JSON.stringify({ ...overview, copied: overview.copied?.slice(0, 80) }),
    },
    {
      name: "direct-comment-shortcut-flow",
      passed:
        direct.meetingBefore === null &&
        direct.shortcutPrevented === true &&
        direct.armed === true &&
        direct.promptOnStory === true &&
        direct.composerOutsidePanel === true &&
        direct.bodyFocused === true &&
        direct.stateKept === true &&
        direct.storedKind === "tracking" &&
        direct.meetingAfter === direct.notesTitle,
      detail: JSON.stringify(direct),
    },
    {
      name: "comment-surface-style-audit",
      passed:
        audit.composer?.audited > 0 &&
        audit.composer.violations.length === 0 &&
        audit.panel?.audited > 0 &&
        audit.panel.violations.length === 0,
      detail: JSON.stringify(audit),
    },
    {
      name: "tracking-kind-survives-request-reload",
      passed:
        saved.saved &&
        saved.persisted?.length === 0 &&
        afterRequestReload.kind === "tracking" &&
        afterRequestReload.entryAfterMount === null,
      detail: JSON.stringify({ saved, afterRequestReload }),
    },
    {
      name: "kind-continuation-consumed-once",
      passed:
        afterSecondReload.kind === "visual-fix" &&
        afterSecondReload.entryAfterMount === null,
      detail: JSON.stringify(afterSecondReload),
    },
    {
      name: "unexpired-kind-continuation-preselects",
      passed: unexpired.kind === "tracking" && unexpired.entryAfterMount === null,
      detail: JSON.stringify(unexpired),
    },
    {
      name: "unusable-kind-continuation-ignored",
      passed:
        unusable.length === 3 &&
        unusable.every(
          (entry) => entry.kind === "visual-fix" && entry.entryAfterMount === null,
        ),
      detail: JSON.stringify(unusable),
    },
  ];
}

async function startBrowser(binary) {
  const profileDir = fs.mkdtempSync(path.join(
    process.env.TMPDIR || "/tmp",
    "sbfx-parity-chrome-",
  ));
  const processHandle = spawn(
    binary,
    [
      "--headless=new",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  processHandle.profileDir = profileDir;
  return processHandle;
}

async function connectBrowser(processHandle) {
  const webSocketUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(
      () => reject(new Error(`Chrome CDP did not start.\n${stderr}`)),
      15_000,
    );
    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    processHandle.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before CDP was ready (${code}).\n${stderr}`));
    });
  });
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpClient(socket);
}

class CdpClient {
  id = 0;
  pending = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }));
    });
  }
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    flatten: true,
    targetId,
  });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url }, sessionId);
  return { targetId, sessionId };
}

async function waitForPageReady(cdp, sessionId) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await cdp.send(
      "Runtime.evaluate",
      {
        expression: "document.readyState",
        returnByValue: true,
      },
      sessionId,
    );
    if (result.result?.value === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Storybook iframe did not finish loading");
}

async function waitForUrl(url, processHandle, getOutput) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Storybook exited before ready:\n${getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Storybook did not become ready:\n${getOutput()}`);
}

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode === null) {
    processHandle.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => processHandle.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  if (processHandle.profileDir) {
    fs.rmSync(processHandle.profileDir, { recursive: true, force: true });
  }
}

await main();
