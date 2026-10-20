import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/**
 * Test accounts are created through the public sign-up form at run time with a random password, so no reusable
 * credential lives in the repository. Administrator checks need an operator-created admin, passed in through the
 * environment (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD); those tests are skipped when it is not provided.
 */
export interface Creds { email: string; password: string; name: string }

export const ADMIN: Creds | null = process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
  ? { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, name: "Administrator" }
  : null;

export function newCreds(tag = "e2e"): Creds {
  const id = randomBytes(5).toString("hex");
  return { email: `${tag}-${id}@example.org`, password: `pw-${randomBytes(12).toString("base64url")}`, name: `E2E ${tag} ${id}` };
}

/** Register through the UI (open sign-up mode). Leaves the new account signed in. */
export async function register(page: Page, creds = newCreds(), role: "Researcher" | "Data Steward" | "Reviewer" = "Researcher", statement?: string) {
  await page.goto("/register");
  await page.getByRole("radio", { name: role }).check();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(creds.name);
  await page.getByRole("textbox", { name: "Email" }).fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByLabel("Confirm password").fill(creds.password);
  if (statement) await page.getByLabel(/Why do you need/).fill(statement);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Welcome, ${creds.name}|Account created`) })).toBeVisible();
  return creds;
}

export async function signIn(page: Page, creds: Creds, next = "/atlas") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: "Email" }).fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
}

export async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page must not scroll horizontally").toBeLessThanOrEqual(1);
}

/** Console errors, failed requests and 5xx responses (requests the browser cancels during navigation are ignored). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    // the browser cancels in-flight prefetches and chunk loads when a navigation starts: not a failure
    if (why.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${r.url()} ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}
