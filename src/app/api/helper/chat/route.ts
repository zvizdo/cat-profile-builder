import type { NextRequest } from "next/server";
import { getContainer } from "@/adapters/container";
import { chat } from "@/app/api/_lib/chat";

/** `POST /api/helper/chat` — the AI helper's chat turn (contracts/helper-protocol.md). */
export async function POST(request: NextRequest): Promise<Response> {
  return chat(getContainer(), request);
}
