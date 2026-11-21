/**
 * Persistence for audio/video transcription records.
 *
 * Only derived signals are stored: no transcript text, no publisher description
 * and therefore no victim personal data. Replaying the same corpus is a no-op.
 */
import { query } from "../db.js";
import type { Transcription } from "./transcription.js";

export interface MediaCounts {
	total: number;
	relevant: number;
	byDept: Record<string, number>;
	byType: Record<string, number>;
}

function chunk<T>(values: readonly T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < values.length; i += size) batches.push(values.slice(i, i + size));
	return batches;
}

/** Idempotent write: returns the number of genuinely new rows. */
export async function applyTranscriptions(records: readonly Transcription[]): Promise<number> {
	let changed = 0;
	for (const batch of chunk(records, 100)) {
		if (batch.length === 0) continue;
		const params: unknown[] = [];
		const rows = batch.map((r) => {
			const i = params.length;
			params.push(r.id, r.sourceId, r.dept, r.mediaType, r.mediaUrl, r.method,
				r.textSha256, r.textLength, r.wordCount, r.language, r.relevant, r.score, r.reason,
				JSON.stringify(r.evidence));
			return `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12},$${i + 13},$${i + 14}::jsonb)`;
		});
		const sql = `INSERT INTO media_transcription
			(id, source_id, dept, media_type, media_url, method, text_sha256, text_length,
			 word_count, language, relevant, relevance_score, reason, evidence)
			VALUES ${rows.join(",")}
			ON CONFLICT (id) DO NOTHING`;
		const result = await query(sql, params);
		changed += result.rowCount ?? 0;
	}
	return changed;
}

/** Read-only count used by the measurement script and the API route. */
export async function countTranscriptions(): Promise<MediaCounts> {
	const result = await query<{ total: string; relevant: string; dept: string | null; media_type: string }>(`
		SELECT count(*)::text AS total,
		       count(*) FILTER (WHERE relevant)::text AS relevant,
		       dept, media_type
		FROM media_transcription
		GROUP BY GROUPING SETS ((), (dept), (media_type))
		ORDER BY dept NULLS LAST, media_type NULLS LAST`);
	const counts: MediaCounts = { total: 0, relevant: 0, byDept: {}, byType: {} };
	for (const row of result.rows) {
		counts.total = Math.max(counts.total, Number(row.total));
		counts.relevant = Math.max(counts.relevant, Number(row.relevant));
		if (row.dept) counts.byDept[row.dept] = Number(row.total);
		if (row.media_type && !row.dept) counts.byType[row.media_type] = Number(row.total);
	}
	return counts;
}

/** Media sources already present in the referential, scoped to NA by family. */
export async function countMediaSources(): Promise<number> {
	const result = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM source WHERE enabled AND (family IN ('radio','tv') OR id LIKE 'corpus:%radio%' OR id LIKE 'corpus:%tv%')");
	return Number(result.rows[0]?.n ?? 0);
}
