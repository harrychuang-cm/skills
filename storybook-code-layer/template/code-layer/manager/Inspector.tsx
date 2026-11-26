// The inspector: a floating panel over the Storybook canvas, modelled on the
// properties panel of a design tool. It is mounted by a canvas wrapper (so it
// lives and dies with the canvas and has the manager theme) and rendered into
// the manager document's body, where nothing clips it. It never touches
// Storybook's own layout.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGlobals } from "storybook/manager-api";

import { t } from "../shared/i18n";
import { sectionLabel, suspendText } from "../shared/labels";
import { SECTIONS } from "../shared/properties";
import { GLOBAL_KEY, type ElementTrace, type IndexJson, type LayoutPayload } from "../shared/protocol";
import { buildReference } from "../shared/reference";
import { highlight, selectDescriptor } from "./actions";
import { closeAgentDialog, fetchAgentStatus, openAgentDialog } from "./agent";
import { fetchState } from "./api";
import { applyDrafts } from "./apply";
import { isManagerFramed } from "./channel";
import { AgentDialog, agentUnavailable } from "./components/AgentDialog";
import { AgentRunReport } from "./components/AgentRunReport";
import { ChangesBar } from "./components/ChangesBar";
import { Field, hasSource } from "./components/Field";
import { Notices } from "./components/Notices";
import { Report } from "./components/Report";
import { RowPopover } from "./components/RowPopover";
import { rowKey } from "./drafts";
import { CheckIcon, ChevronIcon, CodeIcon, CopyIcon, GripIcon, SparkleIcon } from "./icons";
import { DEFAULT_INSPECTOR_PREFS, loadInspectorPrefs, saveInspectorPrefs, type InspectorPrefs } from "./persist";
import { store, useLocale, useStore } from "./store";
import { Body, Crumb, Crumbs, DevLine, Grip, Guide, HEADER_HEIGHT, HeaderBar, IconButton, Key, Message, Meta, MoreButton, Nav, POP_WIDTH, Pop, Root, Section, SectionHead, TitleText, WIDTH } from "./styles";

const MARGIN = 8;
const STATE_REFRESH_MS = 3000;

type Box = { left: number; top: number; right: number; bottom: number };

function readCanvas(): Box | null {
  const element = document.getElementById("storybook-preview-wrapper") ?? document.getElementById("storybook-preview-iframe");
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

const sameBox = (a: Box | null, b: Box | null) => a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

/** The canvas area on screen, kept up to date while it resizes or moves. */
function useCanvas(): Box | null {
  const [box, setBox] = useState<Box | null>(() => readCanvas());
  useEffect(() => {
    const update = () => setBox((previous) => {
      const next = readCanvas();
      return sameBox(previous, next) ? previous : next;
    });
    update();
    window.addEventListener("resize", update);
    const element = document.getElementById("storybook-preview-wrapper");
    const observer = typeof ResizeObserver === "function" && element ? new ResizeObserver(update) : null;
    if (observer && element) observer.observe(element);
    // The canvas also moves without resizing (a sidebar being dragged): a cheap poll covers that.
    const timer = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
      window.clearInterval(timer);
    };
  }, []);
  return box;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(Math.max(low, high), value));

/** Where the inspector is on screen: the remembered offsets, brought back inside the canvas. */
function place(prefs: InspectorPrefs, canvas: Box): { left: number; top: number; maxHeight: number } {
  const left = clamp(canvas.right - prefs.right - WIDTH, canvas.left + MARGIN, canvas.right - WIDTH - MARGIN);
  const top = clamp(canvas.top + prefs.top, canvas.top + MARGIN, canvas.bottom - HEADER_HEIGHT - MARGIN);
  return { left, top, maxHeight: Math.max(HEADER_HEIGHT, canvas.bottom - top - MARGIN) };
}

/**
 * Until the person has dragged the inspector, it sits at the top corner that
 * covers the least of the story's components: right when both are clear.
 * Returns the offset from the canvas's right edge.
 */
