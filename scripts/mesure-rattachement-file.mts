/**
 * Mesure du rattachement sur les **indices réels de la file** (lecture seule).
 *
 * Combien des indices en attente se rattachent maintenant ? Trois chemins sont
 * mesurés, dans l'ordre du moteur :
 *  1. domaine racine (www., sous-domaines, port, chemin retirés) contre
 *     `org.domain`, `org.website` et les alias `source='domain'` ;
 *  2. racine du domaine contre le nom d'une organisation ;
 *  3. sigle confirmé par l'index des dénominations usuelles, départagé par le
 *     département ou le domaine de la source.
 *
 * Le référentiel entier (1,67 M d'orgs) n'est jamais rapatrié : on charge les
 * organisations porteuses d'un domaine, celles dont le nom contient une
 * racine présente dans la file, et l'index des sigles. Le moteur pur
 * (`resoudreDomaine`, `matchOrgInIndex`, `decideSigle`) tranche ensuite sur ce
 * sur-ensemble, exactement comme en production.
 *
 * Un fichier vide, un index vide ou une famille sans candidat sont des états
 * mesurés, pas des exceptions muettes. Seule une base injoignable fait échouer
 * la mesure.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-rattachement-file.mts
 *
 * Écrit bench/results/rattachement-file.json.
 */
import { createHash } from "node:crypto";
import type { OrgIndexEntry } from "../apps/api/src/quarantine/promote.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;
// La mesure lit des millions de lignes du référentiel : le délai de l'API
// (15 s par défaut) est trop court pour un balayage de diagnostic.
process.env.RADAR_PG_API_TIMEOUT_MS = "120000";
const { withClient, closePools } = await import("../apps/api/src/db.js");
const { classifierIndice } = await import("../apps/api/src/match/famille-indice.js");
const {
	domaineRacine,
	domainFromHint,
	normalizeDomainValue,
	racineDomaine,
	resoudreDomaine,
} = await import("../apps/api/src/match/domaine.js");
const {
	SQL_INDEX_SIGLES,
	candidatsSigleDepuisRegistre,
	decideSigle,
	buildIndexSigles,
	jetonsPourSigle,
	normaliseSigle,
} = await import("../apps/api/src/match/sigles.js");
const {
	AUTO_MIN_CONFIDENCE,
	MIN_CONFIDENCE,
	matchOrgInIndex,
	normalizeName,
} = await import("../apps/api/src/quarantine/promote.js");

const SORTIE = fileURLToPath(new URL("../bench/results/rattachement-file.json", import.meta.url));

type Hint = { id: number; org_hint: string };
type OrgRow = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	dept: string | null;
	domain: string | null;
	website: string | null;
	name_norm: string | null;
	alias_domaines: string[] | null;
};
type LigneAliasSigle = {
	alias: string;
	org_id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	dept: string | null;
	domain: string | null;
	website: string | null;
	domain_aliases: string[] | null;
};
type Exemple = {
	id: number;
	indice: string;
	famille: string;
	orgId: number;
	confiance: number;
	voie: string;
};

function entreesDepuis(rows: readonly OrgRow[]): OrgIndexEntry[] {
	const parId = new Map<number, OrgIndexEntry>();
	for (const row of rows) {
		const nameNorm = normalizeName(row.name);
		parId.set(Number(row.id), {
			id: Number(row.id),
			name: row.name,
			slug: row.slug,
			kind: row.kind,
			city: row.city,
			domain: row.domain,
			website: row.website,
			nameNorm,
			domainNorm: normalizeDomainValue(row.domain),
			websiteDomain: domainFromHint(row.website ?? ""),
			cityNorm: row.city ? normalizeName(row.city) : null,
			nameTokens: [...new Set(nameNorm.split(" ").filter((t) => t.length >= 4))],
			domainAliases: row.alias_domaines ?? [],
		});
	}
	return [...parId.values()];
}

/** Domaines portés par une organisation, sous forme normalisée ou racine. */
function domainesDe(org: OrgIndexEntry): string[] {
	const valeurs = [org.domain, org.website, ...(org.domainAliases ?? [])];
	const domaines = new Set<string>();
	for (const valeur of valeurs) {
		const normalise = normalizeDomainValue(valeur);
		if (normalise) domaines.add(normalise);
		const racine = domaineRacine(valeur);
		if (racine) domaines.add(racine);
	}
	return [...domaines];
}

/** Jetons de l'indice qui ont forme de sigle et sont présents au registre. */
function siglesDeHint(hint: string, present: (s: string) => boolean): string[] {
	return [...new Set(
		jetonsPourSigle(hint).map((j) => normaliseSigle(j)).filter((s) => /^[A-Z0-9]{2,8}$/.test(s) && present(s)),
	)];
}

