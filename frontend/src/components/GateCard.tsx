import type { Gate } from "@/lib/types";
import { Glyph } from "./Glyph";
import { StatusBadge } from "./ui";

export const gateLabel = (s: string) =>
  ({ passed: "Satisfied", failed: "Not met (closed)", pending: "Pending", not_evaluated: "Not evaluated", omitted: "Omitted" } as Record<string, string>)[s];

/** A formal gate with each condition and its evidence state (met / not met / not yet evaluable). */
export function GateCard({ gate, compact = false }: { gate: Gate; compact?: boolean }) {
  return (
    <section aria-label={gate.title} className="niche p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="heading text-lg">{gate.title}</h3>
        <StatusBadge status={gate.status} label={gateLabel(gate.status)} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {gate.conditions.map((c) => (
          <li key={c.key} className="grid grid-cols-[1.1rem_1fr] items-baseline gap-2">
            <span className={c.met === true ? "text-copper-bright" : c.met === false ? "text-uncertain" : "text-mist"}>
              <Glyph kind={c.met === true ? "solid" : c.met === false ? "cross" : "hollow"} />
            </span>
            <span>
              <span className="text-ivory">{c.label}</span>
              <span className="sr-only">: {c.met === true ? "met" : c.met === false ? "not met" : "not yet evaluable"}</span>
              {c.detail && !compact && <span className="block text-xs text-mist">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {!compact && gate.status !== "passed" && gate.fail_action && (
        <p className="mt-3 text-xs text-ivory-dim">If this gate fails: {gate.fail_action}</p>
      )}
    </section>
  );
}
