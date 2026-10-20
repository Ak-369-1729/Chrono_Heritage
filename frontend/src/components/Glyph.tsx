/** Status glyphs drawn with CSS so shape (not only colour) carries meaning, independent of font coverage. */
export type GlyphKind = "solid" | "half" | "hollow" | "cross" | "blocked" | "diamond" | "dash";

export function Glyph({ kind }: { kind: GlyphKind }) {
  const base = "inline-block h-[0.6rem] w-[0.6rem] shrink-0";
  switch (kind) {
    case "solid":
      return <span aria-hidden className={`${base} rounded-full bg-current`} />;
    case "half":
      return <span aria-hidden className={`${base} rounded-full border border-current`} style={{ background: "linear-gradient(90deg, currentColor 50%, transparent 50%)" }} />;
    case "hollow":
      return <span aria-hidden className={`${base} rounded-full border border-current`} />;
    case "cross":
      return (
        <span aria-hidden className={`${base} relative`}>
          <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 rotate-45 bg-current" />
          <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 -rotate-45 bg-current" />
        </span>
      );
    case "blocked":
      return (
        <span aria-hidden className={`${base} relative rounded-full border border-current`}>
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-current" />
        </span>
      );
    case "diamond":
      return <span aria-hidden className="inline-block h-[0.45rem] w-[0.45rem] shrink-0 rotate-45 border border-current" />;
    default:
      return <span aria-hidden className="inline-block h-px w-[0.55rem] shrink-0 bg-current" />;
  }
}
