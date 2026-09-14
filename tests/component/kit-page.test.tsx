import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import KitPage, { kitEnabled } from "@/app/(dev)/kit/page";

// The dev-only component sheet: its gate, and that its live parts actually move.

describe("kitEnabled", () => {
  it("is on outside production, and in production only with KIT_ENABLED=1", () => {
    expect(kitEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(kitEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(kitEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(kitEnabled({ NODE_ENV: "production", KIT_ENABLED: "1" })).toBe(true);
    expect(kitEnabled({ NODE_ENV: "production", KIT_ENABLED: "true" })).toBe(false);
  });
});

describe("KitPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a 404 in production without the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KIT_ENABLED", "");
    expect(() => KitPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("renders every group with its specimens", () => {
    render(<KitPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Kit" })).toBeInTheDocument();
    for (const caption of ["Buttons", "Fields", "Badges", "Empty slots", "Icon buttons"]) {
      expect(screen.getByRole("region", { name: caption })).toBeInTheDocument();
    }
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("ENHANCED")).toBeInTheDocument();
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(3);
    // Two alerts: the error toast and the wrong field's sentence.
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent ?? "");
    expect(alerts.some((text) => text.includes("Upload failed. Nothing was added."))).toBe(true);
    expect(alerts).toContain("Every published profile shows a fee, even if it's $0.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("[class*='spin']")).toBeNull();
  });

  it("dismisses a toast, brings it back, and shows one in the region", async () => {
    const user = userEvent.setup();
    render(<KitPage />);
    const toasts = screen.getByRole("region", { name: /^Toasts/ });
    // Success has no Dismiss (it goes by itself); the first Dismiss belongs to progress.
    expect(within(toasts).getAllByRole("button", { name: "Dismiss" })).toHaveLength(3);
    await user.click(within(toasts).getAllByRole("button", { name: "Dismiss" })[0]!);
    expect(within(toasts).queryByText("Uploading rain-day.mov — 2 of 3")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bring them back" }));
    expect(within(toasts).getByText("Uploading rain-day.mov — 2 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show a toast in the region" }));
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Gallery photo added.");
    const undo = screen.getAllByRole("button", { name: "Undo" });
    await user.click(undo[undo.length - 1]!);
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it("opens the modal from the destructive button and closes it on Keep it", async () => {
    const user = userEvent.setup();
    render(<KitPage />);
    const openers = screen.getAllByRole("button", { name: "Remove section" });
    await user.click(openers[openers.length - 1]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Remove the gallery?");
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("counts presses on the add-section placeholder", async () => {
    const user = userEvent.setup();
    render(<KitPage />);
    expect(screen.getByText("Not pressed yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ add section" }));
    expect(screen.getByText("Pressed 1 time.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ add section" }));
    expect(screen.getByText("Pressed 2 times.")).toBeInTheDocument();
  });
});
