// A plain-text brief of what an apply left for a person or an AI assistant to
// finish: the documents pending sync of that apply, each with its file, line,
// reason and the old and new token.
import { t, tMaybe } from "./i18n";

export type PendingEntry = {
  id: string;
  applyId: string;
  operation: string | null;
  kind: "spec-row" | "declaration" | "comment" | "mention" | "system-token" | "truncated";
  reason: string;
  file: string;
  line: number;
  excerpt: string;
  token: string | null;
  property: string | null;
  oldToken: string | null;
  newToken: string | null;
  /** A layout change: the keywords instead of tokens (no old one when a declaration was added). */
  oldValue?: string | null;
  newValue?: string | null;
  term?: string;
  actual?: string | null;
};

export function pendingReason(entry: PendingEntry): string {
  return tMaybe(`pending.reason.${entry.reason}`, { term: entry.term ?? "", actual: entry.actual ?? "", count: entry.excerpt }) ?? entry.reason;
}

/** Text to paste into an AI chat: what changed, then every place that may now be out of date. */
export function pendingBrief(applyId: string, entries: PendingEntry[], reference: string | null): string {
  const lines: string[] = [t("brief.title", { applyId })];
  if (reference) lines.push("", reference);
  lines.push("", t("brief.intro"));
  const changes = new Map<string, string>();
  for (const entry of entries) {
    const to = entry.newToken ?? entry.newValue ?? null;
    const from = entry.oldToken ?? entry.oldValue ?? (entry.newValue ? t("layout.unset") : null);
    if (!from || !to) continue;
    const subject = entry.token ?? entry.property ?? "";
    changes.set(`${subject}|${from}|${to}`, t("brief.change", { subject, from, to }));
  }
  for (const change of changes.values()) lines.push(`- ${change}`);
  lines.push("", t("brief.places"));
  for (const entry of entries) {
    lines.push(`- ${entry.file}:${entry.line} — ${pendingReason(entry)}`);
    if (entry.excerpt && entry.kind !== "truncated") lines.push(`  ${entry.excerpt}`);
  }
  lines.push("", t("brief.rules"));
  return lines.join("\n");
}
