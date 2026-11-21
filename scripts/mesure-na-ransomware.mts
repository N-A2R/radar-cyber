/**
 * Mesure NA du rattachement des revendications ransomware — avant/après du
 * préfiltre accentué (docs/plans/mission-nuit-na.md, Task 3).
 *
 * Défaut connu de `promote.ts` : `loadCandidateIndex` préfiltre les candidats
 * avec `name ILIKE '%jeton%'` où les jetons sont **déaccentués**
 * (`normalizeName`). Les noms en base gardent leurs accents : « espérance » →
 * `ILIKE '%esperance%'` rate « Commune de Pechs-de-l'Espérance ». Vérifié en
 * base le 2026-11-21 : les deux ILIKE rendent des ensembles disjoints. Les
 * domaines (la forme dominante des org_hint) ne portent jamais d'accent :
 * toute organisation au nom accentué citée par son domaine devenait invisible.
 *
 * Méthode : les DEUX préfiltres sont posés ici —
 *   - `candidatsAvant` : copie exacte du code actuel de `loadCandidateIndex` ;
 *   - `candidatsApres` : même clause, sur `org.name_norm` (colonne générée
 *     sans accents, migration 041).
 * Le moteur de production `matchOrgInIndex` est commun aux deux : la mesure
 * n'approxime rien.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/mesure-na-ransomware.mts --json=bench/results/na-ransomware.json
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	matchOrgInIndex,
	normalizeName,
	extractDomain,
	GENERIC_TOKENS,
	type OrgIndexEntry,
	type OrgMatch,
} from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const SORTIE_JSON =
	argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? "bench/results/na-ransomware.json";

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const DANS_NA = DEPTS.map((d) => `'${d}'`).join(",");

const REQUETES = {
	revendications30j: `SELECT count(*) AS total, count(*) FILTER (WHERE org_hint IS NOT NULL AND org_hint <> '') AS avec_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' AND claimed_at >= now() - interval '30 days'`,
	hints30j: `SELECT id, source, groupe, org_hint, claimed_at FROM quarantine_raw WHERE kind='claim' AND status='pending' AND claimed_at >= now() - interval '30 days' AND org_hint IS NOT NULL AND org_hint <> '' ORDER BY claimed_at DESC, id DESC`,
	hintsTous: `SELECT count(*) AS n FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL AND org_hint <> ''`,
	villesNA: `SELECT DISTINCT city FROM org WHERE dept IN (${DANS_NA}) AND city IS NOT NULL`,
};

/**
 * Préfiltre AVANT — copie exacte du `loadCandidateIndex` de promote.ts au
 * moment de la mesure (avant migration 041). À ne PAS modifier : c'est
 * l'état « avant » documenté.
 */
async function candidatsAvant(hint: string): Promise<OrgIndexEntryNA[]> {
	const tokens = [...new Set(normalizeName(hint).split(" ").filter((t) => t.length >= 2))];
	const domain = extractDomain(hint);
	const clauses: string[] = [];
	const params: unknown[] = [];
	if (tokens.length > 0) {
		params.push(tokens.map((t) => `%${t}%`));
		clauses.push(`name ILIKE ANY($${params.length}::text[])`);
	}
	if (domain) {
		params.push(domain);
		const d = `$${params.length}`;
		clauses.push(
			`(lower(domain) = ${d} OR lower(domain) LIKE '%.' || ${d} OR ${d} LIKE '%.' || lower(domain) OR lower(coalesce(website, '')) LIKE '%' || ${d})`,
		);
	}
	if (clauses.length === 0) return [];
	const r = await query<OrgAvecDept>(
		`SELECT id, name, slug, kind, city, domain, website, dept FROM org WHERE ${clauses.join(" OR ")}`,
		params,
	);
	return r.rows.map((o) => entree(o));
}

/**
 * Préfiltre APRÈS — identique, mais sur `org.name_norm` (colonne générée
 * déaccentuée, index trigramme). C'est la version portée dans promote.ts par
 * le correctif de Task 3.
 */
