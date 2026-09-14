# ADR-001: AI SDK and model provider

**Status**: accepted · **Date**: 2026-09-10

## Context

The helper needs three things from a model library: streaming text to a React panel, tool
calling with schemas the core already owns (Zod, Principle VI), and a provider the core can
receive as an injected interface (Principle I). It must also be testable with no network.
Three candidates were considered: Vercel AI SDK, Google's `@google/genai`, and Google's
`@google/adk` (Agent Development Kit — Google's framework for building multi-step agents).

## Decision

Use **Vercel AI SDK v6** (`ai`) with **`@ai-sdk/google-vertex`** as the provider.

- `streamText` + `tool({ inputSchema })` on the server; `useChat` on the client. Tool calls
  stream to the browser as typed message parts. The declared edit operations *are* the tool
  input schemas, so one Zod definition serves the model boundary and the document boundary.
- The core sees only the SDK's `LanguageModel` interface, handed in by a composition root.
  Tests use `MockLanguageModelV3` from `ai/test`.
- **Vertex rather than the Gemini Developer API.** The app already runs on Cloud Run with a
  service account, so Vertex authenticates with Application Default Credentials and there is
  no API key anywhere (SC-011 holds by construction). Vertex also accepts `gs://` file parts,
  which is how a video clip reaches the alt-text describer without an inline-size limit (the
  clip is at most 15 s after ADR-006, but a 1080p 15 s clip can still exceed 20 MB).
  Locally, `gcloud auth application-default login` supplies the same credentials. Swapping to
  `@ai-sdk/google` is a one-line change in the composition root if this proves inconvenient.

### The SDK is the port

Principle I asks for every cross-boundary dependency to be typed against an abstraction.
Here the abstraction **is** the AI SDK's `LanguageModel` interface and its tool/stream
types: `src/core/helper/` imports `ai` for `tool()` and the message types. That is a
deliberate, accepted tension — the SDK is a small, framework-free TypeScript library, and
swapping the *provider* (Vertex → Gemini API → anything else) stays a one-line change. Swapping
the *SDK* would not be contained, and that is accepted. What stays out of core is the
server-side call itself: `createHelperStream` lives in `src/adapters/vertex/helper-stream.ts`
under `import "server-only"`, so the client bundle can never reach it. The `useChat` hook is in
`@ai-sdk/react`, which is a UI dependency and is banned from core by the ESLint restriction.

## Alternatives rejected

- **`@google/genai` directly** — every Gemini feature first, but the server-sent-events
  stream, client message state, partial tool-call parsing and retries would be hand-written,
  which puts the most code in the seam the constitution wants thinnest.
- **`@google/adk`** — an agent runtime with its own sessions, runners and tool loop. It would
  own prompt assembly and the tool loop, which the constitution assigns to core; and a single
  bounded helper with six operations does not need multi-agent orchestration (Principle VII).
- **Gemini Developer API via `@ai-sdk/google`** — simpler locally, but introduces an API key
  to protect and a 20 MB inline limit on files.
