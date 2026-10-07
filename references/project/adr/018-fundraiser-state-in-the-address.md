# ADR-018: The fundraiser display keeps its numbers in the page address

**Status**: accepted · **Date**: 2026-10-06

## Context

`/fundraiser` (spec `002-fundraising-thermometer`) is a full-screen display with a headline, an
amount raised, and a goal, which any volunteer can change in place. The numbers have to
survive a reload. The user's decision, given when the spec's one open question was asked: anyone
with the address may view and edit, and the numbers are saved "in the url, but not in any database
for persistence".

This is a persistence decision in the constitution's sense (Engineering Standards → Documentation
and decision records): reversing it later means changing every address a shelter screen has
bookmarked.

## Decision

The three values live in the query string and nowhere else:

`/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000`

- **No server storage, no database, no cookie, no `localStorage`.** The page keeps nothing
  between visits; the address is the whole state (FR-021, FR-022).
- **The server reads the address once per request** and renders the first paint with the parsed
  values, so there is no flash of defaults. After that the browser owns the state and rewrites the
  address with `window.history.replaceState(null, "", "?…")` — the call Next.js documents as
  integrating with its router without a navigation and without adding a history entry.
- **The address is untrusted input.** One Zod schema per value, shared by the address reader and
  the in-place fields, with each bad value falling back to its own default (FR-023). Amounts are
  held as whole cents. The headline is plain text only, 60 characters at most, control and
  bidirectional-override characters removed (see `specs/002-fundraising-thermometer/contracts/address.md`).
- **No sign-in, no proxy rule.** `/fundraiser` stays outside `src/proxy.ts`'s matcher (FR-025).
- **`noindex`.** The page asks search engines not to index it, so a crafted link cannot be found
  by search.

## Consequences

- A screen is set up by editing once and **keeping the address** (bookmark, start page, or sent
  link). A browser restart that does not reopen that address starts from the defaults.
- Two screens are two addresses; changing one never changes the other (FR-025).
- **Anyone can craft a link** with their own headline and amounts, and it will look official
  because it is on the shelter's own domain. Mitigations are plain-text rendering, the length and
  amount limits, and `noindex`. Signing the address, or locking it with a key, would close the gap
  and was left out of scope by the user.
- The headline and amounts appear in the host's request logs, as any query string does.

## Alternatives rejected

- **A database or a bucket object per fundraiser.** Would let screens update each other and
  survive restarts, but needs a store, an edit endpoint, and a rule about who may call it. The
  user said no database.
- **Browser storage (`localStorage`).** Survives a restart on that machine only, is invisible
  (the address would not carry the numbers to a second screen), and the user excluded it.
- **A signed address.** Stops forged links, needs a secret and a sign-in step to produce them,
  and the user chose open editing.
- **A fragment (`#…`) instead of a query.** Never reaches the server, so the first paint would
  flash defaults and the page could not be rendered with the right numbers on the server.
