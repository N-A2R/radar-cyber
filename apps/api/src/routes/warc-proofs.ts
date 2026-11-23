/**
 * GET /api/warc/proofs — public count of Nouvelle-Aquitaine facts carrying a
 * verifiable WARC proof. The response exposes archive metadata only: no page
 * body, no victim data, no private source configuration.
 */
import type { FastifyInstance } from "fastify";
import { measureWarcProofs } from "../warc/measure.js";

export default async function warcProofsRoute(app: FastifyInstance) {
	app.get("/warc/proofs", async () => {
		const measured = await measureWarcProofs();
		return {
			scope: measured.scope,
			definition: "a NA fact whose WARC response record and hashes are verified on disk",
			eligibleFacts: measured.eligibleFacts,
			factsWithArchivableProof: measured.factsWithArchivableProof,
			target: measured.target,
			coveragePercent: measured.coveragePercent,
			warcFiles: measured.warcFiles,
			warcBytes: measured.warcBytes,
			invalidProofs: measured.invalidProofs.length,
			recent: measured.recent,
			generatedAt: measured.generatedAt,
		};
	});
}
