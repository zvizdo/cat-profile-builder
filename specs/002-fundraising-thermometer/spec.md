# Feature Specification: Fundraising Thermometer Display

**Feature Branch**: `002-fundraising-thermometer`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "A standalone page, like the kiosk, that shows the South County Cats
logo, maybe a cat outline, and a fundraising thermometer. It runs full screen on a display. A
volunteer comes by and updates the goal and the amount raised. The thermometer is always filled
to the amount raised. It should look polished, like the rest of the design, and read clearly
from a distance. Outside full screen, the title, the amount raised, and the goal can be edited
in place; when the edit is confirmed the page settles straight back into the clean display."

## Overview

South County Cats runs fundraising drives and wants the progress shown on a screen at the shelter
or at an event: one big, calm, beautiful page with the shelter's mark, a thermometer that fills as
money comes in, and a headline. A volunteer walks up, updates the numbers in a few seconds, and
walks away; the page goes straight back to looking like a finished poster, not an admin form.

This is a single page, separate from the cat profiles and the carousel. It has two modes that
feel like one page: a **display** (full screen, nothing to click, built to be read from across a
room) and an **editing view** (the same page, not full screen, where the headline, the amount
raised, and the goal can be changed in place).

## Design Direction

Settled in the brainstorm of 2026-10-06 (mockups were reviewed in a browser; they are not part
of the repository):

- **Ground and type.** The dark "night" ground used by the existing kiosk carousel, with the white
  logo, a large serif headline and a very large serif amount raised, and small mono labels. One
  soft blue glow behind the left group. Same colour, type, and spacing language as the rest of
  the product.
- **Left group.** The logo at top left; below it a small label ("Current fundraiser"), the
  headline, the amount raised in very large type, and "raised of $X goal" beneath.
- **Right group: the thermometer.** A tall, chunky thermometer (bulb at the bottom) filled with a
  blue gradient that brightens as it rises. A small tag riding on the fill line states the
  percentage reached and the amount raised in compact dollars (`65% ($6.5K)`). Down its left side, paw prints replace tick marks at 25%, 50%, 75%, and the
  goal; each paw lights up once the fill reaches it.
- **No separate cat outline.** The logo already carries a drawn cat, and the paw prints carry the
  cat theme, so no second cat illustration is shown.
- **Editing view.** The same page plus one small control: a "Full screen" button in the top-right
  corner, kept clear of the thermometer. Hovering (or keyboard-focusing, or tapping) the
  thermometer turns the amount raised and the goal into fields in the same place, size, and type
  they are displayed in, marked by a blue underline, with a small "Done" control. Nothing pops
  up. Clicking the headline does exactly the same for the headline. Finishing returns the page
  to the clean display look.
- **Goal reached.** The thermometer is completely full, every paw is lit, and a "Goal reached"
  tag appears beside the goal. The percentage tag shows the true figure (for example 120%), so
  an overshoot is never hidden.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Show the drive full screen (Priority: P1)

A volunteer opens the page on the shelter's screen and presses the full screen button. The page
fills the screen and shows the South County Cats logo, the headline, and a large thermometer
filled to the share of the goal raised so far, with the dollars raised and the goal written
clearly beside it and paw-print milestones lit up as they are reached. Nothing else is on screen.
Visitors across the room can read it.

**Why this priority**: This is the whole point of the feature. A display that looks right and
reads from a distance is valuable even if the numbers can only be changed by other means.

**Independent Test**: Open the page with a goal and an amount raised already set, press the full
screen button, and check that the screen holds only the logo, headline, amounts, and
thermometer, that the fill level matches the amount raised, and that the text is readable from
several metres away.

**Acceptance Scenarios**:

1. **Given** a goal of $10,000 and $6,500 raised, **When** the page is shown, **Then** the
   thermometer is filled to 65% of its height, a "65%" tag sits on the fill line, the 25% and 50%
   paw prints are lit and the 75% and goal paw prints are not, and the screen states $6,500
   raised of a $10,000 goal.
