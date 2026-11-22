/**
 * Collect cyber public contract notices published in Nouvelle-Aquitaine.
 *
 * Free public source only: the BOAMP open-data API operated by DILA
 * (https://boamp-datadila.opendatasoft.com), no key and no paid service.
 * The raw payloads are parsed in memory and discarded: the versioned corpus
 * keeps organisation-level fields only, never a person or a victim record.
 *
 *   apps/api/node_modules/.bin/tsx scripts/collect-cyber-contracts.mts \
 *     --from=2025-11-22 --to=2026-11-22 \
 *     --out=bench/corpus/cyber-contracts-na.json
 */
import { writeFileSync } from "node:fs";
import {
	extractAmount,
	extractAwardees,
	isCyberObject,
	isNaDepartments,
	NA_DEPARTMENTS,
	safeNoticeKeys,
	type ContractNotice,
} from "../apps/api/src/procurement/cyber-contracts.js";

const argv = process.argv.slice(2);
const option = (name: string): string | null =>
	argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const ENDPOINT = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";
const OUT = option("out") ?? "bench/corpus/cyber-contracts-na.json";
const TO = option("to") ?? new Date().toISOString().slice(0, 10);
const FROM = option("from") ?? (() => {
	const date = new Date(`${TO}T00:00:00Z`);
	date.setUTCFullYear(date.getUTCFullYear() - 1);
	return date.toISOString().slice(0, 10);
})();
const TERMS = [
	"cyber", "cybersécurité", "sécurité informatique", "sécurité des systèmes",
	"pare-feu", "antivirus", "vulnérabilité", "scada", "chiffrement",
	"sécurité numérique", "sécurité des réseaux", "certificats électroniques",
	"sase", "siem", "edr", "pentest", "authentification forte",
] as const;

type RawNotice = {
	idweb: string;
	dateparution: string;
	code_departement: string[] | null;
	nomacheteur: string | null;
	objet: string | null;
	nature: string | null;
	contractfolderid: string | null;
	donnees: string | null;
	gestion: string | null;
};

async function page(offset: number): Promise<{ total: number; results: RawNotice[] }> {
	const where = [
		`dateparution >= date'${FROM}'`,
		`dateparution <= date'${TO}'`,
		`code_departement in (${NA_DEPARTMENTS.map((d) => `'${d}'`).join(",")})`,
		`(${TERMS.map((term) => `search(objet,'${term}')`).join(" or ")})`,
	].join(" and ");
	const url = new URL(ENDPOINT);
	url.searchParams.set("where", where);
	url.searchParams.set("select", [
		"idweb", "dateparution", "code_departement", "nomacheteur", "objet",
		"nature", "contractfolderid", "donnees", "gestion",
	].join(","));
	url.searchParams.set("limit", "100");
	url.searchParams.set("offset", String(offset));
	const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
	if (!response.ok) throw new Error(`BOAMP ${response.status}: ${(await response.text()).slice(0, 200)}`);
	const body = await response.json() as { total_count: number; results: RawNotice[] };
	return { total: body.total_count, results: body.results };
}

async function main(): Promise<void> {
	const first = await page(0);
	const raw = [...first.results];
	for (let offset = 100; offset < first.total; offset += 100) {
		raw.push(...(await page(offset)).results);
	}
	const notices: ContractNotice[] = [];
	for (const item of raw) {
		const departments = item.code_departement ?? [];
		const object = item.objet ?? "";
		if (!isCyberObject(object) || !isNaDepartments(departments)) continue;
		const { amountEur, kind } = extractAmount(item.donnees, item.nature);
		notices.push({
			id: item.idweb,
			date: item.dateparution.slice(0, 10),
			departments,
			buyer: item.nomacheteur ?? "",
			object: object.slice(0, 240),
			nature: item.nature ?? "",
			folderId: item.contractfolderid || null,
			amountEur,
			amountKind: kind,
			awardees: extractAwardees(item.gestion, item.donnees),
		});
	}
	if (notices.some((notice) => !safeNoticeKeys(notice as unknown as Record<string, unknown>))) {
		throw new Error("unsafe notice field detected: nothing written");
	}
	const corpus = {
		meta: {
			source: "BOAMP open data (DILA) via Opendatasoft public API",
			license: "Licence ouverte Etalab",
			endpoint: ENDPOINT,
			window: { from: FROM, to: TO },
			terms: TERMS,
			candidates: raw.length,
			collectedAt: new Date().toISOString().slice(0, 10),
			scope: "notices whose every place of execution is in one of the 12 Nouvelle-Aquitaine departments",
		},
		notices: notices.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
	};
	writeFileSync(OUT, `${JSON.stringify(corpus, null, 2)}\n`);
	console.log(JSON.stringify({
		window: corpus.meta.window,
		candidates: raw.length,
		notices: notices.length,
		output: OUT,
	}, null, 2));
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
