/**
 * GET /honeypot/scans — read-only, in-memory aggregation from the decoy
 * listener. No identifiers, addresses or request bodies are exposed.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { honeypotStore } from "./instance.js";
import { WINDOW_24H_MS } from "./model.js";

const ScanQuery = z.object({
	window: z.enum(["1h", "24h"]).default("24h"),
});

export default async function (app: FastifyInstance): Promise<void> {
	app.get("/honeypot/scans", async (request) => {
		const parsed = ScanQuery.safeParse(request.query ?? {});
		if (!parsed.success) throw badRequest("window must be 1h or 24h");
		const windowMs = parsed.data.window === "1h" ? 60 * 60 * 1000 : WINDOW_24H_MS;
		return honeypotStore.summary(new Date(), windowMs);
	});
}
