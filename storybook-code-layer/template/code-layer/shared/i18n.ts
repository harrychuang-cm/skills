// One message catalog for everything the tool shows: toolbar, panel, overlay,
// reasons, reports and the labels of the object reference. Two languages with
// identical key sets; the type of the Traditional Chinese catalog defines the
// keys, so a key missing from the English one fails the type check.
// Explicit extensions: the same files are imported by the Node tests, which resolve no extensionless paths.
import { en } from "./messages.en.ts";
import { zhHant } from "./messages.zh-Hant.ts";

export type Locale = "zh-Hant" | "en";
export type MessageKey = keyof typeof zhHant;
export type MessageParams = Record<string, string | number | null | undefined>;

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { "zh-Hant": zhHant, en };

/** The binding's `locale` wins; otherwise the browser language; otherwise English. */
export function resolveLocale(binding: string | null | undefined, browser: string | null | undefined): Locale {
  if (binding === "zh-Hant" || binding === "en") return binding;
  return (browser ?? "").toLowerCase().startsWith("zh") ? "zh-Hant" : "en";
}

function browserLanguage(): string | null {
  return typeof navigator === "undefined" ? null : navigator.language;
}

let current: Locale = resolveLocale(null, browserLanguage());
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** Apply the binding's locale (null: follow the browser). Returns whether the language changed. */
export function applyBindingLocale(binding: string | null | undefined): boolean {
  const next = resolveLocale(binding, browserLanguage());
  if (next === current) return false;
  current = next;
  for (const listener of listeners) listener();
  return true;
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function format(template: string, params: MessageParams | undefined): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function t(key: MessageKey, params?: MessageParams): string {
  return format(CATALOGS[current][key] ?? CATALOGS.en[key] ?? key, params);
}

/** For keys built at run time (reason codes, error codes): null when the catalog has no such key. */
export function tMaybe(key: string, params?: MessageParams): string | null {
  const template = (CATALOGS[current] as Record<string, string>)[key] ?? (CATALOGS.en as Record<string, string>)[key];
  return template === undefined ? null : format(template, params);
}

/** `tMaybe` with a fallback key for codes the catalog does not know. */
export function tCode(prefix: string, code: string, fallback: MessageKey, params?: MessageParams): string {
  return tMaybe(`${prefix}.${code}`, params) ?? t(fallback, { ...params, code });
}

export function messageKeys(locale: Locale): string[] {
  return Object.keys(CATALOGS[locale]).sort();
}
