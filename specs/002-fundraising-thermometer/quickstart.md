# Quickstart: Fundraising Thermometer Display

How to prove the feature works, once built. Nothing here needs sign-in, a database, or a model.

## Prerequisites

```bash
pnpm install --frozen-lockfile
STORE=fs MODEL=fake pnpm dev        # http://localhost:3000/fundraiser
```

Contracts: [address](contracts/address.md) · [editing](contracts/editing-interaction.md) ·
[layout](contracts/display-layout.md). Types: [data-model.md](data-model.md).

## Scenarios

Each is a person doing something, then what they must see. The *Covers* column is what the final
`/speckit-converge` check looks for.

| # | Do this | Expect | Covers |
|---|---|---|---|
| 1 | Open `/fundraiser` with nothing in the address. | A complete page: default headline, **$0** raised, **$5,000** goal, an empty thermometer with its bulb and outline, all four paws dark. A one-line hint about setting the goal (editing view only). | FR-024, SC-006 |
| 2 | Open `/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000`. | Fill at 65 %, a "65%" tag on the fill line, the 25 % and 50 % paws lit, 75 % and `$10K` dark, "$6,500 raised of $10,000 goal". | US1.1, FR-003, FR-031 |
| 3 | Hover the thermometer. Move the pointer onto the raised figure and type `7,200`. Press Enter. | Fields appear in place with a blue underline, nothing shifts, the pointer can travel to the field without it closing; after Enter the figures are plain text again, the fill glides to 72 %, the address now reads `…raised=7200…`. | US2.1–2, FR-013, FR-014 |
| 4 | Edit the goal to `0`, press Done. | Refused under the field in plain words; the old numbers stay; the address does not change. Same for `abc`, `-5`, and an empty field. | US2.5, FR-017, SC-008 |
| 5 | Open a field, change it, press Escape (then again, clicking elsewhere). | Nothing changes; the fields are plain text. | US2.4, FR-015 |
| 6 | Click the headline, replace it, press Enter. Then clear it and confirm. | New headline shown, same underline and Done as the amounts. Empty is refused; 61 characters is refused. | US4, FR-016, FR-018, SC-011 |
| 7 | Raise the amount to $12,000 of $10,000. | Thermometer completely full, four paws lit, a "Goal reached" pill beside the goal, tag reads **120%**. | US2.7, FR-009 |
| 8 | Reload. Open the same address in a second window. Press Back after several edits. | Same headline, numbers, fill both times. Back leaves the page as it normally would; it does not undo edits one by one. | US3.1–3.5, FR-021, SC-005 |
| 9 | Try each bad address: `?raised=abc`, `?goal=-1`, `?goal=0`, `?headline=%3Cscript%3E`, `?raised=1e9&goal=2000`. | Always a full page. Each bad value falls back alone; the script text is shown as plain words. | US3.4, FR-020, FR-023 |
| 10 | Press **Full screen**. | The button and every editing control vanish; hovering the thermometer does nothing; nothing is cropped. Press Escape: back to the editing view, same numbers. | US1.2–1.3, FR-010–012 |
| 11 | Use only the keyboard: Tab through the page, open the amounts, change them, confirm. | Visible focus everywhere; the order is Full screen → headline → thermometer → raised → goal → Done; focus returns to the thermometer after Done **without reopening it**. | FR-027, SC-009 |
| 12 | Turn on the operating system's "reduce motion", change the amount. | The fill jumps with no glide. | FR-008, SC-009 |
| 13 | Open it on a phone (or a 390×844 window). | One centered column: logo, headline, amount, goal, then the upright thermometer; paws and tag unchanged; tapping the thermometer opens the fields. | FR-030 |
| 14 | Leave a field open for a minute. | It closes by itself with no change. | Edge Cases |
| 15 | On a phone, tap the thermometer, tap a field so the keyboard opens, type, tap Done. | The layout stays a stack the whole time (it never flips to side by side); Done works on the first tap and the typed text is applied. | FR-030, FR-013 |
| 16 | In full screen on a phone-sized window with a field open (start one, then press Full screen). | The session is gone on entering full screen and does not come back on exit. | FR-012 |

## The five-shape check (SC-004, FR-007)

Open `/fundraiser?headline=WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW&raised=99999999.99&goal=99999999.99`
(the longest headline of wide letters, the largest amounts), plus
`/fundraiser?raised=99999999.99&goal=0.01` (the largest possible percentage, which must read `999%+`
and fit) at 1920×1080 (16:9), 1920×1200
(16:10), 1024×768 (4:3), 2560×1080 (21:9), and 1080×1920 (9:16). In each: no scrolling, nothing
clipped, nothing overlapping the thermometer, every text at or above its floor. Then the phone
sizes in [display-layout.md](contracts/display-layout.md) → Short screens. The end-to-end spec
automates this with bounding-box assertions.

## On-site checks (cannot be automated)

- **SC-003.** On the real 50-inch screen, stand five metres away: amount raised and goal both
  readable at a glance.
- **SC-007.** Run it full screen for eight hours; the screen stays awake and nothing stalls.
- **SC-001.** A volunteer who has not seen the page changes the amount and gets back to a clean
  full screen in under 15 seconds, unprompted.

## The gates

```bash
pnpm gen-tokens --check         # tokens.css matches TOKENS.json (what CI runs)
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test                       # coverage: core 95/95, app 80/80
pnpm build && pnpm test:e2e     # includes tests/e2e/fundraiser.spec.ts
```

The kiosk's own tests (`tests/component/carousel/KioskShell.test.tsx`, `tests/e2e/kiosk.spec.ts`)
must still pass unchanged: the wake-lock hook was extracted from it.
