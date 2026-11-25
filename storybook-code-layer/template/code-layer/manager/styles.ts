// Inspector primitives styled with the Storybook manager theme (no CSS imports).
// The inspector is a compact floating panel: rows of icon, value and token,
// nothing that needs reading in the default view.
import { styled } from "storybook/theming";

export const ACCENT = "#0D99FF";
export const WIDTH = 272;
export const POP_WIDTH = 252;
export const HEADER_HEIGHT = 36;

/** Storybook themes carry `base` ("light" or "dark") at run time; the emotion Theme type here does not declare it. */
const isLight = (theme: unknown) => (theme as { base?: string }).base === "light";
/** Thin, unobtrusive scrollbars inside the inspector. */
const scroll = (theme: unknown) => ({
  scrollbarWidth: "thin" as const,
  scrollbarColor: `${isLight(theme) ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.25)"} transparent`,
  "&::-webkit-scrollbar": { width: 8, height: 8 },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": { background: isLight(theme) ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.22)", borderRadius: 4, border: "2px solid transparent", backgroundClip: "content-box" },
});
const subtle = (theme: unknown, strong = false) => (isLight(theme) ? `rgba(0, 0, 0, ${strong ? 0.09 : 0.05})` : `rgba(255, 255, 255, ${strong ? 0.13 : 0.07})`);

export const Root = styled.div(({ theme }) => ({
  position: "fixed",
  zIndex: 1000,
  width: WIDTH,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  background: theme.background.content,
  color: theme.color.defaultText,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 10,
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.28), 0 1px 3px rgba(0, 0, 0, 0.2)",
  fontFamily: theme.typography.fonts.base,
  fontSize: 12,
  lineHeight: 1.35,
  "*, *::before, *::after": { boxSizing: "border-box" },
}));

export const HeaderBar = styled.div<{ dragging: boolean; flat: boolean }>(({ theme, dragging, flat }) => ({
  flex: "0 0 auto",
  height: HEADER_HEIGHT,
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "0 6px 0 4px",
  cursor: dragging ? "grabbing" : "grab",
  userSelect: "none",
  touchAction: "none",
  borderBottom: flat ? "none" : `1px solid ${theme.appBorderColor}`,
}));

export const Grip = styled.span(({ theme }) => ({ display: "inline-flex", color: theme.textMutedColor, opacity: 0.7, flex: "0 0 auto" }));

export const TitleText = styled.span({ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 });

export const SizeTag = styled.span(({ theme }) => ({
  flex: "0 0 auto",
  marginRight: "auto",
  color: theme.textMutedColor,
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
}));

export const IconButton = styled.button<{ pressed?: boolean }>(({ theme, pressed }) => ({
  appearance: "none",
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  border: "none",
  borderRadius: 6,
  background: pressed ? "rgba(13, 153, 255, 0.16)" : "transparent",
  color: pressed ? ACCENT : theme.textMutedColor,
  font: "inherit",
  cursor: "pointer",
  "&:hover:not(:disabled)": { background: pressed ? "rgba(13, 153, 255, 0.22)" : subtle(theme, true), color: pressed ? ACCENT : theme.color.defaultText },
  "&:disabled": { opacity: 0.35, cursor: "default" },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -1 },
}));

export const Body = styled.div(({ theme }) => ({ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", ...scroll(theme) }));

export const Message = styled.p(({ theme }) => ({ margin: 0, padding: "14px", lineHeight: 1.55, color: theme.textMutedColor }));

// ---- navigation: where the selection sits ----------------------------------------

export const Nav = styled.div(({ theme }) => ({ padding: "6px 8px 4px", borderBottom: `1px solid ${theme.appBorderColor}` }));

export const Meta = styled.div(({ theme }) => ({ padding: "0 4px 2px", color: theme.textMutedColor, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }));

export const Crumbs = styled.div(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 1,
  color: theme.textMutedColor,
  fontSize: 11,
  "& > span": { opacity: 0.6, padding: "0 1px" },
}));

export const Crumb = styled.button<{ current?: boolean; root?: boolean }>(({ theme, current, root }) => ({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: "2px 5px",
  borderRadius: 5,
  font: "inherit",
  maxWidth: 150,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: current ? theme.color.defaultText : root ? ACCENT : theme.textMutedColor,
  fontWeight: current ? 600 : 400,
  cursor: current ? "default" : "pointer",
  "&:hover": current ? {} : { background: subtle(theme, true), color: theme.color.defaultText },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -1 },
}));

