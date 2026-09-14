# Contracts

The three seams the constitution names (Principle VI), each machine-verified by a contract
test in `tests/contract/`.

| File | Seam |
|---|---|
| [profile-document.md](profile-document.md) | The persisted document: schema, versioning, migration, round-trip |
| [helper-protocol.md](helper-protocol.md) | The model boundary: tools, streaming parts, client responses, failure states |
| [server-boundary.md](server-boundary.md) | Server Actions, Route Handlers, pages: inputs, outputs, status codes, error shape |
| [ports.md](ports.md) | The injected abstractions every adapter implements and every test fakes |
