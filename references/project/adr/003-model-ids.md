# ADR-003: Model identifiers

**Status**: accepted · **Date**: 2026-09-10

## Context

The constitution fixes model IDs in an ADR and reads them from environment. Two roles exist:
drafting and page editing (Gemini) and alternative text on upload (a cheaper Gemini). Photo
enhancement uses no model in v1 (ADR-016).

## Decision

| Role | Env var | Default value | Why |
|---|---|---|---|
| Drafting and editing | `MODEL_DRAFTING` | `gemini-3.8-flash` | Tool streaming, image input, fast enough to put the first block on the canvas within eight seconds (FR-080). |
| Alternative text | `MODEL_DESCRIBER` | `gemini-2.5-flash-lite` | Cheapest model with image *and* video input. Video input is capped at the 15 s trimmed clip (ADR-006), which bounds the per-call cost. The spec says "a cheaper Gemini 3.x model"; when a 3.x lite tier is generally available the env value changes and nothing else does. |

Rules: the values live only in the environment schema (`src/adapters/config.ts`) with these
defaults; no literal appears elsewhere. The spec asks for "the cheapest Gemini model that
accepts video input" for the describer; the default above is that model today and the env
value moves when a cheaper one ships. The model id is logged with each call at debug level;
nothing else records it since cost accounting is waived.

## Alternatives rejected

- `gemini-3.1-pro-preview` for drafting — better prose, but slower to first tool call, and
  the five-second bound matters more than prose polish a volunteer will edit anyway.
- Hard-coding the IDs — prohibited by Principle VI.

## Amendment 2026-09-12 (F19): drafting default is `gemini-3.8-flash`

User decision. `MODEL_DRAFTING` default changes from `gemini-3-flash-preview` to
`gemini-3.8-flash`; `MODEL_DESCRIBER` is unchanged. Verified reachable on the Vertex global
endpoint (`generateContent` against `projects/<project-id>/locations/global/publishers/google/
models/gemini-3.8-flash`) before the switch.

## Amendment 2026-09-13 (F57 § F52): latency criterion and thinking

The "five-second" bound in line 27's Alternatives section refers to the old SC-013 criterion. User decision: keep `gemini-3.8-flash`, keep thinking at the model's default (no `thinkingLevel` or `thinkingBudget` override), and raise the criterion to eight seconds (the `thinkingBudget` and `thinkingLevel` experiments in F52 §5 did not change reasoning time reliably; the model's default reasoning is ~5 s; the real measure: F52's ten local builds passed 10/10 under ≤ 8 s, 3/10 under ≤ 5 s).
