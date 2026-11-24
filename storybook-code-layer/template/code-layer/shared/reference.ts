// "Copy object reference": a plain-text description an AI chat can act on.
import type { ElementTrace, RowTrace } from "./protocol";

function chainText(row: RowTrace): string {
  const parts: string[] = [];
  if (row.declaration) {
    parts.push(`${row.declaration.property}（${row.declaration.workspacePath}:${row.declaration.line}）`);
  } else {
    parts.push(row.cssProperty);
  }
  row.chain.forEach((link, index) => {
    const where = link.file ? `（${link.file}${link.line ? `:${link.line}` : ""}）` : "";
    const status = link.status === "overridden" && link.overriddenBy ? `［被 ${link.overriddenBy.file}:${link.overriddenBy.line ?? "?"} 覆寫］` : link.status === "undefined" ? "［未定義］" : "";
    parts.push(`${link.name}${index === 0 ? where : ""}${status}`);
  });
  const last = row.chain[row.chain.length - 1];
  const value = last?.value ?? row.computed;
  return `${parts.join(" → ")} = ${value}`;
}

export function buildReference(trace: ElementTrace, onlyRowIds: string[] | null = null): string {
  const lines: string[] = ["[Code Layer 物件參照 v1]"];
  const storyTitle = trace.storyTitle && trace.storyName ? `（${trace.storyTitle} › ${trace.storyName}）` : "";
  lines.push(`Story：${trace.storyId ?? "unknown"}${storyTitle}`);
  const component = trace.componentId ? `元件：${trace.componentId}${trace.variant ? ` · variant：${trace.variant}` : ""} · ` : "";
  lines.push(`${component}元素：${trace.label}`);
  lines.push(`路徑：${trace.pathText}`);
  const rules = new Map<string, string>();
  for (const row of trace.rows) {
    if (!row.declaration) continue;
    const key = `${row.declaration.workspacePath}#${row.declaration.ordinal}`;
    if (!rules.has(key)) {
      rules.set(key, `${row.declaration.workspacePath} · ${row.declaration.selector}（規則 #${row.declaration.ordinal}）`);
    }
  }
  for (const rule of rules.values()) lines.push(`CSS：${rule}`);
  for (const row of trace.rows) {
    if (onlyRowIds && !onlyRowIds.includes(row.id)) continue;
    if (!row.declaration && row.chain.length === 0) continue;
    lines.push(`${row.label}：${chainText(row)}`);
  }
  lines.push("路徑皆相對於專案根目錄（tokens 檔為真相來源，storybook/tokens 為鏡像）。");
  return lines.join("\n");
}
