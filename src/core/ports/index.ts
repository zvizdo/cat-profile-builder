// Every injected abstraction in one place (contracts/ports.md). Core defines them, adapters
// implement them, `tests/fakes/` fakes them, `src/adapters/container.ts` wires them. The
// language model is not listed: its port is the AI SDK's own `LanguageModelV3`, imported by
// adapters straight from `@ai-sdk/provider` (ADR-001 → "The SDK is the port").
export type { Clock } from "./clock";
export type { DescribeResult, Describer } from "./describer";
export type { IdSource } from "./id-source";
export type { LogFields, Logger } from "./logger";
export type {
  ByteRange,
  DerivedKind,
  DerivedStream,
  MediaStore,
  SignedUpload,
} from "./media-store";
export type {
  DraftMeta,
  ProfileRow,
  ProfileState,
  ProfileStore,
  PublishedRow,
  ThumbnailRef,
} from "./profile-store";
export type {
  ProbeResult,
  TranscodeOptions,
  TranscodeResult,
  VideoInput,
  VideoProcessor,
} from "./video-processor";
