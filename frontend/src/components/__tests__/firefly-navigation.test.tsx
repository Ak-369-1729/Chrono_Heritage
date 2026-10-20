import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FireflyNavigation } from "../landing/FireflyNavigation";

vi.mock("next/link", () => ({ default: "a" }));

describe("FireflyNavigation discoveries", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps every destination link and opens a sourced, accessible discovery", () => {
    render(<FireflyNavigation />);

    expect(screen.getByRole("link", { name: "Observatory: open new analysis" })).toHaveAttribute("href", "/analysis/new");
    expect(screen.getByRole("link", { name: "Atlas: open historical site atlas" })).toHaveAttribute("href", "/atlas");
    expect(screen.getByRole("link", { name: "Sky: open sky explorer" })).toHaveAttribute("href", "/sky");
    expect(screen.getByRole("link", { name: "Archive: open documentation and sources" })).toHaveAttribute("href", "/documentation");
    expect(screen.getByRole("link", { name: "Chronicle: open workflow comparison" })).toHaveAttribute("href", "/compare");
    expect(screen.getByRole("link", { name: "Workshop: open dataset feasibility" })).toHaveAttribute("href", "/feasibility");

    const trigger = screen.getByRole("button", { name: "Discover: A view from the jharokhas" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Jharokha architecture: A view from the jharokhas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Source: Rajasthan Tourism: Hawa Mahal/ })).toHaveAttribute(
      "href",
      "https://www.tourism.rajasthan.gov.in/hawa-mahal.html",
    );
    expect(screen.getByText(/the scene depicts no real monument/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close discovery" })).toHaveFocus();
  });

  it("switches discoveries and closes with Escape or the close button, restoring focus", () => {
    render(<FireflyNavigation />);
    const first = screen.getByRole("button", { name: "Discover: A view from the jharokhas" });
    const second = screen.getByRole("button", { name: "Discover: A palace shaped by airflow" });

    fireEvent.click(first);
    fireEvent.click(second);
    expect(screen.getByRole("dialog", { name: "Passive ventilation: A palace shaped by airflow" })).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(second).toHaveFocus();

    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Close discovery" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(first).toHaveFocus();
  });

  it("filters discoveries by room and only shows the destination prompt at the threshold", () => {
    const { rerender } = render(<FireflyNavigation room="gateway" />);

    expect(screen.getByRole("button", { name: "Discover: A view from the jharokhas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discover: A palace shaped by airflow" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discover: A five-storey facade" })).not.toBeInTheDocument();
    expect(screen.queryByText("Follow a light to explore")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Explore by firefly" })).not.toBeInTheDocument();

    rerender(<FireflyNavigation room="threshold" />);
    expect(screen.getByText("Follow a light to explore")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Explore by firefly" })).toBeInTheDocument();
  });
});
