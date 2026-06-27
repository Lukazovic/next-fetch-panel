// @vitest-environment jsdom

import { vi, describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OptionButton } from "./OptionButton";

afterEach(() => cleanup());

describe("OptionButton", () => {
  it("renders its children", () => {
    render(
      <OptionButton active={false} onClick={() => {}}>
        Save
      </OptionButton>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });

  it("applies primary background and text when active", () => {
    render(
      <OptionButton active={true} onClick={() => {}}>
        Label
      </OptionButton>
    );
    const btn = screen.getByRole("button", { name: "Label" });
    expect(btn.className).toContain("bg-primary");
    expect(btn.className).toContain("text-primary-foreground");
  });

  it("applies muted text and transparent background when inactive", () => {
    render(
      <OptionButton active={false} onClick={() => {}}>
        Label
      </OptionButton>
    );
    const btn = screen.getByRole("button", { name: "Label" });
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("text-muted-foreground");
  });

  it("calls onClick when clicked", () => {
    const handler = vi.fn();
    render(
      <OptionButton active={false} onClick={handler}>
        Label
      </OptionButton>
    );
    fireEvent.click(screen.getByRole("button", { name: "Label" }));
    expect(handler).toHaveBeenCalledOnce();
  });
});
