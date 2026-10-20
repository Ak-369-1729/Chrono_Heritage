"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import { bytes } from "@/lib/format";
import { Glyph, type GlyphKind } from "./Glyph";
import { Arch, ScaleRule } from "./motifs";

/* ------------------------------------------------------------------ status
   Every state is conveyed by text and glyph shape, with colour as a third cue. */

type Tone = "ok" | "gold" | "data" | "warn" | "bad" | "muted";
const TONE: Record<Tone, string> = {
  ok: "text-verdigris border-verdigris/50",
  gold: "text-gold-bright border-gold/50",
  data: "text-sky border-sky/50",
  warn: "text-terracotta border-terracotta/60",
  bad: "text-terracotta border-terracotta",
  muted: "text-mist border-rule",
};

const STATUS: Record<string, { label: string; tone: Tone; glyph: GlyphKind }> = {
  passed: { label: "Passed", tone: "ok", glyph: "solid" },
  pass: { label: "Pass", tone: "ok", glyph: "solid" },
  succeeded: { label: "Completed", tone: "ok", glyph: "solid" },
  reviewed: { label: "Reviewed", tone: "ok", glyph: "solid" },
  validated: { label: "Validated", tone: "ok", glyph: "solid" },
  eligible: { label: "Eligible", tone: "ok", glyph: "solid" },
  qualified: { label: "Qualified", tone: "ok", glyph: "solid" },
  pending: { label: "Pending", tone: "gold", glyph: "half" },
  proposed: { label: "Proposed, unreviewed", tone: "gold", glyph: "half" },
  queued: { label: "Queued", tone: "gold", glyph: "half" },
  running: { label: "Calculating", tone: "gold", glyph: "half" },
  submitted: { label: "Submitted", tone: "gold", glyph: "half" },
  unverified: { label: "Unverified", tone: "gold", glyph: "half" },
  unreviewed: { label: "Unreviewed", tone: "gold", glyph: "half" },
  not_evaluated: { label: "Not evaluated", tone: "muted", glyph: "hollow" },
  missing: { label: "Missing", tone: "warn", glyph: "hollow" },
  blocked: { label: "Blocked", tone: "warn", glyph: "blocked" },
  excluded: { label: "Excluded", tone: "warn", glyph: "blocked" },
  ineligible: { label: "Not eligible", tone: "warn", glyph: "blocked" },
  failed: { label: "Failed", tone: "bad", glyph: "cross" },
  fail: { label: "Fail", tone: "bad", glyph: "cross" },
  rejected: { label: "Rejected", tone: "bad", glyph: "cross" },
  omitted: { label: "Omitted", tone: "muted", glyph: "dash" },
  illustrative: { label: "Illustrative", tone: "data", glyph: "diamond" },
  exploratory: { label: "Exploratory", tone: "data", glyph: "diamond" },
};

