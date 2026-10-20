import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResearchSignalsSection } from "../landing/Sections";

describe("ResearchSignalsSection", () => {
  it("describes real workflow practices without presenting an unsupported metric", () => {
    render(<ResearchSignalsSection />);

    expect(screen.getByText(/A site profile is an input, not scenery/)).toBeInTheDocument();
    expect(screen.getByText(/two independent reference paths/)).toBeInTheDocument();
    expect(screen.getByText(/retain their sampling seed/)).toBeInTheDocument();
    expect(screen.queryByText("±0.27°")).not.toBeInTheDocument();
  });

  it("links each practice to its relevant research workflow", () => {
    render(<ResearchSignalsSection />);

    expect(screen.getByRole("link", { name: "Explore sky inputs" })).toHaveAttribute("href", "/sky");
    expect(screen.getByRole("link", { name: "Review benchmarks" })).toHaveAttribute("href", "/benchmarks");
    expect(screen.getByRole("link", { name: "Inspect evidence gates" })).toHaveAttribute("href", "/gates");
    expect(screen.getByRole("link", { name: "View analysis workflow" })).toHaveAttribute("href", "/analysis");
  });
});
