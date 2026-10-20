import { describe, expect, it } from "vitest";
import { axialResidual, deg, residual, signedResidual, yearLabel } from "../format";
import { parseError } from "../api";

describe("circular residuals mirror the backend convention", () => {
  it.each([
    [359.5, 0.5, -1], [0.5, 359.5, 1], [10, 350, 20], [180, 0, -180], [720.25, -0.25, 0.5],
  ])("directed %s vs %s → %s", (a, b, r) => {
    expect(signedResidual(a, b)).toBeCloseTo(r, 9);
  });
  it.each([[5, 183, 2], [268, 90, -2], [90, 270, 0], [135, 45, -90]])("axial %s vs %s → %s", (a, b, r) => {
    expect(axialResidual(a, b)).toBeCloseTo(r, 9);
  });
  it("respects the axis mode", () => {
    expect(residual(270, 90, "directed")).toBeCloseTo(-180);
    expect(residual(270, 90, "bidirectional")).toBeCloseTo(0);
  });
});

describe("formatting", () => {
  it("labels astronomical years", () => {
    expect(yearLabel(2026)).toBe("2026 CE");
    expect(yearLabel(0)).toBe("1 BCE");
    expect(yearLabel(-2499)).toBe("2500 BCE");
    expect(yearLabel(null)).toBe("—");
  });
  it("formats degrees with a true minus sign and optional plus", () => {
    expect(deg(-1.234, 2)).toBe("−1.23°");
    expect(deg(1.5, 1, true)).toBe("+1.5°");
    expect(deg(undefined)).toBe("—");
  });
});

describe("API error parsing", () => {
  it("reads structured detail", () => {
    const e = parseError(422, { detail: { code: "analysis_validation", message: "Analysis cannot run.", errors: ["Chronology range missing."] } });
    expect(e.code).toBe("analysis_validation");
    expect(e.errors).toEqual(["Chronology range missing."]);
  });
  it("explains network failures", () => {
    expect(parseError(0, null).message).toMatch(/could not be reached/);
  });
});
