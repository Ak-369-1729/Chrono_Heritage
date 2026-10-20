"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, IllustrativeTag, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { dateTime, deg, humanize } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { AnalysisRun } from "@/lib/types";

export default function AnalysesPage() {
  const { user, ready } = useAuth();
  const [status, setStatus] = useState("");
  const runs = useResource<{ analyses: AnalysisRun[] }>(`/analyses${status ? `?status=${status}` : ""}`);
  return (
    <main className="chamber">
      <PageHeader
        title="Analyses"
        lede="Single-site analyses compare a measured axis with a pre-stated astronomical hypothesis, propagating every documented uncertainty. Each run is an immutable snapshot."
        actions={<Link href="/analysis/new" className="btn btn-primary">New analysis</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor="st" className="text-ivory-dim">Status</label>
        <select id="st" className="field w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {["succeeded", "running", "queued", "failed"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        {ready && !user && <span className="text-xs text-mist">Analyses are private by default. Sign in to see your own.</span>}
      </div>
      {runs.loading && <Loading lines={5} />}
      {runs.error && <ErrorState error={runs.error} onRetry={runs.reload} />}
      {runs.data && (runs.data.analyses.length === 0 ? (
        <EmptyState title="No analyses yet" action={<Link href="/analysis/new" className="btn btn-primary">Start an analysis</Link>}>
          Choose an eligible site, state the hypothesis, and the platform reconstructs the sky and propagates the uncertainty.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead><tr><th scope="col">Site</th><th scope="col">Hypothesis target</th><th scope="col">Median residual</th><th scope="col">Status</th><th scope="col">Review</th><th scope="col">Created</th></tr></thead>
            <tbody>
              {runs.data.analyses.map((r) => (
                <tr key={r.id}>
                  <td><Link className="inline" href={`/analysis/${r.id}`}>{r.site_name ?? r.site_id ?? "Cross-site"}</Link> {r.is_illustrative && <IllustrativeTag className="ml-1" />}</td>
                  <td>{humanize(r.hypothesis.target_key.replace(/^sun_/, ""))}<span className="block text-2xs text-mist">{r.hypothesis.mode}</span></td>
                  <td className="num">{deg(r.summary?.residual_signed_median_deg, 2, true)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><StatusBadge status={r.review_status === "unreviewed" ? "unreviewed" : r.review_status} /></td>
                  <td className="num text-xs text-mist">{dateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </main>
  );
}
