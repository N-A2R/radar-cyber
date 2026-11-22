/**
 * Read-only preview of the review assistant's suggestion.
 *
 * The endpoint takes claim evidence as query parameters and returns the
 * English suggestion object. It stores nothing and never echoes the input
 * text, so no victim detail can leak through the response.
 */
import type { FastifyInstance } from "fastify";
import { suggestDecision } from "../review-assistant/suggest.js";

function text(value: unknown, max: number): string | null {
	return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

export default async function (app: FastifyInstance) {
	app.get("/review-assistant/suggest", async (request) => {
		const params = request.query as Record<string, unknown>;
		return suggestDecision({
			claimId: 0,
			orgHint: text(params.hint, 200),
			source: text(params.source, 100),
			hasDescription: params.hasDescription === "true",
			declaredCountry: text(params.country, 80),
			department: text(params.department, 2),
		});
	});
}
