# Contract: The page address

The one seam of this feature (Principle VI): text from the browser's address bar, which anyone
may have written, becomes a typed `Fundraiser`. Everything below is checked by
`tests/contract/fundraiser-address.test.ts` (round trip plus the hostile table) and, for the
parts that are pure functions, by the unit tests of `src/core/fundraiser/`.

Decision record: [ADR-018](../../../references/project/adr/018-fundraiser-state-in-the-address.md).

## The address

`GET /fundraiser` with up to three query keys. Every other key is ignored and is not written back.

| Key | Meaning | Written as | Default when missing or bad |
|---|---|---|---|
| `headline` | The drive's name | Plain text, URL-encoded | `Help us reach our goal` |
| `raised` | Dollars raised | `6500` or `6500.50` (no `$`, no commas) | `0` |
| `goal` | Dollars aimed for | `10000` or `10000.50` | `5000` |

Example: `/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000`

A repeated key uses its first value, as `?hold=` does. Each key is judged **alone**: a bad
`raised` never costs the good `headline` and `goal` (FR-023). The page never answers with an
error for any address (a `200` with the page, always).

## Reading (address → `Fundraiser`)

`readAddress(query: unknown)` takes whatever Next hands a page (in practice
`Record<string, string | string[] | undefined>`) and treats it as `unknown` until each value has
passed its schema. No `as`. It lives in `src/core/fundraiser/address.ts`, separate from the schemas
in `fundraiser.ts` (one reason to change each).

**Headline** (`headline`) — one shared `normaliseHeadline(text)`, used by the reader and by the
typed field alike:

0. Turn every whitespace character (tab, carriage return, newline, line and paragraph separators,
   no-break space) into a plain space, so removing control characters in the next step cannot glue
   two words together (`vet\r\nfund` stays two words). Added during execution of T003.
1. Remove control characters (`\p{Cc}`), every format character (`\p{Cf}`: zero-width space,
   joiners, soft hyphen, word joiner, and the bidirectional controls `U+200E U+200F
   U+202A–U+202E U+2066–U+2069`), and line and paragraph separators (`\p{Zl}`, `\p{Zp}`). They can
   make text read backwards, hide what is next to it, or leave a headline that is "not empty" yet
   invisible. Cost: the joiner inside a multi-person emoji is dropped, so such an emoji shows as
   separate faces. Accepted.
2. Collapse every run of whitespace to one space; trim.

Then the two callers differ, and only in this step:

- **Reader** (address): first value, cut to 600 UTF-16 units *before* step 1 (bounds the work on a
  hostile address; far above the limit, so it never changes a legitimate one); normalise; cut to
  **60 characters** counted as Unicode code points (never splitting an emoji); empty → default.
- **Typed field**: normalise; empty → `empty`; more than 60 code points → `too-long` (refused, not
  cut). The length is counted **after** normalising, so what the volunteer sees is what is counted.

A headline made only of look-alike blanks outside those categories (for example a Hangul filler,
which is a letter) can still pass. It renders as an empty-looking heading, but the headline button
keeps a minimum hit area from its line box, so the volunteer can still click it and replace it.

**Amounts** (`raised`, `goal`) — the grammar of `parseDollars`, which the in-place fields use too:

- Accepted: an optional leading `$`; digits; optional thousands commas in correct groups of three
  (`7,200`, `1,250,000`); optional one or two decimals (`.5`, `.50`). Surrounding spaces ignored.
- Refused, with a reason code: `empty`, `not-a-number` (letters, `e`, a second `$`, misplaced
  commas, spaces inside), `negative`, `too-precise` (more than two decimals), `too-large`
  (above $99,999,999.99, or more than 12 digits before the point).
- `goal` is also refused as `zero` (it must be above $0).
- `raised` may be `0` and **may exceed `goal`** (the goal-reached state).
- Text longer than 32 characters is `not-a-number` without being parsed.

## Writing (`Fundraiser` → address)

`writeAddress(fundraiser)` (pure, in `address.ts`) returns the query string. Whenever an edit is
confirmed, the edit-session hook passes it to the one call
`window.history.replaceState(null, "", writeAddress(next))`, which produces
`?headline=…&raised=…&goal=…`:

- Always all three keys, in that order, so a copied address is complete.
- Headline through `URLSearchParams` (spaces as `%20`, never `+`, so it reads the same in every
  tool).
- Amounts written canonically: whole dollars with no decimals (`6500`), otherwise two decimals
  (`6500.50`).
- `replaceState`, never `pushState`: no history entry per edit (FR-021). Back leaves the page as
  it always would.
- Nothing else is written: no cookie, no storage (FR-022).

## Invariants the contract test pins

1. **Round trip.** For every valid `Fundraiser`, `read(write(f))` equals `f` (headlines compared
   after the normalisation above).
2. **Total.** `read` returns a complete `Fundraiser` for every input, including none.
3. **Per-value fallback.** Each of the 3 keys, bad in turn with the other two good, falls back
   alone.
4. **Stable.** `write(read(write(f)))` equals `write(f)` (no drift across reloads).
5. **Hostile table**, each asserting the *denial* (Principle II): `<script>alert(1)</script>` and
   `<img src=x onerror=…>` come back as literal text, which the component test then renders and
   finds as text with no element created; a 10 000-character headline is cut to 60; bidi and
   control, format and bidi characters are gone; `headline=%E2%80%8B%E2%80%8B` (only zero-width
   spaces) falls back to the default; `raised=-5`, `raised=abc`, `raised=1e9`, `raised=0x10`,
   `raised=1,23`, `raised=1.234`, `raised=99999999999999999999`, `goal=0`, `goal=` all fall back.
6. **Unknown keys** (`?debug=1&hold=3`) change nothing and are dropped on the next write.

## What this contract does not cover

There is no Server Action, no Route Handler, and no request body. Nothing is sent to the server
except the address itself, so there is nothing else to validate at a server boundary.
