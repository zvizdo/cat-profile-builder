# README screenshots

The images in this folder are the ones `README.md` embeds. This note says what each one
shows and how it was taken, so they can be re-shot when the app changes.

All shots are viewport-only captures (no browser chrome) of a running deployment, taken
with the repository's own Playwright (`@playwright/test`, headless Chromium). Desktop shots
use a 1440×900 viewport at 2× device pixel ratio; phone shots use Playwright's
`devices["iPhone 14"]` profile (390×844 CSS px, 3×); the kiosk uses 1920×1080 at 1×. Each
file was then resized with `sharp` (already a dependency) to at most 1600 px wide (phone
shots 780 px), saved as an 8-bit palette PNG, and kept under 400 KB. The cats are two real
published profiles, Charlotte and Vini. Nothing on either profile was changed: every
CATalyst proposal was declined with **Not this**, and the bio text was read back after a
reload and compared byte for byte with the text before.

| File | What it shows | How |
| --- | --- | --- |
| `1-builder-proposal.png` | The builder at desktop width with CATalyst docked on the right and a proposal card open: the bio shortened, removed words struck through and added words underlined, the "replaces your text" warning, and the Apply / Not this choice. | Sign in, open Charlotte, type `Shorten the bio.` into the CATalyst composer, wait for the card, capture, then press **Not this**. |
| `2-phone-builder.png` | The builder on a phone: facts and theme collapsed to one line each, the hero with its photo actions, the first section, and the Media / CATalyst drawer bar. | Sign in on the iPhone 14 profile, open Charlotte, capture at the top of the page. |
| `3-profile.png` | The public profile page at desktop width: the hero with the cat's name and tagline over the photo. | Open the published page, wait for fonts and images, capture. |
| `4-profile-story.png` | The same page scrolled to the story: the facts strip and the bio in two columns. | Click **Story** in the page's own navigation, scroll back up 150 px so the facts strip clears the header, capture. |
| `5-profile-phone.png` | The public profile page on a phone. | Open Vini's page on the iPhone 14 profile, capture at the top. |
| `6-cats.png` | `/cats`, the public index of every published cat. | Open `/cats` at desktop width, capture, crop the empty ground below the cards. |
| `7-kiosk.png` | `/kiosk` at 1920×1080: a photo beat with the name, the one-line summary, the fact pills, the "up next" strip and the scan-to-keep QR card. | Open `/kiosk`, poll the incoming media layer (`[data-layer][data-role="incoming"]`) until it holds a photo rather than a clip, wait three seconds for the slats to land, capture. The QR encoded that deployment's own address, so it was swapped for a placeholder: encoded `https://example.org/cats/vini` with the app's own encoder (`qrcode`'s `create(url, { errorCorrectionLevel: "H" })`, the same call `QrCard.tsx` makes), rasterized the module grid to a 180×180 black-on-white PNG, and composited it with `sharp` over the exact box the card's `<svg>` occupies at this screenshot's scale (240 CSS px at the layout's own `--carousel-card-padding`/`--carousel-qr` tokens, scaled by the shot's 1440/1920 resize factor) — same size, position and quiet zone as the real card, just a harmless URL. Decoded back with `jsqr` to confirm it reads `https://example.org/cats/vini`. |

Re-shooting: point a script at any deployment (or `STORE=fs MODEL=fake pnpm dev` with
seeded cats), sign in with that deployment's shelter account, and repeat the steps above.
With the fake model, `Shorten the bio.` produces the same kind of card as the real one
(the `edit-proposals` scenario in `src/adapters/fake`). Never leave a proposal applied on a
real profile; decline it and check the text afterwards.
