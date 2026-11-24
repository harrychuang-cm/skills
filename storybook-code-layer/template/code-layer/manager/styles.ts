// Panel primitives styled with the Storybook manager theme (no CSS imports).
import { styled } from "storybook/theming";

export const ACCENT = "#0D99FF";

export const Wrap = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  fontFamily: theme.typography.fonts.base,
  fontSize: theme.typography.size.s2,
  color: theme.color.defaultText,
  background: theme.background.content,
}));

export const Body = styled.div({ flex: "1 1 auto", minHeight: 0, overflow: "auto", padding: "8px 0 16px" });

export const Message = styled.p(({ theme }) => ({
  margin: 0,
  padding: "16px",
  lineHeight: 1.6,
  color: theme.textMutedColor,
}));

export const Banner = styled.div(({ theme }) => ({
  margin: "0 12px 8px",
  padding: "6px 10px",
  borderRadius: 4,
  background: theme.background.warning,
  color: theme.color.warningText,
  fontSize: theme.typography.size.s1,
  lineHeight: 1.5,
}));

export const HeaderBox = styled.div(({ theme }) => ({
  padding: "4px 12px 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
}));

export const Title = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontWeight: theme.typography.weight.bold,
  fontSize: theme.typography.size.s3,
}));

export const Meta = styled.div(({ theme }) => ({
  marginTop: 2,
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  lineHeight: 1.5,
  wordBreak: "break-all",
}));

export const SectionTitle = styled.div(({ theme }) => ({
  padding: "12px 12px 4px",
  fontSize: theme.typography.size.s1,
  fontWeight: theme.typography.weight.bold,
  color: theme.textMutedColor,
  letterSpacing: "0.02em",
}));

export const RowBox = styled.div<{ editable: boolean; open: boolean }>(({ theme, editable, open }) => ({
  margin: "0 6px",
  padding: "6px",
  borderRadius: 4,
  background: open ? theme.background.hoverable : "transparent",
  cursor: editable ? "pointer" : "default",
  "&:hover": editable ? { background: theme.background.hoverable } : {},
}));

export const RowMain = styled.div({ display: "grid", gridTemplateColumns: "64px 1fr auto", alignItems: "center", gap: 8 });

export const RowLabel = styled.span(({ theme }) => ({ color: theme.textMutedColor }));

export const Value = styled.span({ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, fontVariantNumeric: "tabular-nums" });

export const Swatch = styled.span<{ color: string }>(({ theme, color }) => ({
  width: 14,
  height: 14,
  flex: "0 0 auto",
  borderRadius: 3,
  background: color,
  boxShadow: `inset 0 0 0 1px ${theme.appBorderColor}`,
}));

export const Pill = styled.span<{ tone: "token" | "staged" | "muted" }>(({ theme, tone }) => ({
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "1px 6px",
  borderRadius: 10,
  fontSize: theme.typography.size.s1,
  background: tone === "staged" ? ACCENT : tone === "token" ? theme.background.hoverable : "transparent",
  color: tone === "staged" ? "#fff" : tone === "muted" ? theme.textMutedColor : theme.color.defaultText,
  border: tone === "muted" ? `1px solid ${theme.appBorderColor}` : "none",
}));

export const Detail = styled.div(({ theme }) => ({
  marginTop: 3,
  marginLeft: 72,
  fontSize: theme.typography.size.s1,
  lineHeight: 1.5,
  color: theme.textMutedColor,
  wordBreak: "break-all",
}));

export const Warn = styled.span(({ theme }) => ({ color: theme.color.warningText }));

export const Picker = styled.div(({ theme }) => ({
  margin: "6px 0 2px 72px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  background: theme.background.content,
  overflow: "hidden",
}));

export const Search = styled.input(({ theme }) => ({
  width: "100%",
  boxSizing: "border-box",
  border: 0,
  borderBottom: `1px solid ${theme.appBorderColor}`,
  padding: "6px 8px",
  font: "inherit",
  color: "inherit",
  background: "transparent",
  outline: "none",
}));

export const Options = styled.div({ maxHeight: 260, overflow: "auto" });

export const Option = styled.div<{ active: boolean }>(({ theme, active }) => ({
  display: "grid",
  gridTemplateColumns: "16px 1fr auto",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  cursor: "pointer",
  background: active ? theme.background.hoverable : "transparent",
  fontSize: theme.typography.size.s1,
}));

export const Footer = styled.div(({ theme }) => ({
  flex: "0 0 auto",
  borderTop: `1px solid ${theme.appBorderColor}`,
  padding: "8px 12px",
  background: theme.background.app,
}));

export const FooterBar = styled.div({ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" });

export const Change = styled.div(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 6,
  padding: "6px 0",
  borderBottom: `1px dashed ${theme.appBorderColor}`,
  fontSize: theme.typography.size.s1,
  lineHeight: 1.5,
}));

export const Chip = styled.span<{ tone: string }>(({ theme, tone }) => ({
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 8,
  fontSize: 11,
  color: "#fff",
  background:
    tone === "previewing" ? ACCENT : tone === "in-source" || tone === "verified" ? "#2E7D32" : tone === "conflict" || tone === "mismatch" || tone === "timeout" ? "#C2410C" : theme.color.mediumdark,
}));

export const SmallButton = styled.button<{ primary?: boolean }>(({ theme, primary }) => ({
  appearance: "none",
  border: `1px solid ${primary ? ACCENT : theme.appBorderColor}`,
  background: primary ? ACCENT : theme.background.content,
  color: primary ? "#fff" : theme.color.defaultText,
  borderRadius: 4,
  padding: "3px 10px",
  font: "inherit",
  fontSize: theme.typography.size.s1,
  cursor: "pointer",
  "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
  "&:focus-visible": { outline: `2px solid ${ACCENT}`, outlineOffset: 1 },
}));
