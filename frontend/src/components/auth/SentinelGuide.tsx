"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function SentinelGuide() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogue = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogue.current?.querySelector<HTMLElement>("a,button")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <section className="sentinel-guide" aria-label="Observatory guide">
      <button ref={trigger} type="button" className="sentinel-trigger" aria-expanded={open}
        aria-controls="sentinel-dialogue" onClick={() => setOpen((value) => !value)}>
        <svg className="sentinel-portrait" viewBox="0 0 100 126" aria-hidden="true" focusable="false">
          <path d="M14 122c2-24 10-38 25-43h22c15 5 23 19 25 43H14Z" fill="#493845" stroke="#bd9872" strokeWidth="1.5" />
          <path d="M32 82 50 95l18-13-7-8H39Z" fill="#c39568" />
          <path d="M35 54c0-15 6-25 15-25s15 10 15 25v15c-4 8-10 12-15 12S39 77 35 69V54Z" fill="#b98665" />
          <path d="M29 46c-1-17 8-29 21-29s22 12 21 29c-5-6-10-8-20-8s-17 3-22 8Z" fill="#d5ac73" stroke="#f0d09a" strokeWidth="1.5" />
          <path d="M34 39c8-6 25-6 33 0M40 51h4m12 0h4m-15 14c3 2 8 2 11 0" fill="none" stroke="#3a2d32" strokeWidth="2" strokeLinecap="round" />
          <path d="m68 81 12 4v22l-12 7-12-7V85Z" fill="#382c34" stroke="#c39568" strokeWidth="1.5" />
          <path d="m68 88 4 8-4 8-4-8Z" fill="#ffe1a2" />
          <circle cx="68" cy="97" r="11" fill="#f5bd72" opacity=".16" />
        </svg>
        <span className="sentinel-copy">
          <span className="sentinel-kicker">At the threshold</span>
          <span className="heading block text-xl text-ivory">A guide to the observatory</span>
          <span className="mt-1 block text-sm text-ivory-dim">Ask where to begin, or go directly to a research tool.</span>
          <span className="btn-link mt-2 inline-block text-sm">{open ? "Close the guide" : "Speak with the guide"}</span>
        </span>
      </button>
      <div id="sentinel-dialogue" ref={dialogue} className="sentinel-dialogue" aria-live="polite" hidden={!open}>
        <p className="prose-serif text-[1.04rem] text-ivory">
          Welcome, researcher. The stones keep their histories, and the sky leaves its measures. Where shall we begin?
        </p>
        <p className="mt-2 text-sm text-ivory-dim">
          An account is needed to record sites or run analyses. You can browse the atlas and methods without signing in.
        </p>
        <nav aria-label="Guide destinations" className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link className="btn btn-quiet justify-start" href="/analysis/new">Enter the Observatory</Link>
          <Link className="btn btn-quiet justify-start" href="/atlas">Explore the Atlas</Link>
          <Link className="btn btn-quiet justify-start" href="/documentation">Consult the Archive</Link>
          <Link className="btn btn-quiet justify-start" href="/sky">Read the Sky</Link>
        </nav>
        <button type="button" className="btn-link mt-4 text-sm" onClick={() => { setOpen(false); trigger.current?.focus(); }}>
          Dismiss guide
        </button>
      </div>
    </section>
  );
}
