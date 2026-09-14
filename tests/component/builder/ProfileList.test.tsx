import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProfileSummary } from "@/app/actions/_lib/profiles";
import { ProfileList, type ProfileListProps } from "@/ui/builder/ProfileList";

// The list is the home screen (FR-028, CONTENT.md → Profile list): one bar with `Cats`
// and the `3 · 1 published` count; every cat as a card
// with its thumbnail, name, state badge and `edited 4d`; the `+ new cat` tile and the
// `New cat` button both call `createProfile` and go to the new draft; Delete asks first,
// names the cat, and Escape keeps it. No filters, no search, no sort (spec → Out of scope).

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NOW = "2026-09-11T12:00:00.000Z";
const DAY = 86_400_000;

function ago(days: number): string {
  return new Date(Date.parse(NOW) - days * DAY).toISOString();
}

const CHARLOTTE: ProfileSummary = {
  id: "abcdefgh",
  name: "Charlotte",
  line: "A negotiator, not a complainer.",
  thumbnailUrl: "https://storage.googleapis.com/x/clean.a1b2c3d4e5.jpg",
  state: "draft",
  updatedAt: ago(4),
};
const MILO: ProfileSummary = {
  id: "bcdefghi",
  name: "Milo",
  line: "",
  thumbnailUrl: null,
  state: "live",
  updatedAt: ago(0),
};
const UNNAMED: ProfileSummary = {
  id: "cdefghij",
  name: "",
  line: "",
  thumbnailUrl: null,
  state: "archived",
  updatedAt: ago(21),
};

function setup(profiles: ProfileSummary[], overrides: Partial<ProfileListProps> = {}) {
  const user = userEvent.setup();
  const createProfile = vi.fn(async () => ({ ok: true as const, id: "paaaaaab" }));
  const deleteProfile = vi.fn(async (_id: string) => ({ ok: true as const }));
  router.push.mockReset();
  router.refresh.mockReset();
  render(
    <ProfileList
      profiles={profiles}
      now={NOW}
      createProfile={createProfile}
      deleteProfile={deleteProfile}
      signOut={<button type="button">Sign out</button>}
      {...overrides}
    />,
  );
  return { user, createProfile, deleteProfile };
}

