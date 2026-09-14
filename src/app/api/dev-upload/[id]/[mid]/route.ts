import type { NextRequest } from "next/server";
import { getContainer } from "@/adapters/container";
import { acceptDevUpload } from "@/app/api/_lib/dev-upload";

/** `PUT /api/dev-upload/{id}/{mid}` — the filesystem store's upload target (ADR-015, `STORE=fs` only). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
): Promise<Response> {
  return acceptDevUpload(getContainer(), request, await params);
}