async function main(): Promise<void> {
	const mesure = await withClient(async (client) => {
		await client.query("BEGIN READ ONLY");
		try {
			const { rows: hints } = await client.query<Hint>(
				`SELECT id, org_hint FROM quarantine_raw
				  WHERE status = 'pending' AND promoted = false AND kind = 'claim'
				    AND org_hint IS NOT NULL AND btrim(org_hint) <> ''
				  ORDER BY id`,
			);
			const { rows: avecDomaine } = await client.query<OrgRow>(
				`SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.website, o.name_norm,
				        '{}'::text[] AS alias_domaines
				   FROM org o
				  WHERE o.domain IS NOT NULL OR o.website IS NOT NULL
				  ORDER BY o.id`,
			);
			const { rows: avecAlias } = await client.query<OrgRow & { alias_domaine: string }>(
				`SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.website, o.name_norm,
				        a.alias AS alias_domaine
				   FROM org_alias a JOIN org o ON o.id = a.org_id
				  WHERE a.source = 'domain' AND a.status = 'active' AND a.valid_to IS NULL
				  ORDER BY o.id, a.alias`,
			);
			const parId = new Map<number, OrgRow>();
			for (const row of avecDomaine) parId.set(Number(row.id), { ...row, alias_domaines: [] });
			for (const row of avecAlias) {
				const { alias_domaine, ...org } = row;
				const courant = parId.get(Number(row.id)) ?? { ...org, alias_domaines: [] };
				courant.alias_domaines = [...(courant.alias_domaines ?? []), alias_domaine];
				parId.set(Number(row.id), courant);
			}
			const porteurs = [...parId.values()];
			const { rows: aliasSigles } = await client.query<LigneAliasSigle>(SQL_INDEX_SIGLES);
			return { hints, porteurs, aliasSigles };
		} finally {
			await client.query("ROLLBACK");
		}
	});

	const { hints, porteurs, aliasSigles } = mesure;
	const racines = [
		...new Set(hints.map((h) => domaineRacine(h.org_hint)).filter((r): r is string => r !== null)),
	];
	const tiges = [
		...new Set(racines.map((r) => racineDomaine(r)).filter((r): r is string => r !== null)),
	];
	const parNom = await withClient(async (client) => {
		await client.query("BEGIN READ ONLY");
		try {
			if (tiges.length === 0) return [] as OrgRow[];
			// Égalité indexée : le référentiel compte 1,67 M d'orgs et un
			// `ILIKE '%racine%'` sur 141 racines balaie la table entière. Le nom
			// ou le slug exact suffit à mesurer l'étage « racine » du moteur,
			// qui exige de toute façon un mot entier unique.
			const { rows } = await client.query<OrgRow>(
				`SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.website, o.name_norm,
				        NULL::text[] AS alias_domaines
				   FROM org o
				  WHERE o.name_norm = ANY($1::text[]) OR o.slug = ANY($1::text[])
				  ORDER BY o.id
				  LIMIT 10000`,
				[tiges],
			);
			return rows;
		} finally {
			await client.query("ROLLBACK");
		}
	});

	const index = buildIndexSigles(aliasSigles);
	const orgs = entreesDepuis([...porteurs, ...parNom]);
	const familles = { domaine: 0, sigle: 0, nom: 0, vide: 0 };
	const detail = {
		domaines: { exact: 0, racine: 0, nom: 0, refuses: 0 },
		sigles: { cherches: 0, confirmes: 0, confirmesAvecDeptPropose: 0, ambigus: 0, inconnus: 0 },
	};
	const attacheParFamille = { domaine: 0, sigle: 0, nom: 0, vide: 0 };
	const automatiques = { domaine: 0, sigle: 0, nom: 0, vide: 0 };
	const exemples: Exemple[] = [];

	for (const hint of hints) {
		const famille = classifierIndice(hint.org_hint);
		familles[famille] += 1;
		const brut = hint.org_hint.trim();
		const domaine = domainFromHint(brut);
		const racine = domaine ? domaineRacine(brut) : null;
		const tige = racine ? racineDomaine(racine) : null;
		const candidats = tige === null
			? orgs.filter((o) => racine !== null && domainesDe(o).includes(racine))
			: orgs.filter((o) =>
					normalizeName(o.slug).split(" ").includes(tige) ||
					normalizeName(o.nameNorm ?? o.name).split(" ").includes(tige) ||
					(racine !== null && domainesDe(o).includes(racine)),
				);

		let orgId: number | null = null;
		let confiance = 0;
		let voie = "aucune";

		if (famille === "domaine" && racine !== null) {
			const r = resoudreDomaine(brut, candidats, { domain: brut });
			if (r.etape !== "aucune" && r.orgId !== null) {
				orgId = r.orgId;
				confiance = r.confidence;
				voie = r.etape === "exact" ? "domaine-exact" : "domaine-racine";
				detail.domaines[r.etape] += 1;
			} else {
				detail.domaines.refuses += 1;
			}
			const m = matchOrgInIndex(brut, candidats);
			if (orgId === null && m && m.confidence >= MIN_CONFIDENCE) {
				orgId = m.orgId;
				confiance = m.confidence;
				voie = `nom-${m.via}`;
				detail.domaines.nom += 1;
			}
		} else if (famille !== "vide") {
			const m = matchOrgInIndex(brut, candidats);
			if (m && m.confidence >= MIN_CONFIDENCE) {
				orgId = m.orgId;
				confiance = m.confidence;
				voie = `nom-${m.via}`;
			}
			// L'index des sigles est consulté même quand le moteur n'a rien
			// proposé : c'est précisément le cas d'un indice réduit à un sigle.
			const sigles = siglesDeHint(brut, (s) => index.has(s));
			for (const sigle of sigles) {
				detail.sigles.cherches += 1;
				// Seul le domaine porté par la source est un contexte indépendant
				// du rapprochement contesté. Le département de l'org proposée par
				// le moteur est compté à part : il peut valider un faux positif.
				const contexte = domaine ? { domain: domaine } : undefined;
				const candidatsSigle = await candidatsSigleDepuisRegistre(sigle, contexte);
				const decision = decideSigle(sigle, candidatsSigle, contexte);
				if (decision.accepte && decision.orgId !== undefined) {
					detail.sigles.confirmes += 1;
					if (orgId === null) {
						orgId = decision.orgId;
						confiance = 0.7;
						voie = "sigle-confirme";
					}
					break;
				}
				const deptPropose = orgId === null ? null : candidats.find((o) => o.id === orgId)?.dept ?? null;
				if (deptPropose) {
					const avecDept = await candidatsSigleDepuisRegistre(sigle, { ...(contexte ?? {}), dept: deptPropose });
					if (decideSigle(sigle, avecDept, { ...(contexte ?? {}), dept: deptPropose }).accepte) {
						detail.sigles.confirmesAvecDeptPropose += 1;
					}
				}
				if (decision.motif === "ambigu") detail.sigles.ambigus += 1;
				else detail.sigles.inconnus += 1;
			}
		}

		if (orgId !== null) {
			attacheParFamille[famille] += 1;
			if (confiance >= AUTO_MIN_CONFIDENCE) automatiques[famille] += 1;
			if (voie === "sigle-confirme") automatiques.sigle += 1;
			if (exemples.length < 40) {
				exemples.push({ id: hint.id, indice: brut, famille, orgId, confiance, voie });
			}
		}
	}

	const rattaches = Object.values(attacheParFamille).reduce((a, b) => a + b, 0);
	const auto = Object.values(automatiques).reduce((a, b) => a + b, 0);
	const rapport = {
		date: new Date().toISOString(),
		base: BASE_TEST,
		protocole:
			"lecture seule. File pending non promue avec indice ; sur-ensemble d'orgs chargé par racine de domaine, puis moteur pur (resoudreDomaine, matchOrgInIndex, decideSigle avec contexte du domaine et du département de la source). Aucune écriture, aucun org injecté.",
		sha256_file: createHash("sha256")
			.update(hints.map((h) => h.org_hint).join("\n") + "\n", "utf8")
			.digest("hex"),
		taille: {
			indices: hints.length,
			organisationsAvecDomaine: porteurs.length,
			organisationsParNom: parNom.length,
			siglesIndexes: index.size,
		},
		familles,
		detail,
		attacheParFamille,
		rattachements: {
			proposes: rattaches,
			automatiques: auto,
			tauxProposes: rattaches / Math.max(1, hints.length),
		},
		exemples,
	};
	writeFileSync(SORTIE, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log(`indices : ${hints.length} (${JSON.stringify(familles)})`);
	console.log(`détail : ${JSON.stringify(detail)}`);
	console.log(`rattachés : ${rattaches}/${hints.length} (${(100 * rapport.rattachements.tauxProposes).toFixed(1)} %), automatiques : ${auto}`);
	console.log(`écrit : ${SORTIE}`);
}

try {
	await main();
} catch (err) {
	console.error("mesure impossible :", err);
	process.exitCode = 1;
} finally {
	await closePools();
}
