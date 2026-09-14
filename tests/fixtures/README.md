# Test fixtures

Small, committed derivatives used by unit, contract and e2e tests. Generated (except the three
hand-written JSON files) by `scripts/make-fixtures.ts`, run as:

```
pnpm make-fixtures
```

The script is deterministic on a given machine: re-running it reproduces the same bytes. That
is verified by `tests/fixtures/CHECKSUMS.sha256`, which the script rewrites on every run:

```
cd tests/fixtures && shasum -a 256 -c CHECKSUMS.sha256
```

## Sources and how each fixture was made

| Fixture | Source | How |
|---|---|---|
| `cat-1.jpg`, `cat-2.jpg`, `cat-3.jpg` | `references/design/design/media/charlotte-{1,2,3}.jpg` | sharp: resize so the longest edge is 1600 px (`fit: "inside"`, no upscaling), re-encode JPEG quality 82. EXIF stripped (sharp's default; `withMetadata()` is never called). |
| `dim.jpg` | `test-media/PXL_20260622_022941724.jpg` | sharp: resize to 1600 px longest edge, then `.linear(0.5, 0)` — halves every RGB sample with no offset, i.e. exactly -1 EV. This is the fixture the "enhance" (brighten) pipeline is exercised against. |
| `small.jpg` | same source as `dim.jpg` | sharp: resize to 640 px wide (`fit: "inside"`), no darkening. Triggers the builder's "too small" warning. |
| `clip-2s.mp4` | `test-media/PXL_20260904_202047557.mp4` (10.5 s, 1920x1080, rotation -90 side data, has audio) | Two ffmpeg passes (see below — rotation): a transcode with `-noautorotate`, then a `-c copy` remux with `-display_rotation -90` that writes the real Display Matrix. Audio kept on purpose: the upload pipeline under test is what strips it (FR-085), so the fixture must still have it to prove that. |
| `clip-20s.mp4` | `test-media/PXL_20260907_181251908.mp4` (89 s, 243 MB, over the 200 MB cap) | `ffmpeg -ss 0 -t 20 -vf scale=-2:720 -crf 30 -preset veryfast`, audio kept. Triggers `needs-trim` (source is far over the 15 s limit). This source is itself shot in portrait; with default autorotate left on (no `-noautorotate` here — this fixture isn't testing rotation), the output comes out 406x720 rather than 1280x720. That still satisfies "720p" (height 720) and the brief's literal `-vf scale=-2:720`. |
| `not-a-video.mp4` | generated | sharp creates a 4x4 solid-colour PNG, saved with a `.mp4` extension — the "wrong file type" fixture. |
| `maximal-document.json` | hand-written | see below. |
| `maximal-asset-photo.json`, `maximal-asset-video.json` | hand-written | see below. |

## Rotation: why it's a two-pass recipe

The obvious one-pass approach — `-noautorotate` on the input plus `-metadata:s:v:0 rotate=-90`
on the output — does **not** work on this machine's ffmpeg (8.1): verified empirically that the
`rotate` metadata tag is silently dropped by the mov muxer during both transcode and
`-c copy`, in every ordering and placement tried. (A `-c copy` of the *original* file does
show `rotation=-90` under `ffprobe`, but that comes from the original stream's own pre-existing
Display Matrix side data passing through unmodified — changing the `rotate=` value to
something else, e.g. `45`, has zero effect on the output, proving the tag itself is inert
here.) `-display_rotation` as an input option *on a transcode* has the same problem: it does
override what ffmpeg *reads* as the input's rotation (confirmed via `-v verbose`), but that
override still does not get written into a transcoded output as container-level side data.

What does work is splitting the transcode and the rotation write into two passes
(`buildClip2sTranscodeArgs` / `buildClip2sRotateRemuxArgs` in `scripts/lib/fixtures.ts`):

```
# 1. Re-encode small, pixels left in their original (landscape) orientation.
ffmpeg -y -noautorotate -ss 0 -t 2 -i <source> -map_metadata -1 \
  -c:v libx264 -crf 28 -preset veryfast -c:a aac \
  -fflags +bitexact -flags:v +bitexact -flags:a +bitexact <tmp>.mp4

# 2. Remux with -c copy (no re-encode) while overriding the read rotation.
ffmpeg -y -display_rotation -90 -i <tmp>.mp4 -map_metadata -1 -c copy -fflags +bitexact \
  tests/fixtures/clip-2s.mp4
```

`-display_rotation` on a **copy** remux does get written into the output as a real Display
Matrix, even though the same option is a no-op during a transcode. The intermediate file from
step 1 lives under `os.tmpdir()` and is deleted once step 2 finishes.

Verify with:

```
ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation -of default=nw=1 \
  tests/fixtures/clip-2s.mp4
```

which prints `rotation=-90` as real container-level (tkhd) side data — the same thing
`ffprobe -show_streams` shows for a real phone video, and what ffmpeg's autorotate (T020)
reads. If a later ffmpeg version restores proper `-metadata rotate=`/`-display_rotation`
handling for transcodes, this could collapse back to one pass.

## Determinism

- sharp: fixed resize options and JPEG quality every run; no metadata written.
- ffmpeg: `-map_metadata -1` plus `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact`
  strip timestamps/encoder-version metadata that would otherwise vary run to run.
- Verified by running `pnpm make-fixtures` twice and diffing `CHECKSUMS.sha256` — identical
  both times (see T005 report).

## Choices made where data-model.md leaves a field's shape open

`data-model.md` (T006/T012 will turn this into the real Zod schemas) doesn't pin down a few
things structurally. These fixtures pick the simplest reading; T006/T012 should reconcile:

1. **Id character set.** Only `ProfileDocument.id` is explicitly `[a-z2-7]`. `MediaAsset.id`
   just says "string, 8 chars". These fixtures use the same `[a-z2-7]` alphabet for both, for
   consistency. Block ids were originally written as `block-NNNNNN` (block ids are only
   specified as "12 chars", not a charset); **T006 settled the block-id charset as the same
   `[a-z2-7]` alphabet** (`BlockIdSchema` in `src/core/profile/schema.ts`), so the 30 block
   ids in `maximal-document.json` are now `blockaaaaaaa` … `blockaaaaaaz`, `blockaaaaaa2` …
   `blockaaaaaa5` — the prefix `blockaaaaaa` plus one character of the alphabet in order.
2. **Revision hash format (`MediaAsset.revisions.*`).** ADR-015 fixes a rev as the first
   10 hex characters of the file's SHA-256, and **T012 encodes that as `RevSchema`**
   (`/^[0-9a-f]{10}$/` in `src/core/media/schema.ts`). Fixtures use 10-hex strings that look
   right (e.g. `"a1b2c3d4e5"`) — not real hashes of anything, since the brief says referenced
   media ids "do not need to exist as files".
3. **One asset fixture per kind.** data-model.md says `enhancement` is "present on enhanced
   photos only" and `trim` / `durationSeconds` / `originalDurationSeconds` are video-only, and
   **T012's `MediaAssetSchema` enforces both** with refinements. So there is no single record
   with every optional field: `maximal-asset-photo.json` (`kind: "photo"`, `media2ax`) carries
   `enhancement`, `alt`, a non-default `focal` and `revisions.clean`; `maximal-asset-video.json`
   (`kind: "video"`, `media2ay`) carries `originalDurationSeconds`, `trim`, `durationSeconds`,
   `alt`, a non-default `focal` and `revisions.web` + `revisions.poster`. Together they cover
   every optional field. The former `maximal-asset.json` (a video with `enhancement`) was
   removed in T012 because it could never validate.
4. **`focal` non-default.** `focal` always has a default of `{50, 50}`, so it isn't "optional"
   in the schema sense, but to show it's meaningfully settable the fixture uses `{62, 40}`
   rather than the default.
5. **Media ids referenced in `maximal-document.json`.** The brief says these "do not need to
   exist as files" — they're 8-char ids in the same style as the asset fixtures' ids, but none
   of them equals either fixture's own id (`media2ax`, `media2ay`); they're deliberately a
   disjoint pool so it's obvious the round-trip test isn't accidentally relying on file
   existence.

## Block/media counts in `maximal-document.json`

30 blocks: 1 `hero`, 5 `bio`, 13 `photo`, 1 `gallery` (12 ids), 2 `video`, 1 `day` (3 scenes),
1 `needs` (3 cards), 6 `quote` — every block type present, matching the brief. One `bio`
block's run sets `bold`, `italic` and `href` all at once, to exercise every `RichText.Run`
optional field in one place.
