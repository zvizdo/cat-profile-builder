import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toast, ToastRegion, type ToastProps } from "@/ui/shared/Toast";

describe("Toast", () => {
  it("success, progress and warning are polite status messages", () => {
    render(
      <>
        <Toast variant="success">Gallery photo added.</Toast>
        <Toast variant="progress" percent={68}>
          Uploading rain-day.mov — 2 of 3
        </Toast>
        <Toast variant="warning">That photo is 640px wide — too small for the hero.</Toast>
      </>,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toHaveTextContent("Gallery photo added.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an error is an alert", () => {
    render(<Toast variant="error">Upload failed. Nothing was added.</Toast>);
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed. Nothing was added.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("progress shows the percentage as a progressbar, never a spinner", () => {
    render(
      <Toast variant="progress" percent={68}>
        Uploading rain-day.mov — 2 of 3
      </Toast>,
    );
    expect(screen.getByText("68%")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Uploading rain-day.mov — 2 of 3" });
    expect(bar).toHaveAttribute("aria-valuenow", "68");
    expect(document.querySelector("[class*='spin']")).toBeNull();
  });

  it("the action and the dismiss button both work from the keyboard", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        variant="warning"
        action={{ label: "Use anyway", onClick: onAction }}
        onDismiss={onDismiss}
        dismissLabel="Dismiss"
      >
        That photo is 640px wide — too small for the hero.
      </Toast>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Use anyway" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("success never carries a dismiss button: it goes away by itself", () => {
    render(
      <Toast variant="success" action={{ label: "Undo", onClick: () => {} }}>
        Gallery photo added.
      </Toast>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // @ts-expect-error -- a success toast auto-dismisses (sheet §07), so it takes no onDismiss.
    const refused: ToastProps = { variant: "success", onDismiss: () => {}, children: "x" };
    expect(refused.variant).toBe("success");
  });

  it("has no buttons when it offers nothing", () => {
    render(<Toast variant="warning">That photo is 640px wide — too small for the hero.</Toast>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ToastRegion", () => {
  it("is a plain container: liveness stays on each toast's role, never nested", () => {
    render(
      <ToastRegion>
        <Toast variant="success">Gallery photo added.</Toast>
        <Toast variant="error">Upload failed. Nothing was added.</Toast>
      </ToastRegion>,
    );
    const region = screen.getByRole("status").parentElement;
    expect(region).not.toHaveAttribute("aria-live");
    expect(region).not.toHaveAttribute("role");
    expect(region).toContainElement(screen.getByRole("alert"));
  });
});
