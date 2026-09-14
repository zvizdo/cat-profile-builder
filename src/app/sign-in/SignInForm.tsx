"use client";
import { useActionState } from "react";
import type { SignInResult } from "@/app/actions/_lib/auth";
import { Button } from "@/ui/shared/Button";
import { Field, fieldErrorId } from "@/ui/shared/Field";

/** The Server Action the form posts to, shaped for `useActionState`; injected so tests can fake it. */
export type SignInAction = (previous: SignInResult, formData: FormData) => Promise<SignInResult>;

/** What the form needs from the page. */
export interface SignInFormProps {
  action: SignInAction;
  /** The guarded path to go back to after signing in, when the guard sent the visitor here. */
  next: string | undefined;
}

/**
 * Username, password, Continue. Enter submits from either field. A failed attempt shows
 * exactly one sentence — under the password, announced, and tied to both fields — because
 * the server never says which half was wrong (FR-003). After a failed attempt the username
 * is re-seeded from the action's answer (React resets the fields) and the password is
 * cleared. The button stays enabled while the action runs so keyboard focus is never
 * dropped; a second submit only re-runs the check.
 */
export function SignInForm({ action, next }: SignInFormProps) {
  const [state, formAction] = useActionState(action, null);
  const message = state === null ? undefined : state.error.message;
  return (
    <form action={formAction} className="flex flex-col gap-16">
      {next === undefined ? null : <input type="hidden" name="next" value={next} />}
      <Field
        id="username"
        name="username"
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state === null ? undefined : state.username}
        invalid={message !== undefined}
        describedBy={message === undefined ? undefined : fieldErrorId("password")}
      />
      <Field
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={message}
      />
      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}