function clearSide(canvas: Box, layout: LayoutPayload | null): number {
  const atRight = DEFAULT_INSPECTOR_PREFS.right;
  const atLeft = Math.max(atRight, canvas.right - canvas.left - WIDTH - DEFAULT_INSPECTOR_PREFS.right);
  const frame = document.getElementById("storybook-preview-iframe")?.getBoundingClientRect();
  if (!layout || !frame || layout.viewport[0] <= 0 || layout.obstacles.length === 0) return atRight;
  const scale = frame.width / layout.viewport[0];
  const top = canvas.top + DEFAULT_INSPECTOR_PREFS.top;
  const bottom = Math.min(canvas.bottom - MARGIN, top + 440);
  const covered = (right: number) => {
    const left = canvas.right - right - WIDTH;
    let area = 0;
    for (const [x, y, w, h] of layout.obstacles) {
      const ox = frame.left + x * scale;
      const oy = frame.top + y * scale;
      const overlapX = Math.min(left + WIDTH, ox + w * scale) - Math.max(left, ox);
      const overlapY = Math.min(bottom, oy + h * scale) - Math.max(top, oy);
      if (overlapX > 0 && overlapY > 0) area += overlapX * overlapY;
    }
    return area;
  };
  return covered(atLeft) < covered(atRight) ? atLeft : atRight;
}

/** The canvas wrapper Storybook renders around the preview: the canvas itself, plus the inspector while the tool is on. */
export function CanvasInspector({ children }: { children?: React.ReactNode }) {
  const [globals] = useGlobals();
  const on = globals[GLOBAL_KEY] === true && !isManagerFramed();
  useEffect(() => {
    store.set({ inspectorHosted: true });
    return () => store.set({ inspectorHosted: false });
  }, []);
  return (
    <>
      {children}
      {on ? createPortal(<Inspector />, document.body) : null}
    </>
  );
}

/**
 * The same inspector, hosted by the toolbar toggle when the canvas wrapper is
 * not in the tree (a Storybook that does not apply wrappers registered by
 * addons). Renders nothing while the wrapper hosts it.
 */
export function FallbackInspector({ on }: { on: boolean }) {
  const hosted = useStore((s) => s.inspectorHosted);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 800);
    return () => window.clearTimeout(timer);
  }, []);
  return on && waited && !hosted && !isManagerFramed() ? createPortal(<Inspector />, document.body) : null;
}

