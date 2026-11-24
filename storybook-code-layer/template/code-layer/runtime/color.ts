// Colour normalisation for display: any CSS colour -> #RRGGBB or #RRGGBBAA.
let context: CanvasRenderingContext2D | null = null;

export function toHex(color: string): string | null {
  if (!context) context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.fillStyle = "#010203";
  context.fillStyle = color;
  const value = String(context.fillStyle);
  if (value === "#010203" && !/^#?010203$/i.test(color.trim())) return null;
  if (value.startsWith("#")) return value.toUpperCase();
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (!match) return null;
  const [r, g, b, a = "1"] = match[1].split(",").map((part) => part.trim());
  const hex = [r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
  const alpha = Number(a);
  return alpha >= 1 ? `#${hex}` : `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}