describe("ProfileList", () => {
  it("shows the empty-shelter sentence and only the new-cat tile when there are no cats", () => {
    setup([]);
    expect(screen.getByRole("heading", { level: 1, name: "Cats" })).toBeInTheDocument();
    expect(screen.getByText("0 · 0 published")).toBeInTheDocument();
    expect(
      screen.getByText("No cats listed yet. Start with the one who needs a home soonest."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ new cat" })).toBeInTheDocument();
    expect(
      screen.getByText("Starts with a name and one photo. Everything else can wait."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("counts every cat and the live ones in the bar, beside New cat and Sign out", () => {
    setup([CHARLOTTE, MILO, UNNAMED]);
    const bar = screen.getByRole("banner");
    expect(within(bar).getByText("3 · 1 published")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "New cat" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("offers no filter, search or sort control", () => {
    setup([CHARLOTTE, MILO]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/sorted by/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(all|live|drafts)\b/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/No cats listed yet/)).not.toBeInTheDocument();
  });

  it("renders each cat as a card in the order given: thumbnail, name, line, badge and edited time", () => {
    setup([CHARLOTTE, MILO, UNNAMED]);
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);

    const [charlotte, milo, unnamed] = cards as [HTMLElement, HTMLElement, HTMLElement];
    const link = within(charlotte).getByRole("link", { name: /Charlotte/ });
    expect(link).toHaveAttribute("href", "/builder/abcdefgh");
    expect(within(charlotte).getByRole("presentation")).toHaveAttribute(
      "src",
      CHARLOTTE.thumbnailUrl,
    );
    expect(within(charlotte).getByText("DRAFT")).toBeInTheDocument();
    expect(within(charlotte).getByText("edited 4d")).toBeInTheDocument();
    // The line tells two tabbies apart; it stays out of the link's name.
    expect(within(charlotte).getByText("A negotiator, not a complainer.")).toBeInTheDocument();
    expect(link).toHaveAccessibleName("Charlotte");

    expect(within(milo).getByRole("link", { name: /Milo/ })).toHaveAttribute(
      "href",
      "/builder/bcdefghi",
    );
    expect(within(milo).queryByRole("presentation")).not.toBeInTheDocument();
    expect(within(milo).getByText("no photo yet")).toBeInTheDocument();
    expect(within(milo).getByText("LIVE")).toBeInTheDocument();
    expect(within(milo).getByText("edited just now")).toBeInTheDocument();

    expect(within(unnamed).getByRole("link", { name: /Unnamed cat/ })).toBeInTheDocument();
    expect(within(unnamed).getByText("ARCHIVED")).toBeInTheDocument();
    expect(within(unnamed).getByText("edited 3w")).toBeInTheDocument();
  });

  it("offers Delete on drafts only", () => {
    setup([CHARLOTTE, MILO, UNNAMED]);
    const [charlotte, milo, unnamed] = screen.getAllByRole("article") as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(charlotte).getByRole("button", { name: "Delete Charlotte" })).toBeInTheDocument();
    expect(within(milo).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(unnamed).queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("the tile creates a draft and goes to it — from the keyboard, and never twice at once", async () => {
    const { user, createProfile } = setup([]);
    let release: (() => void) | undefined;
    createProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true as const, id: "paaaaaab" });
        }),
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "New cat" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "+ new cat" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(createProfile).toHaveBeenCalledTimes(1);
    release?.();
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/builder/paaaaaab"));
  });

  it("Tab reaches a card's link, then its Delete, before the new-cat tile (keyboard path)", async () => {
    const { user } = setup([CHARLOTTE]);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    await user.tab();
    const card = screen.getByRole("article", { name: "Charlotte" });
    expect(within(card).getByRole("link")).toHaveFocus();
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/builder/abcdefgh");
    await user.tab();
    expect(screen.getByRole("button", { name: "Delete Charlotte" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Delete Charlotte?" })).toBeInTheDocument();
  });

  it("the New cat button does the same", async () => {
    const { user, createProfile } = setup([CHARLOTTE]);
    await user.click(screen.getByRole("button", { name: "New cat" }));
    expect(createProfile).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/builder/paaaaaab"));
  });

  it("says what went wrong when a draft cannot be created", async () => {
    const { user } = setup([], {
      createProfile: async () => ({
        ok: false as const,
        error: { code: "upstream" as const, message: "The storage service didn't respond." },
      }),
    });
    await user.click(screen.getByRole("button", { name: "+ new cat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The storage service didn't respond.",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Delete asks first, naming the cat; Escape keeps it and returns focus", async () => {
    const { user, deleteProfile } = setup([CHARLOTTE]);
    const opener = screen.getByRole("button", { name: "Delete Charlotte" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Delete Charlotte?");
    expect(dialog).toHaveAccessibleDescription(
      "Charlotte's draft and every photo in the library are removed. This can't be undone.",
    );
    expect(screen.getByRole("button", { name: "Keep the draft" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteProfile).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("names an unnamed cat without a name and confirms from the keyboard", async () => {
    const draft = { ...UNNAMED, state: "draft" as const };
    const { user, deleteProfile } = setup([draft]);
    await user.click(screen.getByRole("button", { name: "Delete Unnamed cat" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Delete this unnamed cat?");
    expect(dialog).toHaveAccessibleDescription(
      "The draft and every photo in its library are removed. This can't be undone.",
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(deleteProfile).toHaveBeenCalledWith("cdefghij");
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New cat" })).toHaveFocus();
  });

  it("shows the refusal when the server will not delete", async () => {
    const { user } = setup([CHARLOTTE], {
      deleteProfile: async () => ({
        ok: false as const,
        error: { code: "refused" as const, message: "Unpublish first." },
      }),
    });
    await user.click(screen.getByRole("button", { name: "Delete Charlotte" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unpublish first.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
