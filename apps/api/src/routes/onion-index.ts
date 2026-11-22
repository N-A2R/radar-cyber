/**
 * GET /onion-index — live and productive .onion sites, rebuilt from the
 * versioned catalog and newest Tor probe. Public: only source metadata.
 */
import type { FastifyInstance } from "fastify";
import { loadOnionIndex } from "../onion/index.js";

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/onion-index", async () => loadOnionIndex());
}
