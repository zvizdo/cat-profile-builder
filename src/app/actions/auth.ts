"use server";
import { getContainer } from "@/adapters/container";
import { signInWith, signOutWith, type SignInResult } from "@/app/actions/_lib/auth";

// The two Server Actions of the sign-in flow (contracts/server-boundary.md). Both are thin:
// the work is in `_lib/auth.ts`, where a test can inject the container and the cookie jar.

/**
 * The form action behind the sign-in page, shaped for `useActionState`: the previous state
 * is ignored, the form is validated, and a match ends in a redirect while a mismatch
 * returns the one error to show.
 */
export async function signIn(_previous: SignInResult, formData: FormData): Promise<SignInResult> {
  return signInWith(getContainer(), formData);
}

/** Signs the shelter out: clears the cookie and redirects to `/sign-in`. */
export async function signOut(): Promise<never> {
  return signOutWith();
}
