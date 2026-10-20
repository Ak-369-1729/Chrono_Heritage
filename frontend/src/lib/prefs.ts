import type { Preferences } from "./types";

/** Per-browser display preferences (a convenience; signed-in users also store them on the server). */
const KEY = "ch-prefs";
const LEGACY_STATIC_KEY = "ch-landing-static";

export function readLocalPrefs(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Preferences) : {};
    if (!p.landing && window.localStorage.getItem(LEGACY_STATIC_KEY) === "1") p.landing = "static";
    return p;
  } catch {
    return {};
  }
}

export function writeLocalPrefs(p: Preferences) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    if (p.landing && p.landing !== "static") window.localStorage.removeItem(LEGACY_STATIC_KEY);
  } catch {
    /* storage unavailable (private mode, blocked): preferences last for this page only */
  }
}

/** Reflect the motion choice on <html data-motion>, which globals.css uses to stop or allow animation. */
export function applyMotionPreference(motion: Preferences["motion"]) {
  const el = document.documentElement;
  if (!motion || motion === "system") el.removeAttribute("data-motion");
  else el.setAttribute("data-motion", motion);
}

/** True when motion should be reduced: an explicit preference wins over the system setting. */
export function motionReduced(motion: Preferences["motion"]): boolean {
  if (motion === "reduced") return true;
  if (motion === "full") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
