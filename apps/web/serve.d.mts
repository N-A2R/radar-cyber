import type { Server } from "node:http";

/** Serveur statique de production (voir serve.mjs). */
export function createWebServer(options?: {
  distDir?: string;
  apiTarget?: string;
}): Server;
