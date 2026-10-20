"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import { Mark } from "./motifs";

export const NAV_GROUPS: { label: string; links: { href: string; label: string; note: string }[] }[] = [
  {
    label: "Research",
    links: [
      { href: "/atlas", label: "Atlas", note: "Site registry and map" },
      { href: "/sky", label: "Sky Explorer", note: "Reconstruct a historical sky" },
      { href: "/analysis", label: "Analysis", note: "Hypotheses, runs and results" },
      { href: "/reports", label: "Reports", note: "PDF, CSV and JSON exports" },
    ],
  },
  {
    label: "Evidence",
    links: [
      { href: "/feasibility", label: "Feasibility", note: "Is the dataset good enough?" },
      { href: "/benchmarks", label: "Benchmarks", note: "Independent reference checks" },
      { href: "/compare", label: "Compare", note: "Measured workflow sessions" },
      { href: "/gates", label: "Gates", note: "What has been shown, and what has not" },
    ],
  },
  { label: "Method", links: [{ href: "/documentation", label: "Documentation", note: "Definitions, assumptions, limits" }] },
];
const LINKS = NAV_GROUPS.flatMap((g) => g.links);

export const MENU_LABEL = "Menu";

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, signOut, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);
  const overHero = pathname === "/";

  useEffect(() => {
    if (!overHero) return;
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overHero]);

  useEffect(() => {
    setOpen(false);
    setAcct(false);
  }, [pathname]);

  // Mobile menu: Escape closes and returns focus; Tab stays inside the open panel.
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("a,button")].filter((x) => !x.hasAttribute("disabled"));
        const all = menuBtn.current ? [menuBtn.current, ...items] : items;
        const i = all.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          all[all.length - 1]?.focus();
        } else if (!e.shiftKey && i === all.length - 1) {
          e.preventDefault();
          all[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Account popover: close on Escape or outside click.
  useEffect(() => {
    if (!acct) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcct(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAcct(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [acct]);

  const solid = !overHero || scrolled || open;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/atlas" && pathname.startsWith("/sites"));
  const doSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "border-b border-rule bg-obsidian/92 backdrop-blur-sm" : "border-b border-transparent bg-transparent"}`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:bg-brass focus:px-3 focus:py-2 focus:text-obsidian">
        Skip to content
      </a>
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-[1400px] items-center gap-5" style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter-r)" }}>
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-ivory" aria-label="ChronoHeritage home">
          <Mark size={30} />
          <span className="inscription text-[0.95rem] sm:text-[1.02rem]">CHRONOHERITAGE</span>
        </Link>
        <ul className="hidden flex-1 items-center justify-center gap-0.5 min-[1360px]:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active(l.href) ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-xs px-2.5 py-2 text-[0.8125rem] transition-colors ${active(l.href) ? "text-ivory" : "text-ivory-dim hover:text-ivory"}`}
              >
                {l.label}
                {active(l.href) && <span aria-hidden className="absolute inset-x-2.5 -bottom-[13px] h-[2px] bg-brass" />}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2 min-[1360px]:ml-0">
          {ready && user ? (
            <div ref={acctRef} className="relative hidden md:block">
              <button className="btn btn-quiet btn-sm" aria-expanded={acct} aria-controls="account-menu" onClick={() => setAcct((a) => !a)}>
                <span className="max-w-[10rem] truncate">{user.display_name}</span>
                <span className="text-mist">{ROLE_LABEL[user.role]}</span>
              </button>
              {acct && (
                <div id="account-menu" className="niche absolute right-0 top-[calc(100%+8px)] w-64 bg-indigo p-2 text-sm shadow-[0_18px_40px_rgba(0,0,0,.45)]">
                  <p className="truncate px-2 pb-2 pt-1 text-xs text-mist" title={user.email}>{user.email}</p>
                  {user.pending_role_request && (
                    <p className="mx-2 mb-2 border-l-2 border-brass pl-2 text-xs text-ivory-dim">
                      {ROLE_LABEL[user.pending_role_request.requested_role]} request pending
                    </p>
                  )}
                  <Link href="/account" className="block rounded-xs px-2 py-2 hover:bg-indigo-2">Account and preferences</Link>
                  {can("admin") && <Link href="/admin" className="block rounded-xs px-2 py-2 hover:bg-indigo-2">Users and role requests</Link>}
                  <button className="block w-full rounded-xs px-2 py-2 text-left hover:bg-indigo-2" onClick={() => void doSignOut()}>Sign out</button>
                </div>
              )}
            </div>
          ) : ready ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="btn btn-sm px-2 text-ivory-dim hover:text-ivory">Sign in</Link>
              <Link href="/register" className="btn btn-quiet btn-sm">Create account</Link>
            </div>
          ) : null}
          <Link href="/analysis/new" className="btn btn-primary btn-sm hidden sm:inline-flex">New analysis</Link>
          <button
            ref={menuBtn}
            className="btn btn-quiet btn-sm min-[1360px]:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden className="relative block h-3 w-4">
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-1.5 h-px w-4 bg-current ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 h-px w-4 bg-current transition-transform ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
            {MENU_LABEL}
          </button>
        </div>
      </nav>
      {open && (
        <div
          id="mobile-menu"
          ref={panel}
          className="overflow-y-auto border-t border-rule bg-obsidian min-[1360px]:hidden"
          style={{ maxHeight: "calc(100dvh - 4rem - env(safe-area-inset-top))", paddingLeft: "var(--gutter)", paddingRight: "var(--gutter-r)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto grid max-w-[1400px] gap-6 pt-4 sm:grid-cols-3">
            {NAV_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-xs text-sandstone">{g.label}</p>
                <ul className="grid">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} aria-current={active(l.href) ? "page" : undefined}
                        className={`block border-l-2 py-2.5 pl-3 ${active(l.href) ? "border-brass text-ivory" : "border-transparent text-ivory-dim hover:text-ivory"}`}>
                        <span className="block text-base">{l.label}</span>
                        <span className="block text-xs text-mist">{l.note}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-5 flex max-w-[1400px] flex-wrap items-center gap-3 border-t border-rule pt-4">
            <Link href="/analysis/new" className="btn btn-primary">New analysis</Link>
            {user ? (
              <>
                <Link href="/account" className="btn btn-quiet">Account ({ROLE_LABEL[user.role]})</Link>
                {can("admin") && <Link href="/admin" className="btn btn-quiet">Users</Link>}
                <button className="btn btn-quiet" onClick={() => void doSignOut()}>Sign out {user.display_name}</button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-quiet">Sign in</Link>
                <Link href="/register" className="btn btn-quiet">Create account</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
