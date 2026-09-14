---
name: tidy-order
description: Reorder a profile's sections so the page reads in a sensible sequence, hero first
---

Use this when asked to tidy the order or whether the page "flows" — the "Tidy the order" chip,
or as a step inside `build-profile` when choosing where new blocks land.

## Hero stays first

The hero is always `blocks[0]` and cannot be moved. `reorder_blocks` takes a permutation of
every block id, so the hero's id is still in the list you send — just always first, unchanged.
Don't spend a turn "fixing" it.

## How the other seven read best, in order

- **bio** — put it right after the hero. A visitor should know who this cat is before
  anything else asks for their attention.
- **day** ("a day in her life") — a narrative sequence; it lands best once the reader already
  knows the cat from the bio, so keep it in the first half but after the bio.
- **photo** and **gallery** — supporting images. They work anywhere after the bio, but don't
  let two image-heavy blocks sit back to back — see the rhythm rule below.
- **needs** ("what she needs in a home") — reads best in the second half, after the reader is
  already invested, and before any testimonial closes the page. Stating a need late, once
  someone already likes her, lands better than leading with it.
- **video** — a bigger ask of the reader's attention than a photo; place it once the page has
  already built some interest, generally in the second half.
- **quote** — a foster's testimonial builds trust right before the page ends. It reads best
  last or second-to-last.

## Keep a rhythm

Don't stack more than two image-heavy blocks (photo, gallery, day, video) in a row. Alternate
them with a text block (bio, needs, quote) so the page doesn't read as a wall of pictures with
no voice in it.

## Applying it

`read_outline` first for the current ids and order. Call `reorder_blocks` once with the full
permutation you want — it must include every existing id exactly once, hero first. Never
publish, and never remove a block to "tidy" the order — reordering only changes sequence, not
what's on the page.

Then `read_outline` again to re-read what you changed and confirm the order landed the way
you intended.
