import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SignInResult } from "@/app/actions/_lib/auth";
import { SignInForm } from "@/app/sign-in/SignInForm";

const MISMATCH = "That username and password don't match.";

/** A stand-in for the `signIn` Server Action that records the form it was given. */
function fakeAction(result: SignInResult) {
  const seen: Record<string, string>[] = [];
  const action = vi.fn(async (_previous: SignInResult, formData: FormData) => {
    seen.push(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])));
    return result;
  });
  return { action, seen };
}

describe("SignInForm", () => {
  it("labels both fields, hides the password, and carries next along", () => {
    render(<SignInForm action={fakeAction(null).action} next="/builder/abcdefgh" />);
    expect(screen.getByRole("textbox", { name: "Username" })).toHaveAttribute("name", "username");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("type", "submit");
    expect(document.querySelector('input[name="next"]')).toHaveValue("/builder/abcdefgh");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits from the keyboard alone: Tab, type, Tab, type, Enter", async () => {
    const user = userEvent.setup();
    const { action, seen } = fakeAction(null);
    render(<SignInForm action={action} next={undefined} />);

    await user.tab();
    expect(screen.getByRole("textbox", { name: "Username" })).toHaveFocus();
    await user.keyboard("volunteer");
    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.keyboard("catsarecool{Enter}");

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(seen[0]).toMatchObject({ username: "volunteer", password: "catsarecool" });
    expect(seen[0]).not.toHaveProperty("next");
  });

  it("shows the one mismatch sentence as an alert and marks both fields invalid", async () => {
    const user = userEvent.setup();
    const { action } = fakeAction({
      ok: false,
      username: "volunteer",
      error: { code: "unauthorized", message: MISMATCH },
    });
    render(<SignInForm action={action} next={undefined} />);

    await user.type(screen.getByRole("textbox", { name: "Username" }), "volunteer");
    await user.type(screen.getByLabelText("Password"), "wrong{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(MISMATCH);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const username = screen.getByRole("textbox", { name: "Username" });
    const password = screen.getByLabelText("Password");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAccessibleDescription(MISMATCH);
    expect(password).toHaveAccessibleDescription(MISMATCH);
    expect(username).toHaveValue("volunteer");
    expect(password).toHaveValue("");
  });
});
