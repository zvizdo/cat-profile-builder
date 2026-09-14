// The memory MediaStore is runtime code now: `STORE=memory` wires it through the container
// (T014), so it lives in `src/adapters/memory/` and tests reach it from here as before.
export * from "@/adapters/memory/media-store";