2. **Given** the page is not in full screen, **When** the volunteer presses the full screen
   button, **Then** the page fills the screen, every editing affordance and the button itself
   disappear, and the layout is complete with nothing cropped or overlapping.
3. **Given** the page is in full screen, **When** the volunteer presses Escape (or the browser's
   own exit), **Then** the page returns to the editing view with the same numbers and headline.
4. **Given** screens of different shapes (a widescreen TV, a laptop, a portrait-mounted monitor),
   **When** the page is shown full screen, **Then** the logo, headline, amounts, and
   thermometer all fit with no scrolling and no clipped content.
5. **Given** the full screen display is running, **When** nobody touches it for a long time,
   **Then** it keeps showing the same composition unchanged and does not drift, stall, or show
   chrome of any kind.

---

### User Story 2 - Update the amount raised and the goal (Priority: P1)

A volunteer, outside full screen, moves the pointer over the thermometer. The big amount raised
and the goal on the left turn into fields right where they are, same size and type, with a blue
underline. They type a new amount, press Enter or Done, and the fields turn back into plain
display text. The thermometer fills (or drains) smoothly to the new level and the page looks
like a finished display again. They press full screen and leave. Nothing pops up or covers the
page at any point.

**Why this priority**: Updating the numbers is the only reason a person ever touches this page.
If it is slow or fiddly, the display goes stale and the feature fails.

**Independent Test**: With the page in the editing view, hover the thermometer, change the
amount raised from $6,500 to $7,200, confirm, and check the fill moves to 72% and no form is left
on the page.

**Acceptance Scenarios**:

1. **Given** the editing view, **When** the volunteer hovers (or focuses with the keyboard, or
   taps) the thermometer, **Then** the amount raised and the goal become editable in place, with
   the same size and position as when displayed and no layout shift, and the thermometer is
   highlighted to show what is being edited.
2. **Given** the fields are editable, **When** the volunteer changes the amount raised and
   confirms (Enter or Done), **Then** the fields turn back into plain text, the thermometer
   animates to the new level, and the page shows no leftover form or message beyond a brief
   unobtrusive confirmation.
3. **Given** the fields are editable, **When** the volunteer changes the goal and confirms,
   **Then** the fill level and the paw-print milestones are recalculated against the new goal and
   the displayed goal updates.
4. **Given** the fields are editable, **When** the volunteer cancels (Escape or clicking away
   without confirming), **Then** nothing changes and the fields turn back into plain text.
5. **Given** the fields are editable, **When** the volunteer enters something that is not a valid
   amount (empty, negative, or not a number), **Then** the confirm is refused, the field says
   what is wrong in plain words, and the previous numbers stay on the display.
6. **Given** the page is in full screen, **When** the pointer moves over the thermometer, **Then**
   nothing becomes editable; full screen never shows editing controls.
7. **Given** the amount raised is raised past the goal, **When** the change is confirmed, **Then**
   the thermometer is completely full, every paw print is lit, a "Goal reached" tag appears, and
   the percentage tag shows the true figure (for example 120%).

---

### User Story 3 - The numbers live in the page address (Priority: P2)

