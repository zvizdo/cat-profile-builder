# Specification Quality Checklist: Fundraising Thermometer Display

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Boxes are reviewer-owned (CLAUDE.md); the author never ticks, unticks, or rewords them. The
author's own pass, for the reviewer to confirm or overturn:

- **Clarification resolved.** The one open question (who may edit) was answered: anyone with the
  address, and the numbers live only in the page address, with no database. FR-021 to FR-026 and
  User Story 3 were rewritten to match. No `[NEEDS CLARIFICATION]` markers remain.
- **Deliberate "implementation" wording.** "Page address", "no server storage", and "no browser
  storage" (FR-021, FR-022) are stated because they are the user's requirement, not a technology
  choice. The reviewer may judge whether that crosses the line.
- **Invented numbers to confirm.** SC-001 (15 seconds), SC-003 (five metres on 50 inches), SC-004
  (five screen shapes), and the headline limit (about 60 characters) are my defaults, not the
  user's. The headline limit and the dollar ceiling are deferred to planning.
- **Layout guess.** The description says "right side" twice, for both the thermometer and the
  logo. The spec puts the thermometer on the right and the logo, headline, and amounts on the
  left (Assumptions).
- **Brainstorm 2026-10-06.** The spec gained a Design Direction section (dark ground, paw-print
  milestones, in-place editing for amounts and headline, goal-reached state, phone layout as a
  centered stack), FR-031, SC-010, SC-011, and a Brainstorm Log. The "cat outline" was dropped on
  purpose because the logo already has a cat. The design section describes how the page looks,
  which the reviewer may weigh against the "no implementation details" item.
- **Known tradeoff.** Open editing plus text carried in the address means anyone can craft a
  convincing link on the shelter's own site (Assumptions, "Open to anyone"). Accepted by the
  user's choice; it needs a security look at planning (constitution: security review is required
  at the server/client boundary).
- **Planning change, 2026-10-06.** SC-010 now says the percentage tag is rounded *down* (it said
  "nearest"), because rounding to nearest could show 25% over a dark 25% paw or 100% before the
  goal. The headline limit (60) and amount ceiling ($99,999,999.99) deferred to planning were
  set in the plan. Three choices the spec did not make are listed under "Open items" in plan.md
  for the reviewer.
- **Plan review, 2026-10-06.** FR-009 gained a display cap: a percentage above 999 is shown as
  `999%+` (a $0.01 goal would otherwise print twelve digits). Boxes above were ticked before this
  and before SC-010's rounding change; the reviewer may want to re-read FR-009 and SC-010.
- **Constitution fit.** Likely touches Principle IX (tokens, reduced motion, WCAG, phone width),
  Principle VI (the address is untrusted input and needs a schema at the boundary), and
  Principle VII (no new storage). The plan must show this under its compliance check.
