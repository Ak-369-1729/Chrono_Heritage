import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SentinelGuide } from "../auth/SentinelGuide";

describe("SentinelGuide", () => {
  it("opens an accessible guide with real destinations and closes on Escape", () => {
    render(<SentinelGuide />);
    const trigger = screen.getByRole("button", { name: /A guide to the observatory/ });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/The stones keep their histories/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter the Observatory" })).toHaveAttribute("href", "/analysis/new");
    expect(screen.getByRole("link", { name: "Explore the Atlas" })).toHaveAttribute("href", "/atlas");
    expect(screen.getByRole("link", { name: "Consult the Archive" })).toHaveAttribute("href", "/documentation");
    expect(screen.getByRole("link", { name: "Read the Sky" })).toHaveAttribute("href", "/sky");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
