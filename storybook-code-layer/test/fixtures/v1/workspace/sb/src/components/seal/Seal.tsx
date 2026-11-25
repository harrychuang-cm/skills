import "./Seal.css";

export type SealProps = {
  label: string;
  /** default: the primary square. */
  variant?: "default" | "vertical" | "stamp" | "ribbon";
};

export function Seal({ label, variant = "default" }: SealProps) {
  const className = variant === "default" ? "fx-seal" : `fx-seal fx-seal--${variant}`;
  return (
    <span className={className} data-component="seal" data-variant={variant}>
      <span className="fx-seal__label">{label}</span>
    </span>
  );
}