export const DevLine = styled.div(({ theme }) => ({
  padding: "2px 4px 0",
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10.5,
  lineHeight: 1.45,
  wordBreak: "break-all",
  userSelect: "text",
}));

// ---- sections and rows ---------------------------------------------------------------

export const Section = styled.div(({ theme }) => ({ padding: "6px 0 4px", "& + &": { borderTop: `1px solid ${theme.appBorderColor}` } }));

export const SectionHead = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 22,
  padding: "0 8px 0 12px",
  fontSize: 11,
  fontWeight: 600,
  color: theme.color.defaultText,
}));

export const MoreButton = styled.button(({ theme }) => ({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: "1px 5px",
  borderRadius: 5,
  font: "inherit",
  fontWeight: 400,
  color: theme.textMutedColor,
  cursor: "pointer",
  "&:hover": { background: subtle(theme, true), color: theme.color.defaultText },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -1 },
}));

export const Row = styled.div<{ editable: boolean; open: boolean }>(({ theme, editable, open }) => ({
  display: "grid",
  gridTemplateColumns: "16px 50px minmax(0, 1fr) 14px",
  alignItems: "center",
  columnGap: 6,
  height: 26,
  margin: "1px 4px",
  padding: "0 6px 0 8px",
  borderRadius: 6,
  cursor: "pointer",
  outline: "none",
  background: open ? "rgba(13, 153, 255, 0.14)" : "transparent",
  boxShadow: open ? `inset 0 0 0 1px ${ACCENT}` : "none",
  color: editable ? theme.color.defaultText : theme.textMutedColor,
  "&:hover": { background: open ? "rgba(13, 153, 255, 0.14)" : subtle(theme, editable) },
  "&:focus-visible": { boxShadow: `inset 0 0 0 2px ${ACCENT}` },
}));

