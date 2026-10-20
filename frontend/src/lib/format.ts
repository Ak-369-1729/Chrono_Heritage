/** Formatting helpers. Years use astronomical numbering (0 = 1 BCE). */

export function yearLabel(y: number | null | undefined): string {
  if (y === null || y === undefined || Number.isNaN(y)) return "—";
  const r = Math.round(y);
  return r > 0 ? `${r} CE` : `${1 - r} BCE`;
}

export function deg(v: number | null | undefined, digits = 2, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s.replace("-", "−")}°`;
}

export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits).replace("-", "−");
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const humanize = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "—");

/** Directed residual in [−180, 180). Mirrors app.science.angles.signed_residual. */
export function signedResidual(observed: number, predicted: number): number {
  return ((((observed - predicted + 180) % 360) + 360) % 360) - 180;
}

/** Axial residual in [−90, 90). Mirrors app.science.angles.axial_signed_residual. */
export function axialResidual(observed: number, predicted: number): number {
  return ((((observed - predicted + 90) % 180) + 180) % 180) - 90;
}

export function residual(observed: number, predicted: number, mode: "directed" | "bidirectional"): number {
  return mode === "directed" ? signedResidual(observed, predicted) : axialResidual(observed, predicted);
}

export function shortHash(h: string | null | undefined, n = 12): string {
  return h ? `${h.slice(0, n)}…` : "—";
}
