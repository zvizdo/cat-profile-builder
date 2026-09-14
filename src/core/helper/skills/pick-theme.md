---
name: pick-theme
description: Choose a theme preset from the photos' tones and tune warmth and contrast within the contrast rule
---

Use this when asked to warm things up, asked which theme fits, or asked to "make it match
her" — including as a step inside `build-profile`.

## 1. Read the photos' tones

`view_photos` on the hero photo and one or two others already placed, if you haven't seen them
yet this turn. Notice: warm or cool light (golden-hour orange versus overcast blue-grey),
bright and high-key or dim and moody, and how much the cat's own colouring stands out against
a light or dark ground.

## 2. Choose a preset

Four exist — use these names with `set_theme`, nothing else:

- **paper** — warm, light neutral. The default, and right for most ordinary daylight photos.
- **card** — crisp white and pale blue-ink. Best for bright, high-key, evenly lit photos.
- **night** — dark ground, light ink. Fits dramatic or moody photos, low light, or a
  dark-coated cat you want to stand out against the background rather than blend into it.
- **sand** — warm tan. Fits warm, earthy, outdoor-toned photos.

Pick the one preset whose feel already matches the photos, rather than fighting the tuning
knobs to fake a different preset.

## 3. Tune warmth and contrast

`warmth` shifts the background hue toward amber and never changes lightness, so it cannot
fail the contrast rule on its own — turn it up for golden, orange-toned photos and down for
cool, blue-toned ones. `contrast` scales how strongly the ink stands out from the background;
raise it for a bolder look, lower it for something quieter — but every preset only stays
readable down to a point. The rule that matters: ink against background must stay at or above
a 4.5:1 contrast ratio. Watch the builder's own contrast note as you adjust, and back off
`contrast` if it stops saying "passes AA." Don't push contrast to an extreme just to test it.

## 4. Apply and check

`set_theme` with the preset and, if you changed them, `warmth` and `contrast`. Never publish,
and never leave a theme applied that fails the 4.5:1 contrast ratio without saying so to the
volunteer.

Then `read_page` again to re-read what you changed — it carries the theme's contrast ratio
directly — and confirm it's still at or above 4.5:1.
