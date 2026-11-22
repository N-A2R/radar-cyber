/**
 * GET /translations — French headlines produced from foreign-language sources.
 *
 * Read-only and deliberately narrow: translated headline, language, quality
 * and source metadata only. No original text, summary or victim detail is
 * exposed. Only events anchored in Nouvelle-Aquitaine can appear here.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { badRequest } from "../errors.js";
import { NA_DEPARTMENTS } from "../multilingualIncidents/index.js";

const TranslationsQuery = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

const NA_CODES = Object.keys(NA_DEPARTMENTS).map((code) => `'${code}'`).join(", ");

type TranslationRow = {
	event_id: number;
	source_id: string | null;
	language: string;
	translated_title: string;
	quality: string;
};

export default async function (app: FastifyInstance): Promise<void> {
	app.get("/translations", async (request) => {
		const parsed = TranslationsQuery.safeParse(request.query ?? {});
		if (!parsed.success) throw badRequest("limit must be an integer between 1 and 200");
		const rows = await query<TranslationRow>(
			`SELECT t.event_id, e.source_id, t.language, t.translated_title, t.quality::text
			   FROM article_translation t
			   JOIN event e ON e.id = t.event_id
			   LEFT JOIN org o ON o.id = e.org_id
			  WHERE e.regional OR o.dept IN (${NA_CODES})
			  ORDER BY t.event_id DESC
			  LIMIT $1`,
			[parsed.data.limit],
		);
		return {
			count: rows.rows.length,
			items: rows.rows.map((row) => ({
				eventId: row.event_id,
				sourceId: row.source_id,
				language: row.language,
				translatedTitle: row.translated_title,
				quality: Number(row.quality),
			})),
		};
	});
}
