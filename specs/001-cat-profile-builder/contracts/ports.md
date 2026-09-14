# Contract: Ports (injected abstractions)

Every dependency that crosses a module boundary is an interface in `src/core/ports/`,
implemented once under `src/adapters/`, faked once under `tests/fakes/`, and wired in one
composition root (`src/adapters/container.ts`). Core never imports an adapter (Principle I,
enforced by ESLint `no-restricted-imports`).

| Port | Methods | Adapter | Fake |
|---|---|---|---|
| `ProfileStore` | `readDraft(pid)`, `writeDraft(pid, unknown, { name, thumbnail })`, `readPublished(pid)`, `writePublished(pid, unknown)`, `deletePublished(pid)`, `archive(pid)`, `restore(pid)`, `readArchived(pid)`, `deleteArchived(pid)`, `exists(pid)`, `delete(pid)`, `list()` → `{ pid, state, name, thumbnail, line, updatedAt }[]` (one list call, from object metadata), `listPublished()` | GCS private bucket (ADR-004/015) | in-memory `Map`; filesystem under `.data/` for dev and e2e |
| `MediaStore` | `createSignedUpload(pid, mid, contentLength)` → `{ url, method, headers }` (the exact signed headers the browser must send), `readOriginal(pid, mid)` (stream), `readRange(pid, mid, bytes)`, `readAsset(pid, mid)`, `writeAsset(pid, mid, unknown)`, `writeDerived(pid, mid, kind, bytes)` → `rev` (content-hashed, public bucket, immutable), `readDerived(pid, mid, kind, rev)`, `readDerivedRange(pid, mid, kind, rev, range?)` → `{ stream, size, start, end } | { stream: null, size } | null` (F23: a derived revision streamed for the `/media` route, an inclusive slice clamped to the last byte; `stream: null` for a start past it, `null` when never written), `originalSize(pid, mid)`, `listMedia(pid)`, `deleteMedia(pid, mid)`, `deleteProfileMedia(pid)`, `publicUrl(pid, mid, kind, rev)`, `gsUri(pid, mid, kind, rev)` | GCS two buckets (ADR-005/015) | in-memory with `Buffer`s; filesystem for dev and e2e |
| `VideoProcessor` | `probe(input)`, `transcode(input, { trim? })` | ffmpeg child process (ADR-006) | scripted results + fixture MP4 |
| `LanguageModel` | AI SDK's own `LanguageModel` interface | `@ai-sdk/google-vertex` (ADR-001) | `MockLanguageModelV3` from `ai/test`, scripted scenarios in `src/adapters/fake/` (shipped, so `MODEL=fake` works in the built app) |
| `Describer` | `describePhoto(bytes)`, `describeVideo(gsUri)` → `{ text } \| { failed: reason }` — `gsUri` is always `web.mp4` (≤ 15 s), enforced by the caller and asserted in the contract test | Vertex via AI SDK, model `MODEL_DESCRIBER` | scripted; runtime fake in `src/adapters/fake/describer.ts` (`FAKE_DESCRIBER=fail` → `{ failed }`) |
| `Clock` | `now()` | `Date` | fixed |
| `IdSource` | `profileId()`, `blockId()`, `mediaId()` | `crypto.getRandomValues` | sequential |
| `Logger` | `info/warn/error/debug(obj, msg)` | pino with redaction | in-memory sink |

**Not ports** (Principle VII — one implementation, local, pure, nothing to fake):
`sharp` (metadata, clean, downscale, enhance — ADR-016) and `file-type` (sniff) are called
from plain modules in `src/adapters/sharp/` and `src/adapters/sniff.ts`. The *rules* they feed
(limits, allowed types, dimension thresholds) are pure functions in `src/core/media/`.

Rules:

- A port method receives and returns plain data or streams — never a framework object.
- Adapters that call the network carry `import "server-only"` so a client bundle cannot
  include them (Engineering Standards → server-only code unreachable from client).
- Each adapter has at most one integration test that touches the real service, tagged and
  skipped in CI unless credentials are present; everything else uses the fake.
