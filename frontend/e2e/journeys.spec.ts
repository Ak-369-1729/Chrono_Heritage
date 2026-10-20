import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe.configure({ mode: "serial" });

test("browse the atlas and trace a value to its source", async ({ page }) => {
  await page.goto("/atlas");
  await expect(page.getByRole("heading", { name: "Heritage Atlas" })).toBeVisible();
  await expect(page.getByText("Demonstration data only")).toBeVisible();
  await page.getByLabel("Search sites").fill("marl");
  await expect(page.getByText("1 of 5 sites shown")).toBeVisible();
  await page.getByLabel("Search sites").fill("");
  await page.getByRole("link", { name: "Aster Hill Passage Mound (illustrative)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Aster Hill/ })).toBeVisible();
  await expect(page.getByText("True azimuth 131.6000° ± 0.400°")).toBeVisible();
  await page.getByRole("link", { name: "[1]" }).first().click();
  await expect(page.locator("#src-00000000-0000-4000-8000-000000000001")).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Review and audit history" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Dossier contents" })).toBeVisible();
});

test("a blocked record explains why it cannot be analysed", async ({ page }) => {
  await page.goto("/sites/ill-marl-ridge");
  await expect(page.getByText("North reference is unspecified; the bearing cannot be related to true north.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Analyse this site" })).toHaveCount(0);
});

test("sky explorer computes an exploratory, labelled result", async ({ page }) => {
  await page.goto("/sky?site=ill-aster-hill");
  await page.getByLabel("Target").selectOption("sun_december_solstice_rise");
  await page.getByRole("button", { name: "Compute" }).click();
  await expect(page.getByText(/EXPLORATORY — not saved/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/site chronology record/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Angular scale centred on the prediction/ })).toBeVisible();
});

test("unsupported targets are disabled, not computed", async ({ page }) => {
  await page.goto("/sky");
  const opt = page.locator("#sk-t option[value='moon_major_standstill']");
  await expect(opt).toBeDisabled();
});

test("researcher registers a hypothesis, runs an analysis and downloads its report", async ({ page }) => {
  await register(page);
  await page.goto("/analysis/new?site=ill-aster-hill");
  await page.getByLabel("Astronomical target").selectOption("sun_december_solstice_rise");
  await page.getByLabel("Hypothesis statement").fill("The passage axis was laid out toward December-solstice sunrise over the surveyed ridge.");
  await page.getByLabel("Random seed").fill("7");
  await page.getByRole("button", { name: "Register hypothesis and run" }).click();
  await page.waitForURL(/\/analysis\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/not evidence of intent/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Signed residual (axis − prediction)" })).toBeVisible();
  await expect(page.getByText(/ILLUSTRATIVE RECORD/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Analysis workflow" }).locator("[aria-current='step']")).toContainText("Results and uncertainty");
  await expect(page.getByRole("heading", { name: "Rerun lineage" })).toBeVisible();
  await page.getByRole("button", { name: "Generate report" }).click();
  const btn = page.getByRole("button", { name: /Download PDF/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), btn.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  // confirmation names the file and reports the checksum check (localhost allows WebCrypto)
  await expect(page.getByText(/Saved chronoheritage-.*\.pdf .*Checksum matches the recorded SHA-256\./)).toBeVisible();
});

test("feasibility report for the illustrative inventory records no decision", async ({ page }) => {
  await register(page);
  await page.goto("/feasibility");
  await page.getByRole("button", { name: /Generate report for 5 sites/ }).click();
  await expect(page.getByText("No decision — illustrative dataset").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Pairwise convention compatibility" })).toBeVisible();
  await expect(page.getByText("Critical blockers", { exact: true }).first()).toBeVisible();
});

test("benchmarks show blocked cases as blocked, never passed", async ({ page }) => {
  await page.goto("/benchmarks");
  await expect(page.getByRole("heading", { name: "Benchmark results" })).toBeVisible();
  await expect(page.getByText("PUB-001", { exact: true })).toBeVisible({ timeout: 20_000 });
  const pub = page.locator("li", { hasText: "PUB-001" });
  await expect(pub.getByText("Blocked", { exact: true })).toBeVisible();
});

test("cross-site statistics stay disabled", async ({ page }) => {
  await register(page);
  await page.goto("/reports");
  await page.getByLabel("Report type").selectOption({ label: "Single-site analysis" });
  const cross = page.locator("#rp-kind option[value='cross_site']");
  await expect(cross).toBeDisabled();
  await page.goto("/gates");
  await expect(page.getByText("Cross-site statistical tier (Tier 2)").first()).toBeVisible();
  await expect(page.getByText("Not met (closed)").first()).toBeVisible();
  // the server refuses the cross-site endpoint regardless of the interface
  const r = await page.request.post("/api/v2/analyses/cross-site", { headers: { "x-chronoheritage-client": "web" }, data: {
    target_key: "sun_june_solstice_rise", statement: "Pre-registered cross-site hypothesis text for the e2e check.",
    null_model: "sector_uniform", null_justification: "x".repeat(90), site_ids: ["ill-aster-hill", "ill-corran-row"] } });
  expect([403, 409, 422]).toContain(r.status());
});

test("documentation demo explains bidirectional residuals interactively", async ({ page }) => {
  await page.goto("/documentation#residuals");
  await expect(page.getByText("Residual −3.50°").first()).toBeVisible();
  await page.getByRole("radio", { name: "directed" }).first().check();
  await expect(page.getByText("Residual +176.50°").first()).toBeVisible();
});


test("unsaved changes are never discarded silently", async ({ page }) => {
  await register(page);
  await page.goto("/sites/new");
  await page.getByLabel("Name", { exact: false }).first().fill("Half-typed site");
  await expect(page.getByText("Unsaved changes.")).toBeVisible();
  let asked = "";
  page.once("dialog", async (d) => { asked = d.message(); await d.dismiss(); });
  await page.getByRole("link", { name: "Cancel" }).click();
  expect(asked).toMatch(/unsaved changes/);
  await expect(page).toHaveURL(/\/sites\/new$/);
  await expect(page.getByLabel("Name", { exact: false }).first()).toHaveValue("Half-typed site");
});

test("researchers save private drafts; publishing needs a steward", async ({ page }) => {
  await register(page);
  await page.goto("/sites/new");
  await expect(page.locator("#n-vis option[value='public']")).toHaveCount(0);
  await expect(page.getByText(/Publishing to the registry needs the Data Steward role/)).toBeVisible();
});
