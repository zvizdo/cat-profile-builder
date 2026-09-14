import type { NextRequest } from "next/server";
import { getContainer } from "@/adapters/container";
import { serveOriginal } from "@/app/api/_lib/original";

/** `GET /api/profiles/{id}/media/{mid}/original` — a video's original, with `Range` (contracts/server-boundary.md). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
): Promise<Response> {
  return serveOriginal(getContainer(), request, await params);
}
