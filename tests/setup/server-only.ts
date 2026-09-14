// Stands in for the `server-only` marker package under Vitest. In Next the import throws
// when a client component pulls a server module in; in tests there is no bundle to guard,
// so the adapters that start with `import "server-only"` load through this empty module.
export {};
