import {
  beginVisualCommentCapture,
  resolveVisualCommentTarget,
  type VisualCommentCaptureController,
  type VisualCommentKind,
  type VisualCommentPin,
} from "./visualComment";

export type FigmaReviewStatus =
  | "not-started"
  | "exported"
  | "imported"
  | "needs-fix"
  | "approved";

export type FigmaReviewEntry = {
  componentTitle?: string;
  figmaNodeUrl?: string;
  figmaReviewStatus: FigmaReviewStatus;
  name?: string;
  notes?: string;
  notesOpen?: boolean;
  storyTitle?: string;
  updatedAt?: string;
};

export type VisualCommentOverview = {
  activeSession: {
    id: string;
    title: string;
    startedAt: string;
    closedAt: string | null;
    captureCount: number;
    commentCount: number;
  } | null;
  activeProjectRelativeSessionPath?: string | null;
  activeReportUrl: string | null;
  activeTracking?: { open: number; total: number };
  comments: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
    kind?: VisualCommentKind;
    ordinal: number;
    pin?: VisualCommentPin;
    preview: {
      imageUrl: string;
      width: number;
      height: number;
      pin: VisualCommentPin;
    } | null;
    resolvedAt?: string | null;
    state?: { routeId?: string; stateId?: string };
  }>;
  recentSessions: Array<{
    id: string;
    title: string;
    startedAt: string;
    closedAt: string | null;
    captureCount: number;
    commentCount: number;
  }>;
  reportUrl: string;
};

export type VisualCommentMeeting = {
  captures: Record<
    string,
    {
      capturedAt: string;
      image: { mimeType: string; path: string };
      story: {
        id: string;
        name: string;
        prototypeId?: string;
        routeId?: string;
        stateId?: string;
        title: string;
        url?: string;
      };
      viewport: { devicePixelRatio: number; height: number; width: number };
    }
  >;
  comments: Array<{
    body: string;
    captureId: string;
    createdAt: string;
    id: string;
    kind?: VisualCommentKind;
    pin: VisualCommentPin;
    resolvedAt?: string | null;
  }>;
};

type FetchLike = typeof fetch;

export function createReviewStatusController({
  apiPath,
  fetcher = globalThis.fetch,
}: {
  apiPath: string;
  fetcher?: FetchLike;
}) {
  return {
    async load(storyId: string, signal?: AbortSignal) {
      const payload = await requestJson<{ entry?: Partial<FigmaReviewEntry> | null }>(
        fetcher,
        `${apiPath}?storyId=${encodeURIComponent(storyId)}`,
        { signal },
        `Review status GET ${apiPath}`,
      );
      return payload.entry ?? null;
    },
    async save(storyId: string, entry: FigmaReviewEntry) {
      return requestJson<{ entry?: Partial<FigmaReviewEntry> }>(
        fetcher,
        apiPath,
        {
          body: JSON.stringify({ entry, storyId }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        },
        `Review status PUT ${apiPath}`,
      );
    },
  };
}

export function createVisualCommentsController({
  apiPath,
  fetcher = globalThis.fetch,
}: {
  apiPath: string;
  fetcher?: FetchLike;
}) {
  return {
    beginCapture(
      options: Parameters<typeof beginVisualCommentCapture>[0],
    ): VisualCommentCaptureController {
      return beginVisualCommentCapture(options);
    },
    delete(path: string) {
      return requestJson<{ error?: string; reportStale?: boolean }>(
        fetcher,
        `${apiPath}${path}`,
        { method: "DELETE" },
        `Visual comments DELETE ${apiPath}${path}`,
      );
    },
    // Returns the active meeting, creating one with this title when none exists.
    // HTTP 409 means another browser started one first; that meeting is used.
    async ensureMeeting(title: string): Promise<string> {
      const operation = `Visual comments POST ${apiPath}/sessions`;
      const response = await fetcher(`${apiPath}/sessions`, {
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        activeMeeting?: { id?: string } | null;
        error?: string;
        meeting?: { session?: { id?: string } };
      };
      const createdId = response.ok ? payload.meeting?.session?.id : undefined;
      if (createdId) return createdId;
      const activeId = response.status === 409 ? payload.activeMeeting?.id : undefined;
      if (activeId) return activeId;
      throw new Error(
        `${operation} returned HTTP ${response.status}${payload.error ? `: ${payload.error}` : "."}`,
      );
    },
    // The whole meeting, including the captures of every Story.
    getMeeting(sessionId: string) {
      return requestJson<VisualCommentMeeting>(
        fetcher,
        `${apiPath}/sessions/${encodeURIComponent(sessionId)}`,
        undefined,
        `Visual comments GET ${apiPath}/sessions`,
      );
    },
    getOverview(storyId: string) {
      return requestJson<VisualCommentOverview>(
        fetcher,
        `${apiPath}?storyId=${encodeURIComponent(storyId)}`,
        undefined,
        `Visual comments GET ${apiPath}`,
      );
    },
    patch(path: string, body: unknown) {
      return requestJson<{ error?: string; reportStale?: boolean }>(
        fetcher,
        `${apiPath}${path}`,
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
        `Visual comments PATCH ${apiPath}${path}`,
      );
    },
    post(path: string, body?: unknown) {
      return requestJson<{ error?: string; reportStale?: boolean }>(
        fetcher,
        `${apiPath}${path}`,
        {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          method: "POST",
        },
        `Visual comments POST ${apiPath}${path}`,
      );
    },
    resolveTarget(selector?: string): HTMLElement | null {
      return resolveVisualCommentTarget(selector);
    },
  };
}

async function requestJson<T>(
  fetcher: FetchLike,
  url: string,
  init: RequestInit | undefined,
  operation: string,
): Promise<T> {
  const response = await fetcher(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      `${operation} returned HTTP ${response.status}${payload.error ? `: ${payload.error}` : "."}`,
    );
  }
  return payload;
}
