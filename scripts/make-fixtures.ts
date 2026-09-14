import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  buildClip20sArgs,
  buildClip2sRotateRemuxArgs,
  buildClip2sTranscodeArgs,
  darkenOneStopLinear,
  renderChecksumsFile,
  resizePlan,
  sha256Hex,
  validateMaximalAssetShape,
  validateMaximalDocumentShape,
} from "./lib/fixtures";

const DESIGN_MEDIA_DIR = "references/design/design/media";
const TEST_MEDIA_DIR = "test-media";
const OUT_DIR = "tests/fixtures";
const CHECKSUMS_FILE = "CHECKSUMS.sha256";

/**
 * Resizes a source JPEG to `resizePlan(longestEdge)` and writes it to `outPath`, stripping
 * EXIF (sharp's default — `withMetadata()` is never called) so the fixture carries no GPS or
 * device data from the original phone photo. Fixed quality keeps output byte-identical
 * across runs on the same machine (the reviewer's re-run check).
 */
async function writeResizedJpeg(
  sourcePath: string,
  outPath: string,
  longestEdge: number,
): Promise<void> {
  await sharp(sourcePath).resize(resizePlan(longestEdge)).jpeg({ quality: 82 }).toFile(outPath);
}

/** `dim.jpg`: the enhancement fixture — resized, then darkened by exactly -1 EV. */
async function writeDimJpeg(sourcePath: string, outPath: string): Promise<void> {
  const [a, b] = darkenOneStopLinear();
  await sharp(sourcePath)
    .resize(resizePlan(1600))
    .linear(a, b)
    .jpeg({ quality: 82 })
    .toFile(outPath);
}

/** `not-a-video.mp4`: a tiny PNG saved under a `.mp4` name, for the "wrong file type" case. */
async function writeFakeVideoFile(outPath: string): Promise<void> {
  await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 90, b: 90 } },
  })
    .png()
    .toFile(outPath);
}

/** Shells out to `ffmpeg` with a fixed argv (never a shell string) and fails loudly on error. */
function runFfmpeg(args: string[]): void {
  execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * `clip-2s.mp4` needs two ffmpeg passes to keep its rotation as real container-level side
 * data instead of baking it into the pixels (see `buildClip2sRotateRemuxArgs`'s doc comment
 * for why one pass isn't enough on this ffmpeg version). The intermediate never needs to be
 * inspected, so it lives under `os.tmpdir()` and is removed once the remux is done.
 */
function writeClip2s(sourcePath: string, outPath: string): void {
  const tmpDir = mkdtempSync(join(tmpdir(), "make-fixtures-"));
  const tmpPath = join(tmpDir, "clip-2s-step1.mp4");
  try {
    runFfmpeg(buildClip2sTranscodeArgs(sourcePath, tmpPath));
    runFfmpeg(buildClip2sRotateRemuxArgs(tmpPath, outPath));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Every file directly under `tests/fixtures` except the checksums manifest itself. */
function listFixtureFiles(): string[] {
  return readdirSync(OUT_DIR)
    .filter((name) => name !== CHECKSUMS_FILE)
    .filter((name) => statSync(join(OUT_DIR, name)).isFile())
    .sort();
}

function writeChecksums(): void {
  const entries = listFixtureFiles().map((name) => ({
    relativePath: name,
    hex: sha256Hex(readFileSync(join(OUT_DIR, name))),
  }));
  writeFileSync(join(OUT_DIR, CHECKSUMS_FILE), renderChecksumsFile(entries));
}

/**
 * Builds every fixture under `tests/fixtures/` from `references/design/design/media` and
 * `test-media/` (T005). Idempotent and deterministic: re-running it reproduces the same
 * bytes, which `shasum -a 256 -c tests/fixtures/CHECKSUMS.sha256` verifies. The three
 * `maximal-*.json` fixtures are hand-written, not generated — this only validates their
 * shape so a broken edit fails the build instead of silently drifting from data-model.md.
 */
async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    throw new Error(`${OUT_DIR} does not exist`);
  }

  await writeResizedJpeg(
    join(DESIGN_MEDIA_DIR, "charlotte-1.jpg"),
    join(OUT_DIR, "cat-1.jpg"),
    1600,
  );
  await writeResizedJpeg(
    join(DESIGN_MEDIA_DIR, "charlotte-2.jpg"),
    join(OUT_DIR, "cat-2.jpg"),
    1600,
  );
  await writeResizedJpeg(
    join(DESIGN_MEDIA_DIR, "charlotte-3.jpg"),
    join(OUT_DIR, "cat-3.jpg"),
    1600,
  );

  const dimSource = join(TEST_MEDIA_DIR, "PXL_20260622_022941724.jpg");
  await writeDimJpeg(dimSource, join(OUT_DIR, "dim.jpg"));
  await writeResizedJpeg(dimSource, join(OUT_DIR, "small.jpg"), 640);

  await writeFakeVideoFile(join(OUT_DIR, "not-a-video.mp4"));

  writeClip2s(join(TEST_MEDIA_DIR, "PXL_20260904_202047557.mp4"), join(OUT_DIR, "clip-2s.mp4"));
  runFfmpeg(
    buildClip20sArgs(
      join(TEST_MEDIA_DIR, "PXL_20260907_181251908.mp4"),
      join(OUT_DIR, "clip-20s.mp4"),
    ),
  );

  validateMaximalDocumentShape(readJson(join(OUT_DIR, "maximal-document.json")));
  validateMaximalAssetShape(readJson(join(OUT_DIR, "maximal-asset-photo.json")), "photo");
  validateMaximalAssetShape(readJson(join(OUT_DIR, "maximal-asset-video.json")), "video");

  writeChecksums();

  for (const name of listFixtureFiles()) {
    const { size } = statSync(join(OUT_DIR, name));
    process.stdout.write(`${name}\t${size} bytes\n`);
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
