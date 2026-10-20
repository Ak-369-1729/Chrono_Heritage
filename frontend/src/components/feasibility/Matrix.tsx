"use client";

import { useState } from "react";
import { num } from "@/lib/format";
import type { Compatibility, CompatPair } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  matched: "text-verdigris", convertible: "text-gold-bright", uncertain: "text-sky", incompatible: "text-terracotta",
};

/** Pairwise convention-compatibility matrix. Each cell shows the score as text; "!" marks a critical mismatch. */
export function CompatibilityMatrix({ data, labels }: { data: Compatibility; labels: Record<string, string> }) {
  const ids = Array.from(new Set(data.pairs.flatMap((p) => [p.a, p.b])));
  const find = (a: string, b: string) => data.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  const [open, setOpen] = useState<CompatPair | null>(data.pairs.find((p) => p.critical_blockers.length) ?? data.pairs[0] ?? null);
  const shade = (s: number) => `rgba(194,154,69,${0.08 + s * 0.42})`;

  return (
    <div className="grid gap-6">
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <caption className="sr-only">Pair scores between candidate sites. Select a cell to see field-level reasons.</caption>
          <thead>
            <tr>
              <th scope="col" className="p-1" />
              {ids.map((id) => <th key={id} scope="col" className="max-w-[6.5rem] p-1 text-left align-bottom font-normal text-ivory-dim"><span className="block truncate" title={labels[id]}>{labels[id]?.replace(" (illustrative)", "")}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {ids.map((a) => (
              <tr key={a}>
                <th scope="row" className="max-w-[9rem] truncate p-1 pr-2 text-left font-normal text-ivory-dim" title={labels[a]}>{labels[a]?.replace(" (illustrative)", "")}</th>
                {ids.map((b) => {
                  if (a === b) return <td key={b} className="h-11 w-[6.5rem] border border-rule bg-obsidian text-center text-mist">—</td>;
                  const p = find(a, b)!;
                  const blocked = p.critical_blockers.length > 0;
                  const isOpen = open === p;
                  return (
                    <td key={b} className="h-11 w-[6.5rem] border border-rule p-0">
                      <button
                        className={`num flex h-full w-full items-center justify-center gap-1 ${isOpen ? "outline outline-2 -outline-offset-2 outline-gold-bright" : ""}`}
                        style={{ background: shade(p.score) }}
                        aria-pressed={isOpen}
                        aria-label={`${labels[a]} and ${labels[b]}: score ${num(p.score, 2)}${blocked ? ", critical mismatch" : ""}`}
                        onClick={() => setOpen(p)}
                      >
                        {num(p.score, 2)}{blocked && <span className="font-semibold text-terracotta">!</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-2xs text-mist">Score 0–1 (formula {data.formula_version}). “!” marks an unresolved critical mismatch, which blocks pooling regardless of score.</p>
      </div>
      {open && (
        <div className="min-w-0">
          <p className="text-sm text-ivory">{labels[open.a]} × {labels[open.b]} <span className="num ml-2 text-mist">score {num(open.score, 3)}</span></p>
          <div className="table-frame"><table className="dtable mt-2">
            <thead><tr><th scope="col">Field</th><th scope="col">Status</th><th scope="col">Reason</th></tr></thead>
            <tbody>
              {open.fields.map((f) => (
                <tr key={f.field}>
                  <td>{f.field.replace(/_/g, " ")}{f.critical && <span className="ml-1 text-2xs text-gold-bright">critical</span>}</td>
                  <td className={STATUS_TEXT[f.status]}>{f.status}</td>
                  <td className="text-ivory-dim">{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