Whatever the volunteer confirms is written into the page's own web address, and nowhere else.
Nothing is stored on a server or in a database. Reloading the page, or bookmarking the address
and opening it later or on another screen, brings back the same headline, amount raised, and
goal. To set up a screen, the volunteer opens the page, edits it, and keeps that address (as a
bookmark, or by sending the link to the screen's machine).

**Why this priority**: A display that forgets its numbers on reload would be useless, and a
shareable address is the chosen way to carry them. It ranks below the display and the editing
because those work on their own; this story is what makes their result last.

**Independent Test**: Update the numbers, copy the address from the browser, open it in a
different browser window, and check the same headline, amount, goal, and fill level appear.

**Acceptance Scenarios**:

1. **Given** the numbers were confirmed, **When** the page is reloaded, **Then** the same
   headline, amount raised, and goal appear.
2. **Given** the numbers were confirmed, **When** the address is opened in another window or on
   another device, **Then** that page shows the same headline, amount raised, goal, and fill.
3. **Given** the page is opened with no numbers in the address, **When** it loads, **Then** it
   shows a sensible starting state (a default headline, $0 raised, and a placeholder goal the
   volunteer is invited to set), not an error or a blank page.
4. **Given** an address whose values are missing, garbled, or out of range (for example an amount
   of "abc" or a negative goal), **When** it is opened, **Then** each bad value falls back to its
   starting default, the good values are kept, and the page still displays correctly.
5. **Given** the volunteer confirms several edits in a row, **When** they press the browser's back
   button, **Then** it leaves the page the way it normally would, and does not step back through
   each edit.

---

### User Story 4 - Edit the headline (Priority: P2)

Outside full screen, the volunteer clicks the headline and it becomes editable in place, in the
same type, at the same size, in the same position, with the same blue underline the amount
fields use, so the two kinds of editing look and feel like one thing. They change the words,
confirm, and the headline settles back into the page as ordinary display text.

**Why this priority**: Drives change ("Spring Vet Fund", "Kitten Season"), so the headline must
be changeable, but it changes far less often than the amount raised.

**Independent Test**: In the editing view, click the headline, replace it, press Enter, and check
the new headline is shown, no input box remains, and it is still there after reload.

**Acceptance Scenarios**:

1. **Given** the editing view, **When** the volunteer clicks (or keyboard-activates) the headline,
   **Then** it becomes editable in place without the layout jumping, shown with the same blue
   underline and the same small Done control as the amount fields (Enter also confirms and
   Escape cancels, in both).
2. **Given** the headline is being edited, **When** the volunteer confirms, **Then** the new
   headline is written into the address and shown as plain display text.
3. **Given** the headline is being edited, **When** the volunteer cancels, **Then** the old
   headline stays.
4. **Given** the headline is cleared and confirmed, **When** the change is applied, **Then** the
   page refuses the empty headline and keeps the previous one, saying why.
5. **Given** a very long headline, **When** it is shown full screen, **Then** it stays fully
   visible and legible within the layout, never clipped and never pushing the thermometer off screen.

---

### Edge Cases

- **Raised exceeds the goal** ($12,000 of $10,000): the thermometer shows completely full, every
  paw print is lit, a "Goal reached" tag appears, and the percentage tag shows the true 120%,
  rather than overflowing, hiding the overshoot, or showing a broken fill.
- **Raised exactly equals the goal**: the same goal-reached state, with 100%.
- **Goal of zero or empty**: refused on confirm; a goal must be a positive amount. The fill never
  divides by zero.
- **Amount raised of zero**: the thermometer is empty but still reads as a thermometer (its bulb
  and outline visible), and the text says $0 raised.
- **Cents and large numbers**: amounts are whole or two-decimal dollars; very large totals
  (for example $1,250,000) stay legible and fit without wrapping awkwardly. Thousands separators
  are shown.
- **Entering a number with a dollar sign or commas** ("$7,200"): accepted and understood.
- **Reduced motion**: when the viewer has asked for reduced motion, the fill jumps to the new
  level instead of animating, and no decorative motion plays.
- **Full screen not available** (browser refuses or the device does not support it): the button
  says so plainly and the page remains fully usable in its normal view.
- **Two screens, two addresses**: each screen shows only what is in its own address. Changing
  the numbers on one screen does not change another screen; this is by design, because nothing is
  shared.
- **A very long headline in the address**: the headline limit (FR-018) keeps the address a sensible
  length, and an address carrying a longer headline is shortened to the limit rather than refused.
- **Markup in the address**: a headline containing tags or script text is shown as literal text
  and never run.
- **A browser restart on the display machine**: the numbers come back only if the browser reopens
  the same address (a bookmark, a start page, or a restored tab). The page cannot recover them on
  its own, since it keeps nothing.
- **Editing left open on a display**: if the editing view is left idle with a field open, it
  closes itself without applying the change after a while and the display returns to its clean
  state.
- **Touch screens**: there is no hover on a touch display, so tapping the thermometer or the
  headline starts the same in-place editing.
- **Images still loading**: the logo never blocks the thermometer or text from appearing; the
  page is readable before it arrives.
- **Paw prints and a changed goal**: when the goal changes, the paw prints move to the new 25%,
  50%, and 75% marks, and each is lit or unlit according to the new fill. They never show a
  stale state.
- **Page opened on a phone**: usable at phone width (stacked layout), though the primary target is
  a large landscape display.

## Requirements *(mandatory)*

### Functional Requirements

**Display**

- **FR-001**: The page MUST be a standalone page, separate from the builder, the cat profiles,
  and the carousel, reachable at its own fixed address, and MUST NOT show the builder's or the
  public site's navigation.
- **FR-002**: The page MUST show the South County Cats logo, a headline, the amount raised, the
  goal, and a fundraising thermometer, composed as one polished, editorial layout on the dark
  ground used by the existing kiosk, consistent with the rest of the product's visual design (same
  type, colour, and spacing language), as set out in Design Direction.
