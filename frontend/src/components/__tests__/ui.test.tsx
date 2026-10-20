import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AngularTape } from "../charts/Azimuth";
import { Notice, StatusBadge } from "../ui";

describe("StatusBadge", () => {
  it("always carries a text label (not colour alone)", () => {
    render(<StatusBadge status="blocked" />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });
  it("falls back to a humanised label for unknown states", () => {
    render(<StatusBadge status="not_a_state" />);
    expect(screen.getByText("not a state")).toBeInTheDocument();
  });
});

describe("Notice", () => {
  it("announces critical notices as alerts", () => {
    render(<Notice tone="critical" title="Benchmark gate">Unvalidated</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Unvalidated");
  });
});

describe("AngularTape", () => {
  it("gives a text alternative containing the residual", () => {
    render(<AngularTape measured={116} measuredSigma={0.5} predicted={118.4} axisMode="directed" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/Residual −2\.40°/);
  });
  it("compares the nearer end of a bidirectional axis", () => {
    render(<AngularTape measured={296} predicted={118.4} axisMode="bidirectional" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/axis end 116\.00°/);
  });
});
