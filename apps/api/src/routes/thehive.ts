/**
 * TheHive case creation endpoint.
 *
 * Default is a dry run: no outbound request unless the caller explicitly asks
 * for live creation and a TheHive URL plus API key are configured. Only
 * Nouvelle-Aquitaine alerts are selected (see thehive/select.ts).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { conflict } from "../errors.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { createCases, planCases, readTheHiveConfig, theHiveClient } from "../thehive/cases.js";
import { mapAlertRow, selectParams, SELECT_NA_ALERTS } from "../thehive/select.js";
import { invalidBody, parseBody } from "./body-validation.js";

const CreateCasesBody = z.object({
	limit: z.number().int().min(1).max(500).default(50),
	dryRun: z.boolean().default(true),
}).strict();

export default async function (app: FastifyInstance) {
	const limiter = rateLimit({ max: 10, windowMs: 60_000 });

	app.post("/thehive/cases", { preHandler: [limiter] }, async (req, reply) => {
		const parsed = parseBody(CreateCasesBody, req.body ?? {});
		if (!parsed.success) return invalidBody(reply, parsed.error);
		const { limit, dryRun } = parsed.data;

		const rows = await query(SELECT_NA_ALERTS, selectParams(limit));
		const alerts = rows.rows.map((row) => mapAlertRow(row as Record<string, unknown>));

		if (dryRun) {
			const plan = planCases(alerts);
			return {
				mode: "dry-run",
				planned: plan.cases.length,
				skipped: plan.skipped,
				cases: plan.cases.map(({ alertId, payload }) => ({ alertId, externalRef: payload.externalRef })),
			};
		}

		const config = readTheHiveConfig();
		if (!config) throw conflict("TheHive is not configured");
		const result = await createCases(alerts, theHiveClient(config));
		return { mode: "live", ...result };
	});
}
