import {
  CheckIcon,
  CommandIcon,
  CopyIcon,
  FigmaIcon,
} from "@storybook/icons";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { createFigmaExportPayload } from "./domExport";
import {
  isStoryIncludedForFigmaExport,
  resolveFigmaExportAddonOptions,
  type FigmaExportAddonOptions,
} from "./options";
import { createFigmaExportJson, createFigmaPluginCode } from "./pluginCode";
import type { FigmaExportNode, FigmaExportPayload } from "./types";

type StorybookContext = {
  globals?: Record<string, unknown>;
  id?: string;
  name?: string;
  title?: string;
};

type FigmaCodeExporterProps = {
  children?: ReactNode;
  context: StorybookContext;
  options?: FigmaExportAddonOptions;
};

type CopyFormat = "design" | "file" | "json" | "script";
type ExportStatus = "copied" | "copying" | "error" | "idle";

const statusLabels: Record<ExportStatus, string> = {
  copied: "Copied",
  copying: "Exporting",
  error: "Failed",
  idle: "Ready",
};

function getExportComponentTitle(
  title: string | undefined,
  options: ReturnType<typeof resolveFigmaExportAddonOptions>,
): string {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;

  const matchingPrefix = options.storyTitlePrefix.find((prefix) =>
    title.startsWith(prefix),
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function sanitizeExportFilename(value: string | undefined): string {
  return (
    String(value ?? "storybook-figma-export")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "storybook-figma-export"
  );
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.download = filename;
  downloadLink.href = downloadUrl;
  downloadLink.style.display = "none";
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

function getExporterTime(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function waitForExporterPanelPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
}

function formatExportDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0.0s";
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function getTextSizeLabel(text: string): string {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function exporterEscapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function exporterEscapeSvgAttribute(value: string): string {
  return exporterEscapeXml(value).replace(/"/g, "&quot;");
}

function exporterFormatSvgNumber(value: number | undefined): string {
  const numberValue = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}

function exporterSvgDataUrl(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function exporterGetSvgPaint(value: string | undefined, fallback = "none"): string {
  return value ? exporterEscapeSvgAttribute(value) : fallback;
}

function renderSvgImageNode(node: FigmaExportNode, isRoot: boolean): string {
  const { height, width, x, y } = node.styles;
  const transform = isRoot
    ? ""
    : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;

  if (!node.svgText) return "";

  return `<g${transform}><image href="${exporterEscapeSvgAttribute(exporterSvgDataUrl(node.svgText))}" width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" preserveAspectRatio="none"/></g>`;
}

function renderSvgTextNode(node: FigmaExportNode, isRoot: boolean): string {
  const { color, fontFamily, fontSize, fontWeight, textAlign, width, x, y } = node.styles;
  const transform = isRoot
    ? ""
    : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;
  const resolvedFontSize = fontSize ?? 12;
  const textAnchor =
    textAlign === "center" ? "middle" : textAlign === "right" || textAlign === "end" ? "end" : "start";
  const textX =
    textAnchor === "middle" ? width / 2 : textAnchor === "end" ? width : 0;

  return `<text${transform} x="${exporterFormatSvgNumber(textX)}" y="${exporterFormatSvgNumber(resolvedFontSize)}" fill="${exporterGetSvgPaint(color, "#000000")}" font-family="${exporterEscapeSvgAttribute(fontFamily ?? "sans-serif")}" font-size="${exporterFormatSvgNumber(resolvedFontSize)}" font-weight="${exporterEscapeSvgAttribute(String(fontWeight ?? 400))}" text-anchor="${textAnchor}">${exporterEscapeXml(node.text ?? "")}</text>`;
}

function renderSvgFrameNode(node: FigmaExportNode, isRoot: boolean): string {
  const {
    backgroundColor,
    borderColor,
    borderWidth,
    height,
    opacity,
    radius,
    width,
    x,
    y,
  } = node.styles;
  const transform = isRoot
    ? ""
    : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;
  const groupOpacity =
    typeof opacity === "number" && opacity >= 0 && opacity < 1
      ? ` opacity="${exporterFormatSvgNumber(opacity)}"`
      : "";
  const hasRect = Boolean(backgroundColor || (borderColor && borderWidth));
  const rect = hasRect
    ? `<rect width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" rx="${exporterFormatSvgNumber(radius)}" fill="${exporterGetSvgPaint(backgroundColor)}"${borderColor && borderWidth ? ` stroke="${exporterGetSvgPaint(borderColor)}" stroke-width="${exporterFormatSvgNumber(borderWidth)}"` : ""}/>`
    : "";
  const children = node.children.map((child) => renderSvgNode(child)).join("");

  return `<g${transform}${groupOpacity}>${rect}${children}</g>`;
}

function renderSvgNode(node: FigmaExportNode, isRoot = false): string {
  if (node.kind === "text") return renderSvgTextNode(node, isRoot);
  if (node.kind === "image" || node.kind === "svg") {
    return renderSvgImageNode(node, isRoot);
  }
  return renderSvgFrameNode(node, isRoot);
}

function createFigmaDesignSvg(payload: FigmaExportPayload): string {
  const width = Math.max(1, payload.root.styles.width);
  const height = Math.max(1, payload.root.styles.height);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" viewBox="0 0 ${exporterFormatSvgNumber(width)} ${exporterFormatSvgNumber(height)}" role="img" aria-label="${exporterEscapeSvgAttribute(payload.root.name)}">${renderSvgNode(payload.root, true)}</svg>`;
}

async function copySvgDesign(svgText: string): Promise<void> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const plainText = new Blob([svgText], { type: "text/plain" });
    const htmlText = new Blob([svgText], { type: "text/html" });

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
          "text/html": htmlText,
          "text/plain": plainText,
        }),
      ]);
      return;
    } catch {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlText,
          "text/plain": plainText,
        }),
      ]);
      return;
    }
  }

  await copyText(svgText);
}