export const RowIcon = styled.span(({ theme }) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", color: theme.textMutedColor, fontSize: 10, fontWeight: 700 }));

export const RowLabel = styled.span<{ stepper?: boolean }>(({ theme, stepper }) => ({
  color: theme.textMutedColor,
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  userSelect: "none",
  touchAction: "none",
  // `stepper`, not `draggable`: that one is an HTML attribute, and the browser's own drag-and-drop would take the pointer away.
  cursor: stepper ? "ew-resize" : "inherit",
}));

export const RowValue = styled.span({ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontVariantNumeric: "tabular-nums" });

// A value keeps its width (a number is only useful whole); the token pill beside it gives way first.
export const ValueText = styled.span({ flex: "0 0 auto", maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

export const Swatch = styled.span<{ color: string }>(({ theme, color }) => ({
  flex: "0 0 auto",
  display: "inline-block",
  width: 12,
  height: 12,
  borderRadius: 3,
  background: color,
  boxShadow: `inset 0 0 0 1px ${isLight(theme) ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.28)"}`,
}));

export const TokenPill = styled.span<{ tone: "token" | "staged" | "muted" }>(({ theme, tone }) => ({
  flex: "0 1 auto",
  minWidth: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  maxWidth: "100%",
  height: 18,
  padding: "0 6px",
  borderRadius: 5,
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  background: tone === "staged" ? "rgba(13, 153, 255, 0.18)" : subtle(theme, tone === "token"),
  color: tone === "staged" ? ACCENT : tone === "muted" ? theme.textMutedColor : theme.color.defaultText,
  boxShadow: tone === "staged" ? `inset 0 0 0 1px rgba(13, 153, 255, 0.55)` : "none",
  "& > span:last-of-type": { overflow: "hidden", textOverflow: "ellipsis" },
}));

export const RowState = styled.span<{ tone?: "warn" | "muted" }>(({ theme, tone }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: tone === "warn" ? "#E8590C" : theme.textMutedColor,
  opacity: tone === "warn" ? 1 : 0.7,
}));

// ---- the popover of a row --------------------------------------------------------------

export const Pop = styled.div(({ theme }) => ({
  position: "absolute",
  zIndex: 2,
  width: POP_WIDTH,
  display: "flex",
  flexDirection: "column",
  background: theme.background.content,
  color: theme.color.defaultText,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 10,
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)",
  overflow: "hidden",
}));

export const PopHead = styled.div({ display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 10px", fontWeight: 600 });

export const PopTitle = styled.span({ marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

export const Note = styled.div(({ theme }) => ({ padding: "0 10px 8px", color: theme.textMutedColor, fontSize: 11, lineHeight: 1.5 }));

export const Warn = styled.span({ color: "#E8590C" });

export const LinkButton = styled.button({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: 0,
  font: "inherit",
  color: ACCENT,
  cursor: "pointer",
  "&:hover": { textDecoration: "underline" },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: 1 },
});

export const Segmented = styled.div(({ theme }) => ({
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "1fr",
  gap: 2,
  margin: "0 10px 4px",
  padding: 2,
  borderRadius: 7,
  background: subtle(theme, true),
}));

export const Segment = styled.button<{ selected: boolean; available: boolean }>(({ theme, selected, available }) => ({
  appearance: "none",
  border: "none",
  height: 22,
  padding: "0 4px",
  borderRadius: 5,
  font: "inherit",
  fontSize: 11,
  fontWeight: selected ? 600 : 400,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  background: selected ? theme.background.content : "transparent",
  boxShadow: selected ? "0 1px 2px rgba(0, 0, 0, 0.25)" : "none",
  color: selected ? theme.color.defaultText : theme.textMutedColor,
  opacity: available ? 1 : 0.4,
  cursor: available && !selected ? "pointer" : "default",
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -1 },
}));

export const StepRow = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 4,
  margin: "0 10px 8px",
  padding: 2,
  borderRadius: 7,
  border: `1px solid ${theme.appBorderColor}`,
  "& > span": { flex: "1 1 auto", minWidth: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
}));

export const Search = styled.input(({ theme }) => ({
  appearance: "none",
  display: "block",
  width: "calc(100% - 20px)",
  height: 26,
  margin: "0 10px 6px",
  padding: "0 8px",
  borderRadius: 6,
  border: `1px solid ${theme.appBorderColor}`,
  background: (theme as { input?: { background?: string } }).input?.background ?? theme.background.app,
  color: theme.color.defaultText,
  font: "inherit",
  outline: "none",
  "&:focus": { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` },
  "&::placeholder": { color: theme.textMutedColor },
}));

export const Options = styled.div(({ theme }) => ({ flex: "1 1 auto", minHeight: 0, maxHeight: 236, overflowY: "auto", padding: "0 4px 6px", overscrollBehavior: "contain", ...scroll(theme) }));

export const Option = styled.div<{ active: boolean; disabled: boolean }>(({ theme, active, disabled }) => ({
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: 8,
  height: 26,
  padding: "0 8px",
  borderRadius: 6,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.55 : 1,
  background: active ? "rgba(13, 153, 255, 0.16)" : "transparent",
  "& > span:nth-of-type(2)": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  "& > span:last-of-type": { color: theme.textMutedColor, fontSize: 11, fontVariantNumeric: "tabular-nums", maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
}));

export const DevBlock = styled.div(({ theme }) => ({
  padding: "6px 10px 8px",
  borderTop: `1px solid ${theme.appBorderColor}`,
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10.5,
  lineHeight: 1.5,
  wordBreak: "break-all",
  userSelect: "text",
  maxHeight: 132,
  overflowY: "auto",
  ...scroll(theme),
  "& > div + div": { marginTop: 2 },
}));

// ---- staged changes and the report --------------------------------------------------------

// Never shrinks: the action bar at its bottom is always whole. Only the list above the bar scrolls.
export const ChangesBox = styled.div(({ theme }) => ({
  flex: "0 0 auto",
  display: "flex",
  flexDirection: "column",
  padding: "6px",
  borderTop: `1px solid ${theme.appBorderColor}`,
}));

export const ChangeScroll = styled.div(({ theme }) => ({
  flex: "0 1 auto",
  minHeight: 0,
  maxHeight: "min(38vh, 220px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  ...scroll(theme),
}));

export const ChangeRow = styled.div({ padding: "0 2px", "& + &": { marginTop: 1 } });

export const ChangeMain = styled.div({ display: "grid", gridTemplateColumns: "8px minmax(0, 1fr) 20px", alignItems: "center", columnGap: 6, minHeight: 24 });

export const Dot = styled.span<{ tone: string }>(({ theme, tone }) => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  justifySelf: "center",
  background: tone === "previewing" ? ACCENT : tone === "in-source" || tone === "verified" ? "#2F9E44" : tone === "conflict" || tone === "mismatch" || tone === "timeout" ? "#E8590C" : theme.textMutedColor,
}));

export const ChangeText = styled.span(({ theme }) => ({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "& > i": { fontStyle: "normal", color: theme.textMutedColor, marginRight: 6 },
  "& > s": { textDecoration: "none", color: theme.textMutedColor },
  "& > b": { fontWeight: 600 },
}));

export const Chip = styled.span<{ tone: string }>(({ theme, tone }) => ({
  display: "inline-block",
  marginLeft: 6,
  padding: "0 5px",
  borderRadius: 4,
  fontSize: 10.5,
  lineHeight: "16px",
  color: "#fff",
  background: tone === "previewing" ? ACCENT : tone === "in-source" || tone === "verified" ? "#2F9E44" : tone === "conflict" || tone === "mismatch" || tone === "timeout" ? "#E8590C" : theme.color.mediumdark,
}));

export const Detail = styled.div(({ theme }) => ({ margin: "0 0 2px 14px", color: theme.textMutedColor, fontSize: 11, lineHeight: 1.5, wordBreak: "break-word" }));

export const BarActions = styled.div({ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 6, padding: "0 2px" });

/** The line above the actions that says what the staged changes are: a preview, not yet in any file. */
export const PreviewState = styled.div(({ theme }) => ({
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 6,
  padding: "0 4px",
  color: theme.textMutedColor,
  fontSize: 11,
  "& > span:last-of-type": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
}));

export const Button = styled.button<{ primary?: boolean }>(({ theme, primary }) => ({
  appearance: "none",
  height: 24,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${primary ? ACCENT : theme.appBorderColor}`,
  background: primary ? ACCENT : "transparent",
  color: primary ? "#fff" : theme.color.defaultText,
  font: "inherit",
  fontSize: 11.5,
  fontWeight: primary ? 600 : 400,
  whiteSpace: "nowrap",
  cursor: "pointer",
  "&:hover:not(:disabled)": { background: primary ? "#0B87E0" : subtle(theme, true) },
  "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: 1 },
}));

export const ReportBox = styled.div({ padding: "2px 2px 0" });

export const ReportLine = styled.div({ display: "flex", alignItems: "center", gap: 6, minHeight: 26 });

export const Headline = styled.strong({ marginRight: "auto", fontWeight: 600, minWidth: 0 });

export const StatusIcon = styled.span<{ tone: string }>(({ theme, tone }) => ({
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  borderRadius: 8,
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  background: tone === "verified" ? "#2F9E44" : tone === "busy" ? ACCENT : tone === "error" || tone === "mismatch" || tone === "timeout" ? "#E8590C" : theme.color.mediumdark,
}));

export const Disclosure = styled.button<{ tone?: "attention" }>(({ theme, tone }) => ({
  appearance: "none",
  display: "flex",
  alignItems: "center",
  gap: 4,
  width: "100%",
  height: 22,
  padding: "0 2px",
  border: "none",
  borderRadius: 5,
  background: "transparent",
  color: tone === "attention" ? "#E8590C" : theme.textMutedColor,
  font: "inherit",
  fontSize: 11,
  textAlign: "left",
  cursor: "pointer",
  "&:hover": { color: tone === "attention" ? "#E8590C" : theme.color.defaultText },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: -1 },
  "& > span:first-of-type": { display: "inline-flex", width: 10, justifyContent: "center", fontSize: 9 },
  "& > span:nth-of-type(2)": { marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
}));

export const DisclosureBody = styled.div({ padding: "0 0 4px" });

// ---- notices and the empty state ------------------------------------------------------------

export const Notice = styled.div<{ tone?: "warning" | "info" }>(({ theme, tone }) => ({
  margin: "6px 8px 2px",
  padding: "6px 8px",
  borderRadius: 7,
  fontSize: 11,
  lineHeight: 1.5,
  background: tone === "info" ? subtle(theme, true) : "rgba(232, 89, 12, 0.14)",
  color: tone === "info" ? theme.color.defaultText : isLight(theme) ? "#B44708" : "#FFB48A",
  "& button": { marginTop: 4 },
}));

export const Guide = styled.div(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  gap: "8px 10px",
  padding: "14px 14px 16px",
  color: theme.textMutedColor,
}));

export const Key = styled.span(({ theme }) => ({
  justifySelf: "start",
  padding: "1px 7px",
  borderRadius: 6,
  border: `1px solid ${theme.appBorderColor}`,
  borderBottomWidth: 2,
  color: theme.color.defaultText,
  fontSize: 11,
  whiteSpace: "nowrap",
}));
