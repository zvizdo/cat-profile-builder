import type { NextRequest } from "next/server";
import { getContainer } from "@/adapters/container";
import { saveDraft } from "@/app/api/_lib/draft";

/** `PUT /api/profiles/{id}/draft` — saves the whole draft document (contracts/server-boundary.md). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return saveDraft(getContainer(), request, (await params).id);
}