export function StatusBadge({ status, label, title }: { status: string; label?: string; title?: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "muted" as Tone, glyph: "dash" as GlyphKind };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 py-px text-2xs font-medium ${TONE[s.tone]}`}
    >
      <Glyph kind={s.glyph} />
      {label ?? s.label}
    </span>
  );
}

export function IllustrativeTag({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <StatusBadge status="illustrative" title="Fictional demonstration data. Never counted as evidence." />
    </span>
  );
}

/* ---------------------------------------------------------------- notices */

const NOTICE: Record<string, { border: string; label: string; text: string }> = {
  critical: { border: "border-terracotta", label: "Critical", text: "text-terracotta" },
  warning: { border: "border-terracotta/60", label: "Warning", text: "text-terracotta" },
  info: { border: "border-sky/60", label: "Note", text: "text-sky" },
  ok: { border: "border-verdigris/60", label: "Done", text: "text-verdigris" },
  blocked: { border: "border-terracotta", label: "Blocked", text: "text-terracotta" },
};

export function Notice({ tone = "info", title, children }: { tone?: keyof typeof NOTICE; title?: string; children?: ReactNode }) {
  const n = NOTICE[tone];
  return (
    <div role={tone === "critical" || tone === "blocked" ? "alert" : "note"} className={`border-l-2 ${n.border} bg-night/60 py-2 pl-3 pr-3 text-sm`}>
      <p className="text-ivory">
        <span className={`mr-2 font-medium ${n.text}`}>{title ?? n.label}</span>
        {children}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- layout */

/**
 * Chamber header: every route opens like a doorway in the same fortress — the title framed by a cusped arch
 * niche (drawn, decorative), the lede, actions, and an engraved scale rule in place of a plain divider.
 */
export function PageHeader({ title, lede, actions, aside, crumbs }: {
  title: string; lede?: ReactNode; actions?: ReactNode; aside?: ReactNode; crumbs?: { href: string; label: string }[];
}) {
  return (
    <header className="relative mb-9">
      <Arch width={150} height={190} lobes={7} strokeWidth={1}
        className="pointer-events-none absolute -top-6 right-0 hidden h-[13.5rem] w-auto opacity-35 lg:block" />
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-mist">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c) => (
              <li key={c.href} className="flex items-center gap-1.5">
                <Link href={c.href} className="hover:text-ivory">{c.label}</Link>
                <span aria-hidden className="text-sandstone-dim">/</span>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <h1 className="heading text-[2rem] leading-[1.08] text-ivory sm:text-[2.4rem] md:text-[2.8rem]">{title}</h1>
          {lede && <div className="mt-3 max-w-2xl text-[0.98rem] text-ivory-dim">{lede}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 lg:mr-44">{actions}</div>}
      </div>
      <ScaleRule className="mt-6" />
      {aside && <div className="mt-4">{aside}</div>}
    </header>
  );
}

export function Panel({ title, meta, children, id, className = "", framed = false }: {
  title?: string; meta?: ReactNode; children: ReactNode; id?: string; className?: string; framed?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-h` : undefined}
      className={`${framed ? "niche p-4 md:p-5" : "rule-t pt-4"} scroll-mt-24 ${className}`}>
      {(title || meta) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 id={id ? `${id}-h` : undefined} className="heading text-lg text-ivory md:text-xl">{title}</h2>}
          {meta && <div className="text-xs text-mist">{meta}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function KeyValue({ rows, cols = 1 }: { rows: [ReactNode, ReactNode][]; cols?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-8 text-sm ${cols === 2 ? "md:grid-cols-2" : ""}`}>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(8rem,38%)_1fr] gap-3 border-b border-rule/70 py-1.5">
          <dt className="text-ivory-dim">{k}</dt>
          <dd className="num min-w-0 break-words text-ivory">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule px-5 py-8 text-center">
      <p className="heading text-lg text-ivory">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ivory-dim">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const e = error as ApiError;
  return (
    <div role="alert" className="border-l-2 border-terracotta bg-night/60 px-4 py-3 text-sm">
      <p className="font-medium text-terracotta">{e.status === 404 ? "Not found" : e.status === 403 || e.status === 401 ? "Not permitted" : "Something went wrong"}</p>
      <p className="mt-1 text-ivory">{e.message}</p>
      {e.errors?.length ? (
        <ul className="mt-2 list-disc pl-5 text-ivory-dim">
          {e.errors.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : null}
      {e.status === 401 && <p className="mt-2 text-ivory-dim"><Link className="inline" href="/login">Sign in</Link> or <Link className="inline" href="/register">create an account</Link> to continue.</p>}
      {onRetry && <button className="btn btn-quiet mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Loading({ label = "Loading", lines = 4 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/** Calculation in progress: a sweeping azimuth needle, not a fake percentage bar. */
export function Calculating({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-ivory-dim">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
        <circle cx="14" cy="14" r="12" fill="none" stroke="var(--color-rule)" />
        <line x1="14" y1="14" x2="14" y2="3" stroke="var(--color-gold)" strokeWidth="1.5">
          <animateTransform attributeName="transform" type="rotate" from="0 14 14" to="360 14 14" dur="1.8s" repeatCount="indefinite" />
        </line>
        <circle cx="14" cy="14" r="1.6" fill="var(--color-gold)" />
      </svg>
      {label}
    </div>
  );
}

export function CopyButton({ text, label = "Copy", done = "Copied" }: { text: string; label?: string; done?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  return (
    <button
      type="button"
      className="btn btn-quiet px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("error");
        }
        setTimeout(() => setState("idle"), 1600);
      }}
    >
      <span aria-live="polite">{state === "done" ? done : state === "error" ? "Copy failed" : label}</span>
    </button>
  );
}

type DlState = { phase: "idle" } | { phase: "loading" } | { phase: "done"; name: string; size: number; verified: boolean | null } | { phase: "error"; message: string };

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null; // only available on HTTPS or localhost
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Report downloads with visible progress, a confirmation naming the saved file, a checksum check against the
 * SHA-256 recorded by the server (where the browser allows it), and a retry on failure.
 */
export function DownloadLinks({ files }: { files: Record<string, { url: string; size: number; sha256: string }> }) {
  const order = ["pdf", "csv", "json"].filter((k) => files[k]);
  const [state, setState] = useState<Record<string, DlState>>({});
  const get = async (fmt: string) => {
    const f = files[fmt];
    setState((s) => ({ ...s, [fmt]: { phase: "loading" } }));
    try {
      const res = await fetch(f.url, { credentials: "same-origin", headers: { "x-chronoheritage-client": "web" } });
      if (!res.ok) {
        let msg = `The server answered ${res.status}.`;
        try {
          const j = await res.json();
          msg = j?.detail?.message ?? msg;
        } catch { /* not JSON */ }
        throw new Error(msg);
      }
      const buf = await res.arrayBuffer();
      const hex = await sha256Hex(buf);
      const verified = hex === null ? null : hex === f.sha256;
      const cd = res.headers.get("content-disposition") ?? "";
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1] ?? `chronoheritage-report.${fmt}`;
      const blob = new Blob([buf], { type: res.headers.get("content-type") ?? "application/octet-stream" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = decodeURIComponent(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      setState((s) => ({ ...s, [fmt]: { phase: "done", name: decodeURIComponent(name), size: buf.byteLength, verified } }));
    } catch (e) {
      setState((s) => ({ ...s, [fmt]: { phase: "error", message: e instanceof Error ? e.message : String(e) } }));
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {order.map((fmt) => {
          const st = state[fmt] ?? { phase: "idle" };
          return (
            <button key={fmt} type="button" onClick={() => void get(fmt)} disabled={st.phase === "loading"}
              className="btn btn-quiet btn-sm" title={`SHA-256 ${files[fmt].sha256}`}>
              {st.phase === "loading" ? `Downloading ${fmt.toUpperCase()}…` : `Download ${fmt.toUpperCase()}`}{" "}
              <span className="text-mist">{bytes(files[fmt].size)}</span>
            </button>
          );
        })}
      </div>
      <ul aria-live="polite" className="space-y-1 text-xs">
        {order.map((fmt) => {
          const st = state[fmt];
          if (!st || st.phase === "idle" || st.phase === "loading") return null;
          if (st.phase === "error")
            return (
              <li key={fmt} role="alert" className="flex flex-wrap items-center gap-2 text-uncertain">
                <Glyph kind="cross" /> {fmt.toUpperCase()} download failed: {st.message}
                <button type="button" className="btn-link text-xs" onClick={() => void get(fmt)}>Try again</button>
              </li>
            );
          return (
            <li key={fmt} className={`flex flex-wrap items-center gap-2 ${st.verified === false ? "text-uncertain" : "text-copper-bright"}`}>
              <Glyph kind={st.verified === false ? "cross" : "solid"} />
              Saved {st.name} ({bytes(st.size)}).{" "}
              {st.verified === true ? "Checksum matches the recorded SHA-256." : st.verified === false ? "Checksum does NOT match the recorded SHA-256: do not use this file." : "Checksum not verified (the browser only allows it over HTTPS or on localhost)."}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SignInPrompt({ action }: { action: string }) {
  return (
    <Notice tone="info" title="Sign in required">
      <Link className="inline" href="/login">Sign in</Link> or <Link className="inline" href="/register">create a researcher account</Link> to {action}.
    </Notice>
  );
}

/** Labelled form control. ``error`` is announced and linked to the control via aria-describedby. */
export function Field({ label, hint, children, htmlFor, error, required }: {
  label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; error?: string | null; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[0.8125rem] font-medium text-ivory-dim">
        <span className={required ? "required-mark" : undefined}>{label}</span>
      </label>
      {children}
      {hint && <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-2xs text-mist">{hint}</p>}
      {error && <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="flex items-start gap-1.5 text-xs text-uncertain"><Glyph kind="blocked" /> <span>{error}</span></p>}
    </div>
  );
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, { hint, error }: { hint?: boolean; error?: string | null }) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { id, "aria-invalid": error ? (true as const) : undefined, "aria-describedby": ids || undefined };
}
