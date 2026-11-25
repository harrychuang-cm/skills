// "Copy object reference": a plain-text description an AI assistant can act
// on without seeing the page. One version marker line, where the element is,
// then one line per traced row with its property, token chain and value.
import { t, tMaybe } from "./i18n";
import { rowLabel, scopeLabel } from "./labels";
import type { ElementTrace, RowTrace } from "./protocol";

export const REFERENCE_VERSION = 2;

function chainText(row: RowTrace): string {
  const parts: string[] = [];
  const declaration = row.declaration;
  if (declaration) {
    const where = declaration.workspacePath ? t("reference.at", { file: declaration.workspacePath, line: declaration.line ?? "?" }) : "";
    parts.push(`${declaration.property}${where}`);
  } else {
    parts.push(row.cssProperty);
  }
  for (const link of row.chain) {
    const where = link.file ? t("reference.at", { file: link.file, line: link.line ?? "?" }) : "";
    const status =
      link.status === "overridden" && link.overriddenBy
        ? t("reference.overridden", { file: link.overriddenBy.file, line: link.overriddenBy.line ?? "?" })
        : link.status === "undefined"
          ? t("reference.undefined")
          : link.status === "not-a-token"
            ? t("reference.notAToken")
            : "";
    parts.push(`${link.name}${where}${status}`);
  }
  const value = row.chain[row.chain.length - 1]?.value ?? row.computed;
  return `${parts.join(" → ")} = ${value}`;
}

function rowNotes(row: RowTrace): string[] {
  const notes: string[] = [];
  if (row.inheritedFrom && row.inheritedFrom.kind !== "default") {
    notes.push(t("reference.inherited", { from: row.inheritedFrom.label ?? row.inheritedFrom.source ?? "?" }));
  }
  if (row.readOnly) {
    notes.push(t("reference.readOnly", { reason: tMaybe(`readonly.${row.readOnly.reason}`, { detail: row.readOnly.detail }) ?? row.readOnly.reason }));
  } else if (row.scopes.length > 0) {
    const scopes = row.scopes.map((scope) => {
      const name = scopeLabel(scope.id);
      const where = t("reference.at", { file: scope.writes.files[0], line: scope.writes.line });
      const mark = scope.id === row.defaultScope ? t("reference.default") : !scope.available ? t("reference.unavailable") : "";
      return `${name}${where}${mark}`;
    });
    notes.push(t("reference.scopes", { scopes: scopes.join(t("list.separator")) }));
  }
  return notes;
}

/** Rows worth describing: everything that was traced to a declaration, an attribute or an ancestor. */
export function referenceRows(trace: ElementTrace): RowTrace[] {
  return trace.rows.filter((row) => row.source !== "none" || (row.inheritedFrom !== null && row.inheritedFrom.kind !== "default"));
}

export function buildReference(trace: ElementTrace, onlyRowIds: string[] | null = null): string {
  const lines: string[] = [t("reference.marker", { version: REFERENCE_VERSION })];
  const storyTitle = trace.storyTitle && trace.storyName ? t("reference.storyTitle", { title: trace.storyTitle, name: trace.storyName }) : "";
  lines.push(t("reference.story", { id: trace.storyId ?? "unknown", title: storyTitle }));
  lines.push(
    trace.componentId
      ? t("reference.component", { component: trace.componentId, variant: trace.variant ?? "—", element: trace.label })
      : t("reference.element", { element: trace.label }),
  );
  lines.push(t("reference.path", { path: trace.pathText }));
  // Every stylesheet rule the rows point at, with its ordinal and line.
  const rules = new Map<string, string>();
  if (trace.ownRule) {
    rules.set(`${trace.ownRule.workspacePath}#${trace.ownRule.ordinal}`, t("reference.css", { file: trace.ownRule.workspacePath, selector: trace.ownRule.selector, ordinal: trace.ownRule.ordinal, line: trace.ownRule.line }));
  }
  const rows = referenceRows(trace).filter((row) => !onlyRowIds || onlyRowIds.includes(row.id));
  for (const row of rows) {
    const d = row.declaration;
    if (!d || !d.workspacePath) continue;
    const key = `${d.workspacePath}#${d.ordinal}`;
    if (!rules.has(key)) rules.set(key, t("reference.css", { file: d.workspacePath, selector: d.selector, ordinal: d.ordinal, line: d.ruleLine ?? "?" }));
  }
  for (const rule of rules.values()) lines.push(rule);
  for (const row of rows) {
    const notes = rowNotes(row);
    lines.push(`${rowLabel(row)}${t("reference.colon")}${chainText(row)}${notes.length ? ` · ${notes.join(" · ")}` : ""}`);
  }
  lines.push(t("reference.footer"));
  return lines.join("\n");
}