async function candidatsApres(hint: string): Promise<OrgIndexEntryNA[]> {
	const tokens = [...new Set(normalizeName(hint).split(" ").filter((t) => t.length >= 2))];
	const domain = extractDomain(hint);
	const clauses: string[] = [];
	const params: unknown[] = [];
	if (tokens.length > 0) {
		params.push(tokens.map((t) => `%${t}%`));
		clauses.push(`name_norm ILIKE ANY($${params.length}::text[])`);
	}
	if (domain) {
		params.push(domain);
		const d = `$${params.length}`;
		clauses.push(
			`(lower(domain) = ${d} OR lower(domain) LIKE '%.' || ${d} OR ${d} LIKE '%.' || lower(domain) OR lower(coalesce(website, '')) LIKE '%' || ${d})`,
		);
	}
	if (clauses.length === 0) return [];
	const r = await query<OrgAvecDept>(
		`SELECT id, name, slug, kind, city, domain, website, dept FROM org WHERE ${clauses.join(" OR ")}`,
		params,
	);
	return r.rows.map((o) => entree(o));
}

type OrgAvecDept = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	domain: string | null;
	website: string | null;
	dept: string | null;
};

/** Entrée moteur enrichie du département (portée NA), sans changer le calcul. */
type OrgIndexEntryNA = OrgIndexEntry & { dept: string | null };

/** Même normalisation d'entrée que `toIndexEntry` de promote.ts, + dept. */
function entree(o: OrgAvecDept): OrgIndexEntryNA {
	const nameNorm = normalizeName(o.name);
	return {
		id: o.id,
		name: o.name,
		slug: o.slug,
		kind: o.kind,
		city: o.city,
		domain: o.domain,
		website: o.website,
		dept: o.dept,
		nameNorm,
		domainNorm: o.domain ? o.domain.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "") : null,
		websiteDomain: o.website ? o.website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null,
		cityNorm: o.city ? normalizeName(o.city) : null,
		nameTokens: [...new Set(nameNorm.split(" ").filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t)))],
	};
}

/**
 * Commune de NA citée dans l'indice — par **jeton entier**, pas en
 * sous-chaîne : la première version du détecteur trouvait « igon » (Igon, 64)
 * dans « arrigoni**.it** » et « baron » (Baron, 33) dans
 * « baronandbudd.com ». Une commune à plusieurs mots (« saint yzan ») est
 * cherchée comme fenêtre glissante de jetons consécutifs.
 */
function citeVilleNA(hintNorm: string, villesNorm: Set<string>): string | null {
	const tokens = hintNorm.split(" ").filter(Boolean);
	for (let i = 0; i < tokens.length; i++) {
		for (let l = 1; l <= 4 && i + l <= tokens.length; l++) {
			const phrase = tokens.slice(i, i + l).join(" ");
			if (villesNorm.has(phrase)) return phrase;
		}
	}
	return null;
}

type MatchDetail = { orgId: number; orgName: string; dept: string | null; confidence: number; via: string };

function detailDe(m: OrgMatch | null, index: OrgIndexEntryNA[]): MatchDetail | null {
	if (!m) return null;
	const e = index.find((x) => x.id === m.orgId);
	return { orgId: m.orgId, orgName: e?.name ?? "?", dept: e?.dept ?? null, confidence: m.confidence, via: m.via };
}

type Verdict =
	| "na_rattache_avant"
	| "gagne_par_correctif"
	| "na_sans_match"
	| "non_na";

