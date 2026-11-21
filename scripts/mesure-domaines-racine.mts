/**
 * Mesure « domaines racine » — lecture seule sur radar:5433.
 *
 * La question : combien des indices-domaines se rattachent désormais quand on
 * normalise en domaine racine (www., sous-domaines, port, chemin retirés) et
 * qu'on cherche dans `org.domain`, `org.website` ET les alias
 * `org_alias.source='domain'` ?
 *
 * Deux populations distinctes, jamais mélangées :
 *  - `file_active` : les indices encore en attente ;
 *  - `cohorte_184` : la file de la mesure historique (220 indices / 184
 *    domaines du 2026-11-21), reconstituée en ajoutant les 20 indices promus
 *    depuis. C'est elle qui répond à « combien des 184 se rattachent ».
 *
 * Le classement et la résolution sont ceux du moteur. Aucune écriture en base,
 * aucun domaine injecté pour faire monter un chiffre.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-domaines-racine.mts
 *
 * Écrit bench/results/domaines-racine.json.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OrgDomaine } from "../apps/api/src/match/domaine.js";

const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;

const { query, closePools } = await import("../apps/api/src/db.js");
const { classifierIndice } = await import("../apps/api/src/match/famille-indice.js");
const {
	domaineRacine,
	domainFromHint,
	normalizeDomainValue,
	resoudreDomaine,
} = await import("../apps/api/src/match/domaine.js");

/** Instant du relevé `bench/results/domaines-lot.json` (220 indices, 184 domaines). */
const SNAPSHOT = "2026-11-21 15:33:57+00";

const SQL_FILTRE = `promoted = false AND kind = 'claim' AND status = 'pending'
  AND org_hint IS NOT NULL AND btrim(org_hint) <> ''`;

const SQL_FILLE_ACTIVE = `SELECT id, org_hint FROM quarantine_raw WHERE ${SQL_FILTRE} ORDER BY id`;

const SQL_COHORTE = `SELECT id, org_hint FROM quarantine_raw
WHERE (${SQL_FILTRE}) OR promoted_at >= '${SNAPSHOT}'::timestamptz
ORDER BY id`;

const SQL_ORGS = `SELECT id, name, slug, domain, website, name_norm
FROM org
WHERE domain IS NOT NULL OR website IS NOT NULL`;

const SQL_ALIAS_DOMAINE = `SELECT org_id, alias
FROM org_alias
WHERE source = 'domain' AND status = 'active' AND valid_to IS NULL
ORDER BY org_id, alias`;

type HintRow = { id: number; org_hint: string };
type OrgRow = {
	id: number;
	name: string;
	slug: string;
	domain: string | null;
	website: string | null;
	name_norm: string | null;
};
type AliasRow = { org_id: number; alias: string };

function sources(racine: string, o: OrgDomaine): string[] {
	const trouv: string[] = [];
	if (domaineRacine(o.domain) === racine) trouv.push("org.domain");
	if (domaineRacine(o.website) === racine) trouv.push("org.website");
	if ((o.domainAliases ?? []).some((a) => domaineRacine(a) === racine)) {
		trouv.push("org_alias.domain");
	}
	return trouv;
}

function mesurer(hints: readonly HintRow[], index: readonly OrgDomaine[]) {
	const stats = {
		indicesAvecIndice: hints.length,
		indicesDomaine: 0,
		etage1DomaineExact: 0,
		etage2RacineUnique: 0,
		etage2AmbigusRefuses: 0,
		etage2AucuneCandidate: 0,
		racineTropCourte: 0,
		rattaches: 0,
	};
	const rattaches: Array<{
		id: number;
		indice: string;
		racine: string;
		orgId: number | null;
		par: string[];
	}> = [];

	for (const hint of hints) {
		if (classifierIndice(hint.org_hint) !== "domaine") continue;
		stats.indicesDomaine++;
		const racine = domaineRacine(hint.org_hint);
		if (!racine) continue;
		const r = resoudreDomaine(hint.org_hint, index);
		if (r.etape === "exact" && r.orgId !== null) {
			stats.etage1DomaineExact++;
			stats.rattaches++;
			const org = index.find((o) => o.id === r.orgId);
			rattaches.push({
				id: hint.id,
				indice: hint.org_hint,
				racine,
				orgId: r.orgId,
				par: org ? sources(racine, org) : [],
			});
		} else if (r.etape === "racine") {
			stats.etage2RacineUnique++;
			stats.rattaches++;
		} else if ((r.raison ?? "").includes("candidates")) {
			stats.etage2AmbigusRefuses++;
		} else if ((r.raison ?? "").includes("racine trop courte")) {
			stats.racineTropCourte++;
		} else {
			stats.etage2AucuneCandidate++;
		}
	}
	return { stats, rattaches };
}

async function main(): Promise<void> {
	const filleActive = (await query<HintRow>(SQL_FILLE_ACTIVE)).rows;
	const cohort = (await query<HintRow>(SQL_COHORTE)).rows;
	const orgs = (await query<OrgRow>(SQL_ORGS)).rows;
	const alias = (await query<AliasRow>(SQL_ALIAS_DOMAINE)).rows;

	const index = new Map<number, OrgDomaine>();
	for (const o of orgs) {
		index.set(o.id, {
			id: o.id,
			name: o.name,
			slug: o.slug,
			nameNorm: o.name_norm ?? undefined,
			domain: o.domain,
			website: o.website,
			domainNorm: normalizeDomainValue(o.domain),
			websiteDomain: domainFromHint(o.website ?? ""),
		});
	}
	for (const a of alias) {
		const entree = index.get(a.org_id) ?? {
			id: a.org_id,
			name: String(a.org_id),
			slug: String(a.org_id),
		};
		entree.domainAliases = [...(entree.domainAliases ?? []), a.alias];
		index.set(a.org_id, entree);
	}
	const orgsIndexees = [...index.values()];

	const rapport = {
		date: "2026-11-21",
		base: BASE_TEST,
		filtre: SQL_FILTRE,
		cohorte: `indices en attente + indices promus depuis ${SNAPSHOT} (220 indices / 184 domaines au relevé)`,
		sha256_corpus: createHash("sha256")
			.update(cohort.map((h) => h.org_hint).join("\n") + "\n", "utf8")
			.digest("hex"),
		organisationsAvecDomaine: orgs.length,
		aliasDomaine: alias.length,
		fille_active: mesurer(filleActive, orgsIndexees),
		cohorte_184: mesurer(cohort, orgsIndexees),
	};

	const sortie = fileURLToPath(new URL("../bench/results/domaines-racine.json", import.meta.url));
	writeFileSync(sortie, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log("file active :", JSON.stringify(rapport.fille_active.stats));
	console.log("cohorte 184 :", JSON.stringify(rapport.cohorte_184.stats));
	console.log("par origine :", JSON.stringify(
		rapport.cohorte_184.rattaches.reduce<Record<string, number>>((acc, r) => {
			for (const p of r.par) acc[p] = (acc[p] ?? 0) + 1;
			return acc;
		}, {}),
	));
	console.log(`écrit : ${sortie}`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