- **FR-003**: The thermometer MUST be filled to exactly the share of the goal raised
  (amount raised ÷ goal), capped at fully full, and MUST be redrawn to match whenever either
  number changes.
- **FR-004**: The page MUST state, in large legible text beside the thermometer, the amount raised
  and the goal in dollars, and MUST show the percentage of the goal reached, with the amount
  raised in compact dollars beside it (`65% ($6.5K)`), as one line in a tag on the thermometer's
  fill line.
- **FR-005**: The thermometer MUST sit on the right of the screen and the logo, headline, and
  amounts on the left, the two groups balanced and neither crowding the other.
- **FR-031**: The thermometer MUST carry paw-print milestones at 25%, 50%, 75%, and the goal. A
  paw print MUST be lit exactly when the fill has reached it and unlit otherwise, and each MUST
  also be labelled with its percentage or the goal amount, so the state is never conveyed by the
  light alone.
- **FR-006**: In display (full screen) mode, the amount raised, goal, and headline MUST be large
  enough to read from across a room, scaling with the screen rather than being fixed in size.
- **FR-007**: The full screen layout MUST fit any screen shape without scrolling, clipping, or
  overlap, including widescreen, standard, and portrait orientations.
- **FR-008**: When the amount raised changes, the thermometer fill MUST animate smoothly to the
  new level, and MUST NOT animate when the viewer has asked for reduced motion.
- **FR-009**: When the amount raised meets or exceeds the goal, the page MUST show the
  thermometer completely full, light every paw print, show a "Goal reached" tag, and show the true
  percentage (for example 120%) rather than capping the number at 100% (beyond 999%, it is shown as 999%+, so it always fits).

**Full screen**

- **FR-010**: The page MUST offer a full screen button in its normal view. Pressing it MUST put
  the page into full screen and hide the button and every editing affordance.
