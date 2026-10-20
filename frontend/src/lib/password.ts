/**
 * Rough password strength estimate for the sign-up form.
 *
 * It looks only at length, character variety and obvious patterns. It cannot know whether a password has leaked
 * elsewhere or is reused, so the interface presents it as a guide, never as a security guarantee. The server's
 * minimum rules (``accounts.password_problems``) are mirrored in ``passwordProblems``.
 */

export const PASSWORD_MIN = 12;

const COMMON = ["password", "qwerty", "letmein", "welcome", "admin", "chronoheritage", "123456", "abc123", "iloveyou", "sunrise", "solstice"];

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  tips: string[];
}

export function estimateStrength(pw: string): Strength {
  if (pw.length < PASSWORD_MIN) {
    return { score: 0, label: "Too short", tips: [`Use at least ${PASSWORD_MIN} characters.`] };
  }
  const tips: string[] = [];
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const unique = new Set(pw).size;
  let points = 0;
  points += Math.min(3, Math.floor((pw.length - PASSWORD_MIN) / 4) + 1); // 12→1, 16→2, 20+→3
  points += classes >= 3 ? 1 : 0;
  points += unique >= 10 ? 1 : 0;
  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) {
    points -= 2;
    tips.push("Avoid common words such as “password” or the site name.");
  }
  if (/(.)\1{3,}/.test(pw)) {
    points -= 1;
    tips.push("Avoid long runs of the same character.");
  }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf)/i.test(pw)) {
    points -= 1;
    tips.push("Avoid keyboard or number sequences.");
  }
  if (pw.length < 16) tips.push("A longer passphrase of several unrelated words is easier to remember and harder to guess.");
  const score = Math.max(1, Math.min(4, points)) as Strength["score"];
  const label = (["Too short", "Weak", "Fair", "Good", "Strong"] as const)[score];
  return { score, label, tips };
}

/** Client-side copy of the server's minimum rules, for immediate feedback (the server re-checks). */
export function passwordProblems(pw: string, email = "", name = ""): string[] {
  const p: string[] = [];
  if (pw.length < PASSWORD_MIN) p.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (pw.length > 200) p.push("Use at most 200 characters.");
  if (pw && new Set(pw).size < 4) p.push("Use more than three different characters.");
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local)) p.push("Do not include your email address in the password.");
  if (name.length >= 4 && pw.toLowerCase().includes(name.toLowerCase())) p.push("Do not include your name in the password.");
  return p;
}

export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
