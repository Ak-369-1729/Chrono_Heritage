import { describe, expect, it } from "vitest";
import { safeNext } from "../nav";
import { EMAIL_RE, estimateStrength, PASSWORD_MIN, passwordProblems } from "../password";
import { hasUnsavedChanges } from "../unsaved";

describe("password guidance", () => {
  it("mirrors the server's minimum rules", () => {
    expect(PASSWORD_MIN).toBe(12);
    expect(passwordProblems("short")).toContain("Use at least 12 characters.");
    expect(passwordProblems("aaaaaaaaaaaaaaa")).toContain("Use more than three different characters.");
    expect(passwordProblems("mallory-and-more-123", "mallory@example.org")).toContain("Do not include your email address in the password.");
    expect(passwordProblems("Grace Hopper rocks 1906", "x@example.org", "Grace Hopper")).toContain("Do not include your name in the password.");
    expect(passwordProblems("copper brass indigo dune")).toEqual([]);
  });

  it("rates length and variety, penalises common words and sequences, and never claims more than an estimate", () => {
    expect(estimateStrength("short").label).toBe("Too short");
    const weak = estimateStrength("password1234");
    const strong = estimateStrength("Copper-brass indigo dune 7");
    expect(weak.score).toBeLessThan(strong.score);
    expect(strong.label).toBe("Strong");
    expect(estimateStrength("abcd1234efgh5678").tips.join(" ")).toMatch(/sequences/);
  });

  it("accepts ordinary emails and rejects malformed ones", () => {
    expect(EMAIL_RE.test("name@example.org")).toBe(true);
    expect(EMAIL_RE.test("not-an-email")).toBe(false);
    expect(EMAIL_RE.test("a@b")).toBe(false);
  });
});

describe("post-login redirect", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("//evil.example")).toBe("/atlas");
    expect(safeNext("/\\evil.example")).toBe("/atlas");
    expect(safeNext("https://evil.example")).toBe("/atlas");
    expect(safeNext(null)).toBe("/atlas");
  });
});

describe("unsaved changes", () => {
  it("starts clean", () => {
    expect(hasUnsavedChanges()).toBe(false);
  });
});