- **FR-011**: Pressing Escape (or the browser's own exit) MUST leave full screen and return to the
  editing view with all numbers and the headline unchanged.
- **FR-012**: In full screen the page MUST show no controls, no editing state, and no
  text-editing affordance, and MUST NOT require any interaction to remain correct.

**Editing**

- **FR-013**: Outside full screen, hovering, keyboard-focusing, or tapping the thermometer MUST
  turn the amount raised and the goal into editable fields in the place, size, and type where
  they are displayed, marked by a blue underline, with no popup and no layout shift. The
  thermometer MUST be visibly highlighted while they are editable.
- **FR-014**: Confirming (Enter or a Done control) MUST apply both values and write them into the
  address, turn the fields back into plain display text, and return the page to its clean
  display look without any leftover form.
- **FR-015**: Cancelling (Escape or clicking away without confirming) MUST discard unconfirmed
  changes and turn the fields back into plain display text.
- **FR-016**: Outside full screen, the headline MUST be editable in place by clicking,
  tapping, or keyboard-activating it, in exactly the same style as the amount fields (same blue
  underline, same Done control, same Enter and Escape behaviour); confirming writes it into the
  address and returns it to plain display text, cancelling restores the previous text.
- **FR-017**: The amount raised MUST be a non-negative dollar amount and the goal MUST be a
  positive dollar amount; invalid input MUST be refused with a plain-language message and MUST
  leave the previous values on display.
- **FR-018**: The headline MUST NOT be empty and MUST have a stated maximum length; an empty or
  over-long headline MUST be refused with a plain-language message.
- **FR-019**: Input such as "$7,200" or "7200.50" MUST be accepted and understood as a dollar
  amount.
- **FR-020**: Headline text MUST be displayed as plain text only and MUST NOT be interpreted as
  markup.

**State lives in the address**

- **FR-021**: The headline, amount raised, and goal MUST be carried in the page's web address.
  Confirming an edit MUST update the address in place, without reloading the page and without
  adding a step to the browser's back history for each edit. Reloading, or opening that address
  elsewhere, MUST show the same headline, amount, goal, and fill.
- **FR-022**: The feature MUST NOT store the headline, amount raised, or goal on any server, in
  any database, or in the browser's own storage. The address is the only place they live.
- **FR-023**: When the address is read, each value that is missing, malformed, or out of range
  MUST fall back to its own starting default while the valid values are kept, and the page MUST
  still display correctly. It MUST NOT show an error page for a bad address.
- **FR-024**: A page opened with no values in the address MUST show a sensible starting state
  (default headline, $0 raised, a placeholder goal) rather than an error or a blank page.

**Access**

- **FR-025**: The page MUST NOT require signing in, either to view it or to change its numbers or
  headline. Anyone with the address can both view and edit it. Edits affect only the address in
  that person's own browser; they never alter what any other screen shows.
- **FR-026**: The page MUST NOT expose the shelter's builder, its profiles, or any other part of
  the product through its editing controls.

**Quality**

- **FR-027**: Every control and editable text on the page MUST be operable by keyboard alone,
  with visible focus, accessible labels, and sufficient contrast (including the small labels
  against the dark ground), and the logo MUST carry appropriate alternative text.
- **FR-028**: The thermometer MUST be understandable to assistive technology: its current amount,
  goal, and percentage MUST be available as text, not only as a drawing.
- **FR-029**: The logo MUST NOT block the thermometer or the text from appearing while it loads.
- **FR-030**: The page MUST remain usable at phone width. At phone width the page MUST stack as
  one centered column: the logo, then the headline, then the amount raised and the goal, then
  the same upright thermometer beneath them (not a different, horizontal thermometer), with the
  paw milestones and the percentage tag unchanged.

### Key Entities

- **Fundraiser display**: the one fundraising display a given address shows. Attributes: headline
  (short text), amount raised (dollars), and goal (dollars). It exists only inside the address;
  nothing is stored, no history of past drives is kept, and two different addresses are two
  independent displays.
- **Progress**: derived, not stored, the share of the goal raised (amount raised ÷ goal),
  capped for display at fully full, with a separate "goal reached" state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A volunteer can change the amount raised and return the page to a clean full screen
  display in under 15 seconds from a standing start, on their first attempt, with no instructions.
- **SC-002**: The thermometer's fill matches the true share of the goal raised to within 1% of the
  thermometer's height, for every valid pair of amounts, including zero, exactly-met, and over-met.
- **SC-003**: In full screen, the amount raised and the goal are legible from at least five
  metres away on a 50-inch display.
- **SC-004**: The full screen layout shows with no clipping, overlap, or scrolling on the five
  common shapes of display (16:9, 16:10, 4:3, 21:9, and 9:16 portrait).
- **SC-005**: Opening the page's address in a second window or on a second device shows the same
  headline, amount raised, goal, and fill level as the first, every time.
- **SC-006**: After a reload, 100% of the confirmed numbers and the headline are shown unchanged,
  and an address with any bad value still produces a correct, complete display (never an error).
- **SC-007**: The full screen display runs for eight continuous hours unattended without
  stalling, drifting, or needing a refresh (matching the kiosk's bar).
- **SC-008**: Every invalid entry (empty, negative, zero goal, over-long headline, non-numeric)
  is refused with a message a non-technical volunteer can act on, and in none of these cases does
  the display change.
- **SC-009**: Every control passes a keyboard-only walkthrough, and the page meets the project's
  accessibility standard and its reduced-motion rule.
- **SC-010**: For every valid pair of amounts, the paw prints lit are exactly those at or below
  the fill, and the percentage tag shows the true share rounded down to a whole percent (so it
  never claims a milestone the paw prints have not reached), including amounts above the goal.
- **SC-011**: Editing the headline and editing the amounts are indistinguishable in style: a
  reviewer shown both cannot find a visual difference in the editing treatment.

## Assumptions

- **One fundraiser at a time.** The page shows a single drive; keeping a list of past or
  concurrent drives is out of scope.
- **Layout.** The thermometer is on the right and the logo, headline, and amounts on the left, as
  the description first says; the two sides are mirrored only if the user asks.
- **Where the numbers live.** In the page's address only (the user's decision): no database, no
  server storage, no browser storage. A screen is set up by editing the page once and keeping the
  resulting address. The page does not update by itself when someone edits elsewhere, because
  nothing is shared between screens. Changing a running display means editing it directly (or
  opening a new address on it).
- **Dollars only.** Amounts are in US dollars; other currencies are out of scope.
- **Thresholds and ceiling.** The headline length limit and the amount ceiling are set during
  planning at sensible values (for example, about 60 characters and under one hundred million
  dollars); edge behaviour above the ceiling is refusal with a plain message.
- **No separate cat outline.** Dropped in the brainstorm: the logo already has a drawn cat. The
  user's "maybe a cat outline" is met by the logo plus the paw-print milestones.
- **Reuse.** The existing South County Cats logo (the white version) and the existing design
  language are reused. The only new artwork is the small paw-print mark.
- **Full screen** uses the browser's own full screen capability; behaviour on devices that do not
  offer it is described in Edge Cases.
- **Open to anyone with the address** (the user's decision). Viewing and editing both need no
  sign-in. **Main tradeoff**: since the address carries the headline, anyone can craft a link
  to this page with their own headline and amounts, and it will look official because it sits on
  the shelter's own site. Accepted for now; mitigations (plain-text only, headline length limit)
  are in the requirements, and signing or locking addresses is out of scope.
- **Out of scope**: donation processing or linking to donation pages, donor names or a donor
  list, history or charts of progress over time, multiple themes or colour choices, and
  automatically pulling totals from a payment provider.

## Open Questions

| # | Question | Default if unanswered | Status |
|---|----------|-----------------------|--------|
| 1 | At phone width, what does the stacked layout look like? | Centered stack with the same upright thermometer beneath (FR-030). | Resolved 2026-10-06: the user chose the centered stack over "beside the text" and "lying down". |

## Brainstorm Log

### 2026-10-06 — Design directions

Focus: what the page should look like. Four layouts were drawn with the shelter's real logo,
colours, and type and compared in a browser; three further rounds narrowed it.

- **Layout.** Four options (paper poster, night stage, cat-shaped gauge, wide horizontal band).
  The user chose the **night stage**, matching the existing kiosk.
- **Cat treatment.** Four options (logo only, small cat at the base, giant ghost cat, paw-print
  milestones). The user chose **paw-print milestones**. The logo already has a cat, so no extra
  outline.
- **Editing.** Two options (a popover card, or the figures turning into fields in place). The
  user chose **in place**, and asked that the **headline use the same style**.
- **Insights.** The logo already carries a cat. The Full screen button must not overlap the
  thermometer's tip (the thermometer starts lower to leave room). Hover does not exist on touch
  screens, so tapping must also start editing. When the goal is passed, the true percentage must
  be shown, not capped. Paw prints must be labelled so lit/unlit is never the only signal.
- **Phone width.** Three options (upright beside the text, a horizontal bar under the amount, a
  centered stack with the upright thermometer below). The user chose the **centered stack**:
  one thermometer design to build and test, and the text gets the full width. Short phones give
  the thermometer less height, which the plan must handle.
- **Left unexplored.** Everything else in Edge Cases was already settled by the clarification
  and has no new decisions.
