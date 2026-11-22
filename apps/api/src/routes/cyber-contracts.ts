/**
 * Public, read-only view of cyber public contracts in Nouvelle-Aquitaine.
 *
 * The projection is a fixed whitelist of organisation-level fields collected
 * from the free BOAMP open-data API: no raw notice payload, no contact detail
 * and no victim information is ever exposed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import {
	groupContracts,
	measureContracts,
	NA_DEPARTMENTS,
	type ContractNotice,
} from "../procurement/cyber-contracts.js";

const CORPUS_PATH = fileURLToPath(
	new URL("../../../../bench/corpus/cyber-contracts-na.json", import.meta.url),
);

type Corpus = {
	meta: { source: string; license: string; collectedAt: string; window: { from: string; to: string } };
	notices: ContractNotice[];
};

export default async function (app: FastifyInstance) {
	app.get("/cyber-contracts", async (request) => {
		const params = request.query as Record<string, unknown>;
		const dept = typeof params.dept === "string" &&
			(NA_DEPARTMENTS as readonly string[]).includes(params.dept) ? params.dept : null;
		const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as Corpus;
		const { from, to } = corpus.meta.window;
		const grouped = groupContracts(corpus.notices).filter((contract) => !dept || contract.department === dept);
		const measure = measureContracts(grouped, from, to);
		return {
			source: { name: corpus.meta.source, license: corpus.meta.license, collectedAt: corpus.meta.collectedAt },
			window: measure.window,
			contracts: measure.count,
			totalAmountEur: measure.totalAmountEur,
			withAmount: measure.withAmount,
			withAwardee: measure.withAwardee,
			byDepartment: measure.byDepartment,
			markets: measure.contracts.map((contract) => ({
				id: contract.id,
				firstPublished: contract.firstPublished,
				department: contract.department,
				buyer: contract.buyer,
				object: contract.object,
				amountEur: contract.amountEur,
				amountKind: contract.amountKind,
				awardees: contract.awardees,
				noticeIds: contract.noticeIds,
			})),
		};
	});
}
