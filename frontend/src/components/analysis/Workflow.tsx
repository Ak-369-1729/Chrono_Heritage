import { Glyph } from "@/components/Glyph";

export const WORKFLOW = [
  { key: "hypothesis", label: "State the hypothesis", note: "before anything is computed" },
  { key: "inputs", label: "Validate inputs", note: "sources, conventions, uncertainty" },
  { key: "run", label: "Run", note: "snapshot, hash, queued job" },
  { key: "results", label: "Results and uncertainty", note: "intervals, sensitivity, warnings" },
  { key: "review", label: "Review and lineage", note: "human review, reruns, reports" },
] as const;
export type WorkflowStep = (typeof WORKFLOW)[number]["key"];

/** Where an analysis stands in the workflow. A sequence, so numbered; state is shown by glyph and text. */
export function Workflow({ current, failed = false }: { current: WorkflowStep; failed?: boolean }) {
  const idx = WORKFLOW.findIndex((w) => w.key === current);
  return (
    <nav aria-label="Analysis workflow" className="relative mb-8 overflow-x-auto">
      <ol className="flex min-w-max gap-0 border border-rule">
        {WORKFLOW.map((w, i) => {
          const state = i < idx ? "done" : i === idx ? (failed ? "failed" : "current") : "todo";
          return (
            <li key={w.key} aria-current={state === "current" ? "step" : undefined}
              className={`flex items-start gap-2.5 border-r border-rule px-4 py-3 last:border-r-0 ${state === "current" ? "bg-indigo-2" : ""}`}>
              <span className={`mt-1 ${state === "done" ? "text-copper-bright" : state === "current" ? "text-brass-bright" : state === "failed" ? "text-uncertain" : "text-mist"}`}>
                <Glyph kind={state === "done" ? "solid" : state === "current" ? "half" : state === "failed" ? "cross" : "hollow"} />
              </span>
              <span>
                <span className={`block text-sm ${state === "todo" ? "text-ivory-dim" : "text-ivory"}`}><span className="num mr-1 text-mist">{i + 1}</span>{w.label}</span>
                <span className="block text-2xs text-mist">{w.note}</span>
                <span className="sr-only">{state === "done" ? "completed" : state === "current" ? "current step" : state === "failed" ? "failed" : "not started"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
