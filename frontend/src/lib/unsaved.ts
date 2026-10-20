"use client";

import { useEffect } from "react";

/**
 * Never silently discard unsaved changes: while ``dirty`` is true, leaving the page (reload, close, typing a URL)
 * shows the browser's own confirmation, and clicking an in-app link asks first. Back/forward navigation inside the
 * app is not intercepted (browsers do not allow it reliably); forms keep their contents while mounted.
 */
export const UNSAVED_MESSAGE = "You have unsaved changes on this page. Leave without saving them?";

const dirtySources = new Set<string>();

export function useUnsavedGuard(key: string, dirty: boolean) {
  useEffect(() => {
    if (dirty) dirtySources.add(key);
    else dirtySources.delete(key);
    return () => {
      dirtySources.delete(key);
    };
  }, [key, dirty]);
}

export function hasUnsavedChanges() {
  return dirtySources.size > 0;
}

let installed = false;

/** Installed once from the root layout. */
export function installUnsavedGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges()) return;
    e.preventDefault();
    e.returnValue = UNSAVED_MESSAGE;
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!hasUnsavedChanges() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.hash)) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        dirtySources.clear();
      }
    },
    true,
  );
}

let hashInstalled = false;

/**
 * In-page links (#section) are handled here instead of by the browser. A native hash jump pushes a history entry
 * without the router's state, after which the Back button from another page restores the URL but not the page.
 * Scrolling ourselves and replacing (not pushing) the hash keeps Back and Forward working everywhere.
 */
export function installHashLinks() {
  if (hashInstalled || typeof window === "undefined") return;
  hashInstalled = true;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    const reduce = document.documentElement.dataset.motion === "reduced" ||
      (document.documentElement.dataset.motion !== "full" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", `#${id}`);
  });
}