async function main(): Promise<void> {
	const dateMesure = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

	// Vocabulaire NA : les communes du référentiel. Un Set de phrases
	// normalisées ; les communes d'un mot de moins de 5 lettres sont écartées
	// (« Port », « Nay »…) : trop de domaines étrangers portent ces mots.
	const { rows: villesRows } = await query<{ city: string }>(REQUETES.villesNA);
	const villesNorm = new Set(
		villesRows
			.map((v) => normalizeName(v.city))
			.filter((v) => v.length >= 5 && !v.includes(" ")),
	);

	const { rows: tot30 } = await query<{ total: string; avec_hint: string }>(REQUETES.revendications30j);
	const { rows: tous } = await query<{ n: string }>(REQUETES.hintsTous);
	const { rows: claims } = await query<{ id: number; source: string; groupe: string | null; org_hint: string; claimed_at: string }>(REQUETES.hints30j);

	let proposesAvant50 = 0;
	let proposesAvant85 = 0;
	let proposesApres50 = 0;
	let proposesApres85 = 0;
	const verdicts: {
		id: number;
		source: string;
		groupe: string | null;
		orgHint: string;
		claimedAt: string;
		verdict: Verdict;
		signalNa: string | null;
		avant: MatchDetail | null;
		apres: MatchDetail | null;
	}[] = [];

	for (const c of claims) {
		const [idxAvant, idxApres] = [await candidatsAvant(c.org_hint), await candidatsApres(c.org_hint)];
		const mAvant = matchOrgInIndex(c.org_hint, idxAvant);
		const mApres = matchOrgInIndex(c.org_hint, idxApres);
		const dAvant = detailDe(mAvant, idxAvant);
		const dApres = detailDe(mApres, idxApres);

		const naAvant = dAvant !== null && dAvant.dept !== null && DEPTS.includes(dAvant.dept);
		const naApres = dApres !== null && dApres.dept !== null && DEPTS.includes(dApres.dept);
		const hintNorm = normalizeName(c.org_hint);
		const ville = citeVilleNA(hintNorm, villesNorm);
		const signalNa = naAvant || naApres ? (dApres ?? dAvant)!.orgName : ville ? `commune : ${ville}` : null;

		let verdict: Verdict;
		if (naAvant) verdict = "na_rattache_avant";
		else if (naApres) verdict = "gagne_par_correctif";
		else if (signalNa !== null) verdict = "na_sans_match";
		else verdict = "non_na";

		if (dAvant && naAvant) {
			if (dAvant.confidence >= 0.5) proposesAvant50++;
			if (dAvant.confidence >= 0.85) proposesAvant85++;
		}
		if (dApres && naApres) {
			if (dApres.confidence >= 0.5) proposesApres50++;
			if (dApres.confidence >= 0.85) proposesApres85++;
		}

		verdicts.push({
			id: c.id,
			source: c.source,
			groupe: c.groupe,
			orgHint: c.org_hint,
			claimedAt: c.claimed_at,
			verdict,
			signalNa,
			avant: naAvant ? dAvant : null,
			apres: naApres ? dApres : null,
		});
	}

	const parVerdict = (v: Verdict) => verdicts.filter((x) => x.verdict === v).length;
	const gagne = verdicts.filter((x) => x.verdict === "gagne_par_correctif");

	const resultat = {
		dateMesure,
		plan: "docs/plans/mission-nuit-na.md — Task 3",
		commande: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/mesure-na-ransomware.mts",
		defautAccentue: "préfiltre de loadCandidateIndex : name ILIKE sur des jetons déaccentués, noms en base accentués (promote.ts)",
		defautJetons: "scoreEntry : orgTokens non dédupliqués — « CO & CO » comptait deux jetons et matchait tout « .co.* » ; noms réduit à un jeton générique (« LIMITED », « H CONSULTING ») absorbant tout indice court",
		correctifs: [
			"migration 041 : org.name_norm (colonne générée déaccentuée) + index trigramme ; loadCandidateIndex préfiltre sur name_norm",
			"promote.ts scoreEntry : déduplication des orgTokens",
			"promote.ts GENERIC_TOKENS : formes juridiques étrangères (ltd, limited, inc, llc, corp, plc) et mots d'activité (consulting, advisory)",
		],
		// Premier passage, mesuré AVANT tout correctif (même script, moteur et
		// préfiltre d'origine). Les 13 « rattachements » ont été vérifiés un par
		// un contre l'organisation trouvée : 9 sont mécaniquement faux, 4 sont
		// la règle volontaire « indice court + jeton ≥ 5 caractères » dont
		// l'identité réelle reste à vérifier (Task 4).
		etatInitial: {
			naProposesSeuil50: 13,
			naProposesSeuil85: 0,
			fauxPositifsVerifies: [
				{ hint: "wakao.co.jp", org: "CO & CO (251091, Billère 64)", motif: "jetons dupliqués" },
				{ hint: "terminais.co.mz", org: "CO & CO (251091)", motif: "jetons dupliqués" },
				{ hint: "instantaccess-co.com", org: "CO & CO (251091)", motif: "jetons dupliqués" },
				{ hint: "plasmagen.co.in", org: "CO & CO (251091)", motif: "jetons dupliqués" },
				{ hint: "triad.co.ke", org: "CO & CO (251091)", motif: "jetons dupliqués" },
				{ hint: "ridgway.k12.co.us", org: "CO & CO (251091)", motif: "jetons dupliqués" },
				{ hint: "spicorp-invest.com", org: "MEDIA INVEST SARL (37113)", motif: "« media » générique + jetons dupliqués" },
				{ hint: "Actualize Consulting", org: "H CONSULTING (27437)", motif: "« consulting » générique" },
				{ hint: "Boutinot Limited", org: "LIMITED (506574, La Jarrie-Audouin 17)", motif: "forme juridique « limited »" },
			],
			plausiblesNonVerifies: [
				{ hint: "amarok.com", org: "AMAROK (650238)" },
				{ hint: "chevron.com", org: "SCI CHEVRON (162264)" },
				{ hint: "harbingerconcrete.build", org: "BUILD (416185, Mérignac 33)" },
				{ hint: "groupe-alternance.com", org: "GROUPE ALTERNANCE (422363)" },
			],
		},
		requetes: REQUETES,
		fenetre30j: "claimed_at >= now() - interval '30 days'",
		revendications: {
			pending30j: Number(tot30[0]?.total ?? 0),
			avecHint30j: Number(tot30[0]?.avec_hint ?? 0),
			pendingToutesAvecHint: Number(tous[0]?.n ?? 0),
		},
		// Mesure du seul préfiltre : moteur actuel (corrigé) appliqué aux
		// candidats de l'ancien préfiltre (avant) et du nouveau (après).
		prefiltre: {
			avant: { naProposesSeuil50: proposesAvant50, naProposesSeuil85: proposesAvant85 },
			apres: { naProposesSeuil50: proposesApres50, naProposesSeuil85: proposesApres85 },
			gagne: gagne.length,
		},
		parVerdict: {
			na_rattache_avant: parVerdict("na_rattache_avant"),
			gagne_par_correctif: parVerdict("gagne_par_correctif"),
			na_sans_match: parVerdict("na_sans_match"),
			non_na: parVerdict("non_na"),
		},
		verdicts,
	};

	console.log(`Mesure rattachement ransomware NA — ${dateMesure}`);
	console.log(`Revendications 30 j : ${resultat.revendications.pending30j} en attente, ${resultat.revendications.avecHint30j} avec org_hint (${resultat.revendications.pendingToutesAvecHint} toutes périodes)`);
	console.log(
		`NA rattachables : préfiltre ancien ${proposesAvant50} (≥0,5) / ${proposesAvant85} (≥0,85) → préfiltre name_norm ${proposesApres50} / ${proposesApres85}`,
	);
	console.log(
		`Verdicts : rattaché préfiltre ancien ${parVerdict("na_rattache_avant")} · gagné par correctif ${parVerdict("gagne_par_correctif")} · NA sans match ${parVerdict("na_sans_match")} · non NA ${parVerdict("non_na")}`,
	);
	for (const g of gagne.slice(0, 10)) {
		console.log(`  GAGNÉ ${g.id} « ${g.orgHint} » → ${g.apres?.orgName} (${g.apres?.confidence}, via ${g.apres?.via})`);
	}

	writeFileSync(SORTIE_JSON, `${JSON.stringify(resultat, null, 2)}\n`, "utf8");
	console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