function Inspector() {
  useLocale();
  const canvas = useCanvas();
  const projectId = useStore((s) => s.session?.projectId ?? null);
  const booted = useStore((s) => s.booted);
  const status = useStore((s) => s.status);
  const trace = useStore((s) => s.selection);
  const index = useStore((s) => s.index);
  const indexError = useStore((s) => s.indexError);
  const openKey = useStore((s) => s.openRow);
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.applyState.phase);
  const drifting = useStore((s) => (s.server?.mirrors ?? []).some((mirror) => !mirror.inSync));
  const layout = useStore((s) => s.layout);
  const agentDialog = useStore((s) => s.agent.dialog);
  const agentStatus = useStore((s) => s.agent.status);
  const agentBusy = useStore((s) => Boolean(s.agent.run && !s.agent.run.final));
  const [prefs, setPrefs] = useState<InspectorPrefs>(DEFAULT_INSPECTOR_PREFS);
  const [dragging, setDragging] = useState(false);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [pop, setPop] = useState<{ top: number; side: "left" | "right"; maxHeight: number } | null>(null);
  const [tick, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; right: number; top: number } | null>(null);
  const placedFor = useRef<{ anchor: string; top: number } | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Before the first paint with a project: the inspector never shows in the default place and then jumps to its own.
  useLayoutEffect(() => {
    if (projectId) setPrefs(loadInspectorPrefs(projectId));
  }, [projectId]);
  const update = useCallback(
    (patch: Partial<InspectorPrefs>, persist = true) => {
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      if (persist && projectId) saveInspectorPrefs(projectId, next);
    },
    [projectId],
  );

  // Mirrors, pending documents and drift can change outside the page: ask the server again every few seconds.
  useEffect(() => {
    void fetchState();
    void fetchAgentStatus();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchState();
      void fetchAgentStatus();
    }, STATE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // A row's popover and the AI dialog open in the same place: opening a row closes the dialog.
  useEffect(() => {
    if (openKey && agentDialog) closeAgentDialog();
  }, [openKey]);

  // A click elsewhere in the manager closes the popover (clicks in the preview select, which closes it too).
  useEffect(() => {
    if (!openKey) return undefined;
    const onDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) store.set({ openRow: null });
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openKey]);

  const effective = status?.effective;
  const active = effective?.state === "active";
  const readOnly = Boolean(status?.serverReadOnly);
  const openRow = trace && openKey ? trace.rows.find((row) => rowKey(trace, row) === openKey) ?? null : null;
  const showAgent = agentDialog && Boolean(trace) && Boolean(index) && active;
  const popKey = showAgent ? "agent" : openRow ? openKey : null;
  const position = canvas ? place(prefs.placed ? prefs : { ...prefs, right: clearSide(canvas, layout) }, canvas) : null;

  // Put the popover beside the inspector, level with its row (the AI dialog: with the top of the body), and keep it inside the canvas.
  useLayoutEffect(() => {
    if (!popKey || !canvas || !root.current || prefs.collapsed) {
      placedFor.current = null;
      setPop(null);
      return;
    }
    const rootRect = root.current.getBoundingClientRect();
    const rowElement = showAgent ? null : root.current.querySelector<HTMLElement>('[data-code-layer-row][data-open="true"]');
    const rowTop = rowElement ? rowElement.getBoundingClientRect().top : rootRect.top + HEADER_HEIGHT;
    const height = popover.current?.offsetHeight ?? 0;
    const maxHeight = Math.max(160, canvas.bottom - canvas.top - MARGIN * 2);
    const lowest = canvas.bottom - MARGIN - Math.min(height, maxHeight);
    let top = clamp(rowTop - 6, canvas.top + MARGIN, lowest) - rootRect.top;
    // While it stays open for the same row it only ever moves up (to stay inside the canvas when it grows):
    // a list that gets shorter as the person types must not slide away from under the pointer.
    const anchor = `${popKey}|${trace?.traceId ?? ""}`;
    if (placedFor.current?.anchor === anchor) top = Math.min(placedFor.current.top, top);
    placedFor.current = { anchor, top };
    const roomLeft = rootRect.left - canvas.left;
    const roomRight = canvas.right - rootRect.right;
    const side = roomLeft >= POP_WIDTH + MARGIN + 6 || roomLeft >= roomRight ? "left" : "right";
    setPop((previous) => (previous && previous.top === top && previous.side === side && previous.maxHeight === maxHeight ? previous : { top, side, maxHeight }));
  }, [popKey, showAgent, openRow, openKey, canvas, prefs, layout, tick, trace?.traceId]);
  useEffect(() => {
    if (!popKey || !popover.current || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(() => setTick((n) => n + 1));
    observer.observe(popover.current);
    return () => observer.disconnect();
  }, [popKey, pop !== null]);

  // Where it was put is kept per project: nothing to show before the project is known.
  if (!booted || !canvas || !position) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, right: canvas.right - position.left - WIDTH, top: position.top - canvas.top };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    // Keep what is stored inside the canvas, so the panel never has to "catch up" with the pointer.
    const placed = place({ ...prefsRef.current, right: start.right - (event.clientX - start.x), top: start.top + (event.clientY - start.y) }, canvas);
    update({ right: Math.round(canvas.right - placed.left - WIDTH), top: Math.round(placed.top - canvas.top), placed: true }, false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    update({});
  };
  const copy = async () => {
    if (!trace) return;
    try {
      await navigator.clipboard.writeText(buildReference(trace));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const closePopover = () => {
    const element = root.current?.querySelector<HTMLElement>('[data-code-layer-row][data-open="true"]');
    store.set({ openRow: null });
    // Closing hands the keyboard back to the row, so the arrow keys step from there.
    element?.focus();
  };

  const writable = Boolean(session?.capabilities.write) && !session?.readOnly;
  const applying = phase === "arming" || phase === "writing" || phase === "verifying" || phase === "undoing";
  const hint = !writable ? t("apply.hintReadOnly") : agentBusy ? t("agent.busyHint") : drifting ? t("apply.hintDrift") : t("apply.hint");
  const agentReason = agentUnavailable(agentStatus);
  const agentOffered = Boolean(trace) && active && !agentReason;

  let content: React.ReactNode;
  if (!effective || effective.state === "off") content = <Message>{t("panel.indexLoading")}</Message>;
  else if (effective.state === "suspended") content = <Message data-code-layer-suspended={effective.reason}>{suspendText(effective)}</Message>;
  else if (!index) content = <Message>{indexError ? t("panel.indexError", { error: indexError }) : t("panel.indexLoading")}</Message>;
  else if (!trace) {
    content = (
      <Guide data-code-layer-guide>
        <Key>{t("guide.selectKey")}</Key>
        <span>{t("guide.select")}</span>
        <Key>{t("guide.drillKey")}</Key>
        <span>{t("guide.drill")}</span>
        <Key>{t("guide.changeKey")}</Key>
        <span>{t("guide.change")}</span>
      </Guide>
    );
  } else {
    content = (
      <>
        <Navigation trace={trace} dev={prefs.dev} />
        {SECTIONS.map((section) => {
          const rows = trace.rows.filter((row) => row.section === section);
          if (rows.length === 0) return null;
          const shown = more[section] ? rows : rows.filter(hasSource);
          const hidden = rows.length - rows.filter(hasSource).length;
          return (
            <Section key={section} data-code-layer-section={section} data-rows={shown.length}>
              <SectionHead>
                <span>{sectionLabel(section)}</span>
                {hidden > 0 ? (
                  <MoreButton
                    type="button"
                    aria-expanded={Boolean(more[section])}
                    title={more[section] ? t("section.less") : t("section.moreTitle", { count: hidden })}
                    data-code-layer-action="toggle-more"
                    data-section={section}
                    data-hidden={hidden}
                    onClick={() => setMore({ ...more, [section]: !more[section] })}
                  >
                    {more[section] ? t("section.less") : t("section.more", { count: hidden })}
                  </MoreButton>
                ) : null}
              </SectionHead>
              {shown.map((row) => (
                <Field key={row.id} trace={trace} row={row} index={index} editable={active && !readOnly} />
              ))}
            </Section>
          );
        })}
      </>
    );
  }

  return (
    <Root
      ref={root}
      data-code-layer-panel
      data-collapsed={prefs.collapsed ? "true" : "false"}
      data-dev={prefs.dev ? "true" : "false"}
      data-placed={prefs.placed ? "true" : "false"}
      style={{ left: position.left, top: position.top, maxHeight: prefs.collapsed ? HEADER_HEIGHT + 2 : position.maxHeight }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <HeaderBar
        dragging={dragging}
        flat={prefs.collapsed}
        title={t("inspector.drag")}
        data-code-layer-drag
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) => {
          if (!(event.target instanceof Element && event.target.closest("button"))) update({ collapsed: !prefs.collapsed });
        }}
      >
        <Grip>
          <GripIcon />
        </Grip>
        <TitleText data-code-layer-title style={{ marginRight: "auto" }}>
          {trace && active ? trace.label : t("inspector.title")}
        </TitleText>
        <IconButton type="button" pressed={prefs.dev} aria-pressed={prefs.dev} aria-label={t("inspector.dev")} title={t("inspector.dev")} onClick={() => update({ dev: !prefs.dev })} data-code-layer-action="toggle-dev">
          <CodeIcon />
        </IconButton>
        <IconButton
          type="button"
          // Not `disabled`: a disabled button shows no tooltip, and the tooltip says why AI editing is unavailable.
          aria-disabled={!agentOffered}
          pressed={showAgent}
          aria-pressed={showAgent}
          aria-label={agentReason ? t("agent.unavailable", { reason: agentReason }) : t("agent.open")}
          title={agentReason ? t("agent.unavailable", { reason: agentReason }) : !trace ? t("agent.selectFirst") : t("agent.open")}
          style={agentOffered ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
          onClick={() => {
            if (!agentOffered) return;
            if (showAgent) closeAgentDialog();
            else openAgentDialog();
          }}
          data-code-layer-action="agent"
          data-ready={agentReason ? "false" : "true"}
        >
          <SparkleIcon />
        </IconButton>
        <IconButton type="button" disabled={!trace} aria-label={t("header.copyTitle")} title={t("header.copyTitle")} onClick={() => void copy()} data-code-layer-action="copy-reference" data-copied={copied ? "true" : "false"}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
        <IconButton type="button" aria-expanded={!prefs.collapsed} aria-label={prefs.collapsed ? t("inspector.expand") : t("inspector.collapse")} title={prefs.collapsed ? t("inspector.expand") : t("inspector.collapse")} onClick={() => update({ collapsed: !prefs.collapsed })} data-code-layer-action="collapse">
          <ChevronIcon up={!prefs.collapsed} />
        </IconButton>
      </HeaderBar>
      {prefs.collapsed ? null : (
        <>
          <Body onScroll={() => setTick((n) => n + 1)}>
            <Notices dev={prefs.dev} />
            {content}
          </Body>
          <ChangesBar index={index} applyEnabled={writable && !drifting && active && !readOnly && !agentBusy} applyHint={hint} onApply={() => void applyDrafts()} applying={applying} dev={prefs.dev}>
            <AgentRunReport />
            <Report prefix={index?.tokens.prefix ?? ""} />
          </ChangesBar>
        </>
      )}
      {showAgent && trace && !prefs.collapsed ? (
        <Pop
          ref={popover}
          data-code-layer-popover="agent"
          data-side={pop?.side ?? "left"}
          style={{ top: pop?.top ?? HEADER_HEIGHT, maxHeight: pop?.maxHeight, opacity: pop ? 1 : 0, pointerEvents: pop ? "auto" : "none", ...(pop?.side === "right" ? { left: WIDTH + 4 } : { right: WIDTH + 4 }) }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") closeAgentDialog();
          }}
        >
          <AgentDialog trace={trace} onClose={closeAgentDialog} />
        </Pop>
      ) : openRow && trace && index && !prefs.collapsed ? (
        <Pop
          ref={popover}
          data-code-layer-popover={openRow.id}
          data-side={pop?.side ?? "left"}
          // Not `visibility: hidden` while it is being placed: the search field must be able to take the focus at once.
          style={{ top: pop?.top ?? HEADER_HEIGHT, maxHeight: pop?.maxHeight, opacity: pop ? 1 : 0, pointerEvents: pop ? "auto" : "none", ...(pop?.side === "right" ? { left: WIDTH + 4 } : { right: WIDTH + 4 }) }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closePopover();
            }
          }}
        >
          <RowPopover
            trace={trace}
            row={openRow}
            index={index}
            editable={active && !readOnly}
            dev={prefs.dev}
            onClose={closePopover}
          />
        </Pop>
      ) : null}
    </Root>
  );
}

