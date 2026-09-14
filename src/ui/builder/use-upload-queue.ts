"use client";
import { useRef, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { screenFile, UPLOAD_FAILED, uploadFile, UploadFailure } from "./upload-client";

// The upload queue behind the media rail: files are screened (FR-007, FR-008), then sent
// one at a time — one progress toast to read, and one finalize's worth of ffmpeg on the
// server at a time. Every file ends in `onLanded` with its record, or `onRefused` with the
// code and sentence from core or the server; nothing is judged or worded here.

/** A file that is queued, sending its bytes, or being processed by the server. */
export interface PendingUpload {
  key: number;
  name: string;
  phase: "queued" | "uploading" | "processing";
}

/** The progress toast's numbers: `Uploading {name} — {index} of {total}` · `{percent}%`. */
export interface UploadProgress {
  name: string;
  index: number;
  total: number;
  percent: number;
}

/** Why a file did not join the library: a code to switch on and the sentence to show. */
export type UploadRefusal = Pick<UploadFailure, "code" | "message">;

export interface UploadQueueHandlers {
  onLanded: (asset: AssetView, warnings: string[]) => void;
  onRefused: (file: File, refusal: UploadRefusal) => void;
}

interface Job {
  key: number;
  file: File;
}

/** Any thrown value as a refusal: a Server Action call that could not be made is the bytes not landing. */
function refusalOf(error: unknown): UploadRefusal {
  return error instanceof UploadFailure ? error : { code: "network", message: UPLOAD_FAILED };
}

/** The files that pass `screenFile`; each that does not is reported and dropped. */
function accept(files: File[], onRefused: UploadQueueHandlers["onRefused"]): File[] {
  return files.filter((file) => {
    const screen = screenFile(file);
    if (!screen.ok) onRefused(file, screen);
    return screen.ok;
  });
}

function withPhase(list: PendingUpload[], key: number, phase: PendingUpload["phase"]) {
  return list.map((p) => (p.key === key ? { ...p, phase } : p));
}

export function useUploadQueue(profileId: string, handlers: UploadQueueHandlers) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const queue = useRef<Job[]>([]);
  const batch = useRef({ done: 0, total: 0, running: false });
  const nextKey = useRef(0);

  const runOne = async ({ file, key }: Job) => {
    const index = batch.current.done + 1;
    setProgress({ name: file.name, index, total: batch.current.total, percent: 0 });
    setPending((list) => withPhase(list, key, "uploading"));
    const onProgress = (percent: number) => {
      setProgress((current) => (current === null ? null : { ...current, percent }));
      if (percent >= 100) setPending((list) => withPhase(list, key, "processing"));
    };
    try {
      const result = await uploadFile({ profileId, file, onProgress });
      handlers.onLanded(result.asset, result.warnings);
    } catch (error) {
      handlers.onRefused(file, refusalOf(error));
    }
    batch.current.done = index;
    setPending((list) => list.filter((p) => p.key !== key));
  };

  const run = async () => {
    if (batch.current.running) return;
    batch.current.running = true;
    for (let job = queue.current.shift(); job !== undefined; job = queue.current.shift()) {
      await runOne(job);
    }
    batch.current = { done: 0, total: 0, running: false };
    setProgress(null);
  };

  /** Screens each file and queues the ones that pass; the rest go straight to `onRefused`. */
  const addFiles = (files: File[]) => {
    const accepted = accept(files, handlers.onRefused).map((file) => ({
      key: (nextKey.current += 1),
      file,
    }));
    if (accepted.length === 0) return;
    setPending((list) => [
      ...list,
      ...accepted.map(({ key, file }) => ({ key, name: file.name, phase: "queued" as const })),
    ]);
    queue.current.push(...accepted);
    batch.current.total += accepted.length;
    void run();
  };

  return { pending, progress, addFiles };
}
