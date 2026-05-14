export { prisma } from "./client.js";
// Prisma's `prisma-client` generator emits TypeScript files, and the backend
// runtime loads this package through `tsx`.
// @ts-expect-error TS-only generated Prisma client export
export * from "../generated/prisma/client.ts";