/** Where the selection sits: what it is, the way up, and the way in. */
function Navigation({ trace, dev }: { trace: ElementTrace; dev: boolean }) {
  const relatives = useStore((s) => (s.relatives?.traceId === trace.traceId ? s.relatives : null));
  const breadcrumb = relatives?.breadcrumb ?? [];
  const children = relatives?.children ?? [];
  return (
    <Nav data-code-layer-header>
      <Meta data-code-layer-meta>
        {trace.componentId ? trace.componentId : t("header.noComponent")}
        {trace.variant ? ` · ${trace.variant}` : ""} · {trace.size.width} × {trace.size.height}
      </Meta>
      {breadcrumb.length > 1 ? (
        <Crumbs data-code-layer-breadcrumb aria-label={t("header.breadcrumb")}>
          {breadcrumb.map((entry, i) => {
            const current = i === breadcrumb.length - 1;
            return (
              <React.Fragment key={i}>
                {i > 0 ? <span aria-hidden="true">›</span> : null}
                <Crumb
                  type="button"
                  current={current}
                  root={entry.componentRoot}
                  data-code-layer-crumb={i}
                  data-component-root={entry.componentRoot ? "true" : "false"}
                  aria-current={current ? "true" : undefined}
                  title={entry.componentRoot ? `${entry.label} — ${t("header.componentBoundary")}` : entry.label}
                  onMouseEnter={() => highlight(current ? null : entry.descriptor)}
                  onMouseLeave={() => highlight(null)}
                  onFocus={() => highlight(current ? null : entry.descriptor)}
                  onBlur={() => highlight(null)}
                  onClick={() => {
                    if (!current) selectDescriptor(entry.descriptor);
                  }}
                >
                  {entry.componentRoot ? "◆ " : ""}
                  {entry.label}
                </Crumb>
              </React.Fragment>
            );
          })}
        </Crumbs>
      ) : null}
      {children.length > 0 ? (
        <Crumbs data-code-layer-children aria-label={t("header.children")}>
          <span aria-hidden="true" title={t("header.children")}>
            ↳
          </span>
          {children.map((entry, i) => (
            <Crumb
              key={i}
              type="button"
              data-code-layer-child={i}
              title={`${t("header.children")}${t("reference.colon")}${entry.label}`}
              onMouseEnter={() => highlight(entry.descriptor)}
              onMouseLeave={() => highlight(null)}
              onFocus={() => highlight(entry.descriptor)}
              onBlur={() => highlight(null)}
              onClick={() => selectDescriptor(entry.descriptor)}
            >
              {entry.label}
            </Crumb>
          ))}
        </Crumbs>
      ) : null}
      {dev ? (
        <DevLine data-code-layer-own-rule>
          {trace.ownRule ? t("header.rule", { file: trace.ownRule.workspacePath, selector: trace.ownRule.selector, line: trace.ownRule.line }) : t("header.noRule")}
          <div>{t("header.path", { path: trace.pathText })}</div>
        </DevLine>
      ) : null}
    </Nav>
  );
}

export type { IndexJson };
