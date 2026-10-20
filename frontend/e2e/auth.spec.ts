import { expect, test } from "@playwright/test";
import { ADMIN, newCreds, noHorizontalOverflow, register, signIn, watchErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

test("register as a researcher, sign out and sign in again", async ({ page }) => {
  const errors = watchErrors(page);
  const creds = await register(page);
  await expect(page.getByRole("status").filter({ hasText: "Your account is ready and you are signed in." })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Account and preferences" })).toBeVisible();
  await expect(page.locator("#access").getByText("Researcher", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await page.waitForURL(/\/login\?signedout=1/);
  await expect(page.getByText("Your session has ended on this device.")).toBeVisible();
  // the old session no longer works
  const me = await page.request.get("/api/v2/auth/me");
  expect((await me.json()).user).toBeNull();
  await signIn(page, creds, "/account");
  await expect(page.locator("#access").getByText(creds.email)).toBeVisible();
  expect(errors.filter((e) => !e.includes("401"))).toEqual([]);
});

test("the form validates on the client and explains server refusals", async ({ page }) => {
  const taken = await register(page);
  await page.request.post("/api/v2/auth/logout", { headers: { "x-chronoheritage-client": "web" } });
  await page.context().clearCookies();
  await page.goto("/register");
  // password visibility toggle
  const pw = page.getByLabel("Password", { exact: true });
  await pw.fill("short");
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(page.getByText("Too short")).toBeVisible();
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Check these/ })).toBeVisible();
  await expect(page.getByText("The two passwords do not match.").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  // duplicate email: the server's answer is attached to the email field
  const c = newCreds();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(c.name);
  await page.getByRole("textbox", { name: "Email" }).fill(taken.email.toUpperCase());
  await pw.fill(c.password);
  await page.getByLabel("Confirm password").fill(c.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/An account with this email already exists/).first()).toBeVisible();
});

test("choosing Data Steward creates a pending request, not the role", async ({ page }) => {
  await register(page, newCreds("steward"), "Data Steward", "I maintain the regional survey archive and its source register.");
  await expect(page.getByText(/Data Steward request pending administrator review/)).toBeVisible();
  await page.goto("/account");
  await expect(page.locator("#access").getByText("Researcher", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending review")).toBeVisible();
  // publishing is refused by the server even if the request is crafted by hand
  const r = await page.request.post("/api/v2/sites", {
    headers: { "x-chronoheritage-client": "web" },
    data: { id: `e2e-pub-${Date.now()}`, name: "Crafted public record", visibility: "public" },
  });
  expect(r.status()).toBe(403);
  expect((await r.json()).detail.code).toBe("steward_required");
});

test("public sign-up cannot create privileged accounts or reach admin endpoints", async ({ page }) => {
  for (const extra of [{ role: "admin" }, { requested_role: "admin" }]) {
    const c = newCreds();
    const r = await page.request.post("/api/v2/auth/register", { data: { email: c.email, display_name: c.name, password: c.password, ...extra } });
    expect(r.status()).toBe(422);
  }
  expect((await page.request.get("/api/v2/auth/users")).status()).toBe(401);
  await register(page);
  expect((await page.request.get("/api/v2/auth/users")).status()).toBe(403);
  await page.goto("/admin");
  await expect(page.getByText("Administrators only")).toBeVisible();
});

test("motion preference is saved and applied", async ({ page }) => {
  await register(page);
  await page.goto("/account");
  await page.getByRole("radio", { name: /Reduce motion/ }).check();
  await expect(page.getByText("Saved to your account.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.goto("/");
  await expect(page.locator("section[data-mode='static']")).toBeVisible();
});

test("an administrator approves a role request", async ({ page, browser }) => {
  test.skip(!ADMIN, "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the approval flow");
  const user = await register(page, newCreds("rev"), "Reviewer", "Department reviewer for archaeoastronomy method audits.");
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin, ADMIN!, "/admin");
  const item = admin.locator("li", { hasText: user.email });
  await expect(item).toBeVisible();
  await item.getByLabel(/Decision note/).fill("Verified with the department.");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(admin.locator("li", { hasText: user.email })).toHaveCount(0);
  await ctx.close();
  await page.goto("/account");
  await expect(page.locator("#access").getByText("Reviewer", { exact: true })).toBeVisible();
});
