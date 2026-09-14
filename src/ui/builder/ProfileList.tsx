"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { ProfileSummary } from "@/app/actions/_lib/profiles";
import { Button } from "@/ui/shared/Button";
import { Modal } from "@/ui/shared/Modal";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { Toast, ToastRegion } from "@/ui/shared/Toast";
import { ListBar, type ListCount } from "./ListBar";
import { ProfileCard, THUMB_ASPECT } from "./ProfileCard";

// The list is the home screen (hi-fi 4a, FR-028): one bar with the mark, `Cats`, the
// count, New cat and Sign out; then every cat, last edited first, and the striped
// `+ new cat` tile at the end of the grid. New cat is the one blue thing on the page. No
// filters, no search, no sort — the spec keeps those out of scope.

/** The `createProfile` Server Action; injected so a test can fake it. */
export type CreateProfile = () => Promise<ActionResult<{ id: string }>>;

/** The `deleteProfile` Server Action; injected so a test can fake it. */
export type DeleteProfile = (id: string) => Promise<ActionResult<Record<never, never>>>;

export interface ProfileListProps {
  /** Already ordered by the server: most recently edited first. */
  profiles: ProfileSummary[];
  /** The ISO instant the page rendered at, so `edited 4d` reads the same on both sides. */
  now: string;
  createProfile: CreateProfile;
  deleteProfile: DeleteProfile;
  /** The Sign out form (a Server Action, FR-005), rendered by the page and shown in the bar. */
  signOut: ReactNode;
}

const EMPTY = "No cats listed yet. Start with the one who needs a home soonest.";
const TILE_NOTE = "Starts with a name and one photo. Everything else can wait.";

/** What the bar counts: every cat, and the live ones (CONTENT.md → `12 · 7 published`). */
function listCount(profiles: readonly ProfileSummary[]): ListCount {
  return {
    total: profiles.length,
    published: profiles.filter((profile) => profile.state === "live").length,
  };
}

/** The delete question, naming what goes (DESIGN.md rule 3), for a named or an unnamed cat. */
function deleteQuestion(profile: ProfileSummary): { title: string; body: string } {
  if (profile.name === "") {
    return {
      title: "Delete this unnamed cat?",
      body: "The draft and every photo in its library are removed. This can't be undone.",
    };
  }
  return {
    title: `Delete ${profile.name}?`,
    body: `${profile.name}'s draft and every photo in the library are removed. This can't be undone.`,
  };
}

// The striped tile that ends the grid, with the one line that says how little a cat needs.
function NewCatTile({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col gap-12">
      <StripedPlaceholder
        as="button"
        label="+ new cat"
        onClick={onClick}
        className={`${THUMB_ASPECT} rounded-editorial border border-dashed border-line-tag hover:border-blue hover:text-blue`}
      />
      <p className="text-ui-dense leading-relaxed font-normal text-meta">{TILE_NOTE}</p>
    </div>
  );
}

interface DeleteModalProps {
  profile: ProfileSummary;
  onKeep: () => void;
  onDelete: (profile: ProfileSummary) => void;
}

// Asks before a delete, naming the cat; Keep the draft is the safe button and Escape.
function DeleteModal({ profile, onKeep, onDelete }: DeleteModalProps) {
  const { title, body } = deleteQuestion(profile);
  return (
    <Modal
      open
      title={title}
      body={body}
      safeAction={{ label: "Keep the draft", onClick: onKeep }}
      dangerAction={{ label: "Delete", destructive: true, onClick: () => onDelete(profile) }}
    />
  );
}

/**
 * The two actions of the page, run in one transition, with the last failure's sentence,
 * and the cat a delete is being asked about. After a delete the card that had focus is
 * gone, so focus moves to New cat rather than being dropped on the page body.
 */
function useProfileActions(createProfile: CreateProfile, deleteProfile: DeleteProfile) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProfileSummary | null>(null);
  const newCatRef = useRef<HTMLButtonElement>(null);

  const create = () => {
    if (isPending) return;
    startTransition(async () => {
      const result = await createProfile();
      if (result.ok) router.push(`/builder/${result.id}`);
      else setError(result.error.message);
    });
  };

  const remove = (profile: ProfileSummary) => {
    setToDelete(null);
    startTransition(async () => {
      const result = await deleteProfile(profile.id);
      if (result.ok) {
        router.refresh();
        newCatRef.current?.focus();
      } else {
        setError(result.error.message);
      }
    });
  };

  return {
    error,
    clearError: () => setError(null),
    create,
    remove,
    toDelete,
    setToDelete,
    newCatRef,
  };
}

/**
 * The profile list page: the bar with the count and New cat, the empty-shelter sentence
 * when there is nothing yet, then the grid of cards ending in the `+ new cat` tile. Both New cat and
 * the tile call `createProfile` in a transition — never a link, so a prefetch cannot
 * create a draft — and go to the new builder page; the button stays enabled while it
 * runs so focus is never dropped, and a second press during the run is ignored. Delete opens a modal that names the
 * cat; confirming calls `deleteProfile` and refreshes the list. A failed action is
 * reported as an error toast in the action's own words.
 */
export function ProfileList(props: ProfileListProps) {
  const { profiles, now, createProfile, deleteProfile, signOut } = props;
  const { error, clearError, create, remove, toDelete, setToDelete, newCatRef } = useProfileActions(
    createProfile,
    deleteProfile,
  );
  const newCat = (
    <Button ref={newCatRef} onClick={create} className="whitespace-nowrap">
      New cat
    </Button>
  );

  return (
    <>
      <ListBar count={listCount(profiles)} newCat={newCat} signOut={signOut} />
      <main className="mx-auto flex w-full max-w-profile-max flex-col gap-40 px-28 py-40 md:px-56">
        {profiles.length === 0 ? (
          <p className="max-w-prose font-display text-fact-value leading-tight text-ink">{EMPTY}</p>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-28">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              now={new Date(now)}
              onDelete={setToDelete}
            />
          ))}
          <NewCatTile onClick={create} />
        </div>
        {toDelete === null ? null : (
          <DeleteModal profile={toDelete} onKeep={() => setToDelete(null)} onDelete={remove} />
        )}
        <ToastRegion>
          {error === null ? null : (
            <Toast variant="error" onDismiss={clearError}>
              {error}
            </Toast>
          )}
        </ToastRegion>
      </main>
    </>
  );
}