export function FigmaCodeExporter({
  children,
  context,
  options,
}: FigmaCodeExporterProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const [activeFormat, setActiveFormat] = useState<CopyFormat | undefined>();
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | undefined>();
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [summary, setSummary] = useState("");

  const resolvedOptions = resolveFigmaExportAddonOptions(options);
  const enabled = context.globals?.[resolvedOptions.globalName] === "on";
  const includedStory = isStoryIncludedForFigmaExport(context.title, resolvedOptions);
  const componentTitle = getExportComponentTitle(context.title, resolvedOptions);

  async function handleCopy(format: CopyFormat) {
    const scope = scopeRef.current;
    if (!scope) return;

    setActiveFormat(format);
    setCopiedFormat(undefined);
    setStatus("copying");
    setSummary(
      format === "design"
        ? "Generating SVG design..."
        : format === "file"
          ? "Preparing export file..."
        : format === "json"
          ? "Generating JSON payload..."
          : "Generating console script...",
    );

    try {
      const startedAt = getExporterTime();

      await waitForExporterPanelPaint();

      const payload = await createFigmaExportPayload({
        componentTitle,
        onProgress: (progress) => {
          if (progress.phase === "preparing") {
            setSummary("Preparing story surface...");
            return;
          }

          if (progress.phase === "nodes") {
            setSummary(
              `Reading ${progress.nodeCount ?? 0} layers from the story...`,
            );
            return;
          }

          setSummary(
            `Resolving design tokens from ${progress.nodeCount ?? 0} layers...`,
          );
        },
        options: resolvedOptions,
        scope,
        storyId: context.id ?? "unknown-story",
        storyName: context.name ?? "Story",
        storyTitle: context.title ?? componentTitle,
      });
      let exportSizeLabel = "";

      if (format === "design") {
        setSummary("Copying SVG design...");
        await waitForExporterPanelPaint();
        const svgText = createFigmaDesignSvg(payload);

        exportSizeLabel = getTextSizeLabel(svgText);
        await copySvgDesign(svgText);
      } else if (format === "file") {
        const exportText = createFigmaExportJson(payload);

        exportSizeLabel = getTextSizeLabel(exportText);
        setSummary(`Starting ${exportSizeLabel} download...`);
        await waitForExporterPanelPaint();
        downloadTextFile(
          `${sanitizeExportFilename(context.id ?? payload.storyId)}.sbfx.json`,
          exportText,
        );
      } else {
        const exportText =
          format === "json"
            ? createFigmaExportJson(payload)
            : createFigmaPluginCode(payload);
        exportSizeLabel = getTextSizeLabel(exportText);
        setSummary(
          format === "json"
            ? `Copying ${exportSizeLabel} JSON...`
            : `Copying ${exportSizeLabel} plugin script...`,
        );
        await waitForExporterPanelPaint();

        await copyText(exportText);
      }
      setCopiedFormat(format);
      setStatus("copied");
      const elapsedLabel = formatExportDuration(getExporterTime() - startedAt);
      const sizeSummary = exportSizeLabel ? ` (${exportSizeLabel})` : "";
      setSummary(
        format === "design"
          ? `Visual SVG copied from ${payload.root.name}${sizeSummary} in ${elapsedLabel}.`
          : format === "file"
            ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; .sbfx.json downloaded.`
          : format === "json"
            ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; JSON copied.`
            : `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; script copied.`,
      );
    } catch (error) {
      setStatus("error");
      setCopiedFormat(undefined);
      setSummary(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setActiveFormat(undefined);
    }
  }

  if (!includedStory) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="sbfx-story-scope" ref={scopeRef}>
        {children}
      </div>
      {enabled ? (
        <aside
          aria-label="Figma export"
          className="sbfx-exporter"
          data-status={status}
        >
          <header className="sbfx-exporter__header">
            <span className="sbfx-exporter__mark" aria-hidden="true">
              <FigmaIcon size={14} />
            </span>
            <span className="sbfx-exporter__heading">
              <span className="sbfx-exporter__title">Figma export</span>
              <span className="sbfx-exporter__subtitle" title={componentTitle}>
                {componentTitle}
              </span>
            </span>
          </header>
          <div className="sbfx-exporter__info">
            <span className="sbfx-exporter__status">
              <span className="sbfx-exporter__status-dot" aria-hidden="true" />
              {statusLabels[status]}
            </span>
            {summary ? (
              <p className="sbfx-exporter__summary" title={summary}>
                {summary}
              </p>
            ) : null}
            {status === "copying" ? (
              <span className="sbfx-exporter__progress" aria-hidden="true" />
            ) : null}
          </div>
          <div className="sbfx-exporter__actions">
            <button
              className="sbfx-exporter__button"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("json");
              }}
              type="button"
            >
              {copiedFormat === "json" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <CopyIcon size={14} />
              )}
              {activeFormat === "json"
                ? "Copying"
                : copiedFormat === "json" && status === "copied"
                  ? "Copied"
                  : "Copy JSON"}
            </button>
            <button
              className="sbfx-exporter__button"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("file");
              }}
              type="button"
            >
              {copiedFormat === "file" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <CopyIcon size={14} />
              )}
              {activeFormat === "file"
                ? "Preparing"
                : copiedFormat === "file" && status === "copied"
                  ? "Downloaded"
                  : "Download JSON"}
            </button>
            <button
              className="sbfx-exporter__button sbfx-exporter__button--secondary"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("script");
              }}
              type="button"
            >
              {copiedFormat === "script" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <CommandIcon size={14} />
              )}
              {activeFormat === "script"
                ? "Copying"
                : copiedFormat === "script" && status === "copied"
                  ? "Copied"
                : "Plugin Console Script"}
            </button>
            <button
              aria-label="Copy design to Figma"
              className="sbfx-exporter__button sbfx-exporter__button--secondary sbfx-exporter__button--icon"
              disabled={status === "copying"}
              onClick={() => {
                void handleCopy("design");
              }}
              title="Copy design to Figma"
              type="button"
            >
              {copiedFormat === "design" && status === "copied" ? (
                <CheckIcon size={14} />
              ) : (
                <FigmaIcon size={14} />
              )}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
