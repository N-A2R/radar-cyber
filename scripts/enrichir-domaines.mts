#!/usr/bin/env -S npx tsx
/**
 * Enrichissement des domaines d'organisations à partir des sources qui les citent.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/enrichir-domaines.mts [--seuil=0.7]
 *   apps/api/node_modules/.bin/tsx scripts/enrichir-domaines.mts --appliquer [--seuil=0.7]
 *
 * PAR DÉFAUT : rapport seul, aucune écriture (base ou fichier). `--appliquer`
 * est la seule porte d'écriture. Le rapport est affiché sur stdout dans les
 * deux cas : il n'existe pas de « rapport écrit » en mode rapport.
 *
 * Deux voies, toutes deux ancées sur un nom qui ressemble à un site officiel :
 *  1. le nom de l'org est lui-même un domaine (`planning-services.fr`) ;
 *  2. les jetons du nom (`MALONE ACCOUNTANTS`) reproduisent la racine d'un
 *     domaine cité par une source (`www.maloneaccountants.ie`).
 *
 * Les « liens sortants » analysés sont ceux des sources qui citent l'org :
 *   - `quarantine_raw.org_hint` et ancres `<a href>` de `raw_body` ;
 *   - `event.title` / `summary` / `evidence` et hôte de `source_url` ;
 *   - chemin des URL ransomware.live dont le segment base64 decode en
 *     « victime@groupe » : la victime est le domaine recherché.
 *
 * Les hôtes d'agrégateurs et les fournisseurs de messagerie ne sont jamais
 * proposés. Chaque proposition porte un score ; seul le meilleur domaine
 * au-dessus du seuil est retenu, jamais en cas d'égalité ou de racine
 * partagée entre plusieurs organisations.
 */

import { closePools, ingestQuery, query, withTransaction } from "../apps/api/src/db.js";
import { normalizeDomainValue, racineDomaine } from "../apps/api/src/match/domaine.js";

/** TLD acceptés : un suffixe inconnu n'est pas un domaine d'organisation. */
const TLD = [
	"gouv.fr", "asso.fr", "ac.fr", "edu.fr", "co.uk", "org.uk", "com.br",
	"com.au", "co.jp", "co.nz", "com.tr", "fr", "com", "org", "net", "eu",
	"io", "ai", "me", "uk", "be", "ch", "de", "es", "it", "nl", "ie",
	"info", "biz", "co", "us", "ca", "br", "edu", "gov", "int", "app", "dev",
] as const;

const TLD_ALT = [...TLD]
	.sort((a, b) => b.length - a.length)
	.map((t) => t.replace(/\./g, "\\."))
	.join("|");

/** Domaine nu dans un texte libre ; le suffixe est vérifié ensuite. */
const DOMAINE_RE = new RegExp(
	`(^|[^a-z0-9.-])((?:www\\.)?(?:[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?\\.)+(?:${TLD_ALT}))(?=$|[^a-z0-9-])`,
	"gi",
);

/** Hôtes qui hébergent des citations, pas le site de l'organisation citée. */
const HOTES_AGGREGATEURS = new Set([
	"github.com", "raw.githubusercontent.com", "gist.github.com", "gitlab.com",
	"ransomware.live", "www.ransomware.live", "ransomlook.io", "www.ransomlook.io",
	"t.me", "telegram.me", "twitter.com", "x.com", "reddit.com", "youtube.com",
	"haveibeenpwned.com", "cert.at", "circl.lu", "pastebin.com",
]);

/** racine publique : jamais le site officiel d'une organisation. */
const FOURNISSEURS = new Set([
	"gmail", "googlemail", "yahoo", "hotmail", "outlook", "live", "aol", "icloud",
	"orange", "free", "laposte", "wanadoo", "sfr", "numericable", "bouygues",
	"protonmail", "proton", "gmx", "yandex", "zoho", "webmail",
	"facebook", "instagram", "linkedin", "twitter", "tiktok", "youtube",
	"wixsite", "wordpress", "blogspot", "weebly", "squarespace", "shopify",
]);

type OrgCandidate = {
	id: number;
	name: string;
	domaineNom: string | null;
	racineNom: string | null;
	mots: Set<string>;
};

type Preuve = {
	exact: boolean;
	racine: boolean;
	tokens: boolean;
	lienSortant: boolean;
	sources: Set<string>;
};

type Proposition = {
	orgId: number;
	orgName: string;
	domaine: string;
	confiance: number;
	sources: number;
};

type Citation = {
	source: string;
	domaines: Set<string>;
	lienSortant: boolean;
};

function normaliser(source: string | null | undefined): string {
	return (source ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Tous les domaines d'un texte (le regex est global et garde chaque occurrence). */
function domainesDansTexte(texte: string | null | undefined): Set<string> {
	const trouves = new Set<string>();
	if (!texte) return trouves;
	for (const match of texte.matchAll(DOMAINE_RE)) {
		const domaine = normalizeDomainValue(match[2] ?? "");
		if (domaine && (domaine.split(".")[0] ?? "").length >= 4) trouves.add(domaine);
	}
	return trouves;
}

/** Premier domaine d'un texte : le nom d'org est-il un site officiel ? */
function domaineDansTexte(texte: string | null | undefined): string | null {
	return [...domainesDansTexte(texte)][0] ?? null;
}

/** Racine utilisable : distinctive, pas un service ni un fournisseur public. */
function racineAdmissible(domaine: string): boolean {
	const racine = racineDomaine(domaine);
	return Boolean(racine && racine.length >= 5 && !FOURNISSEURS.has(racine));
}

/** Jetons significatifs du nom d'une organisation, pour rapprocher une racine. */
function motsDuNom(name: string): Set<string> {
	return new Set(normaliser(name).split(/[^a-z0-9]+/).filter((mot) => mot.length >= 4));
}

/** Décode un segment base64 sans faire confiance à un binaire arbitraire. */
function decoderBase64(segment: string): string | null {
	if (segment.length < 12 || segment.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(segment)) return null;
	try {
		const decoded = Buffer.from(segment, "base64").toString("utf8");
		// Caractères de contrôle : ce n'est pas un lien lisible.
		if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
		return decoded;
	} catch {
		return null;
	}
}

/** Analyse des liens sortants portés par l'URL d'une source (hôte + chemin). */
function liensDepuisUrl(url: string | null | undefined): { domaines: Set<string>; lienSortant: boolean } {
	const domaines = new Set<string>();
	let lienSortant = false;
	if (!url) return { domaines, lienSortant };
	try {
		const parsed = new URL(url);
		const hote = parsed.hostname.toLowerCase().replace(/\.$/, "");
		if (hote && !HOTES_AGGREGATEURS.has(hote)) {
			for (const domaine of domainesDansTexte(hote)) {
				domaines.add(domaine);
				lienSortant = true; // la citation est hébergée chez l'org elle-même
			}
		}
		const segments = `${parsed.pathname} ${parsed.search}`.split(/[^A-Za-z0-9+/=_%-]+/);
		for (const brut of segments) {
			if (!brut) continue;
			let decoded = brut;
			try {
				decoded = decodeURIComponent(brut);
			} catch {
				// Segment mal encodé : on garde la forme brute.
			}
			for (const texte of [decoded, decoderBase64(decoded)]) {
				if (!texte) continue;
				for (const domaine of domainesDansTexte(texte)) {
					domaines.add(domaine);
					lienSortant = true; // domaine ciblé par le lien, pas hôte d'agrégateur
				}
			}
		}
	} catch {
		// URL mal formée : le texte de la citation reste analysé.
	}
	return { domaines, lienSortant };
}

/** Ancres <a href="https://…"> d'un corps HTML : de vrais liens sortants. */
function liensDepuisHtml(body: string | null | undefined): Set<string> {
	const domaines = new Set<string>();
	if (!body) return domaines;
	for (const ancre of body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
		for (const domaine of liensDepuisUrl(ancre[1]).domaines) domaines.add(domaine);
	}
	return domaines;
}

/** Score additif, plafonné à 1. Chaque composante est une preuve distincte. */
function score(preuve: Preuve, domaine: string): number {
	let s = 0.35; // domaine observé dans au moins une source qui cite l'org
	if (preuve.exact) s += 0.35; // le nom de l'org porte déjà ce domaine
	else if (preuve.racine || preuve.tokens) s += 0.15; // racine retrouvée dans le nom
	if (preuve.sources.size >= 2) s += 0.15; // sources indépendantes
	if (preuve.lienSortant) s += 0.1; // lien sortant explicite, pas simple texte
	if ((racineDomaine(domaine) ?? "").length >= 6) s += 0.05;
	return Math.min(1, Math.round(s * 100) / 100);
}

function usage(): never {
	console.error(
		"usage : apps/api/node_modules/.bin/tsx scripts/enrichir-domaines.mts [--appliquer] [--seuil=0.7]\n" +
			"  sans --appliquer : rapport seul, aucune écriture",
	);
	process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();
const appliquer = args.includes("--appliquer");
let seuil = 0.7;
const seuilArg = args.find((arg) => arg.startsWith("--seuil="));
if (seuilArg) {
	seuil = Number(seuilArg.slice("--seuil=".length));
	if (!Number.isFinite(seuil) || seuil <= 0 || seuil > 1) {
		console.error("--seuil invalide : nombre dans ]0, 1] attendu");
		process.exit(1);
	}
}
const inconnu = args.find((arg) => arg !== "--appliquer" && arg !== "-h" && arg !== "--help" && !arg.startsWith("--seuil="));
if (inconnu) {
	console.error(`argument inconnu : ${inconnu}`);
	usage();
}

/** Domaines propres d'une citation, après filtre des fournisseurs. */
function domainesPropres(domaines: Set<string>): Set<string> {
	return new Set([...domaines].filter(racineAdmissible));
}

async function main(): Promise<void> {
	// 1) Citations : on lit les sources avant de choisir les organisations.
	const citations: Citation[] = [];
	const { rows: quarantines } = await ingestQuery<{
		org_hint: string | null;
		source_url: string | null;
		raw_body: string | null;
	}>(
		`SELECT org_hint, source_url, left(raw_body, 5000) AS raw_body
		   FROM quarantine_raw
		  WHERE org_hint IS NOT NULL AND btrim(org_hint) <> ''`,
	);
	for (const q of quarantines) {
		const lienUrl = liensDepuisUrl(q.source_url);
		const liensHtml = liensDepuisHtml(q.raw_body);
		const domaines = domainesPropres(new Set([
			...lienUrl.domaines, ...liensHtml, ...domainesDansTexte(q.org_hint),
		]));
		if (domaines.size === 0) continue;
		citations.push({
			source: q.source_url ?? `quarantine:${normaliser(q.org_hint).slice(0, 60)}`,
			domaines,
			lienSortant: lienUrl.lienSortant || liensHtml.size > 0,
		});
	}

	const { rows: evenements } = await ingestQuery<{
		source_url: string | null;
		title: string | null;
		summary: string | null;
		evidence: Record<string, unknown>;
	}>(`SELECT source_url, title, summary, evidence FROM event WHERE source_url IS NOT NULL OR title IS NOT NULL`);
	for (const e of evenements) {
		const lienUrl = liensDepuisUrl(e.source_url);
		const description = typeof e.evidence?.description === "string" ? e.evidence.description : "";
		const domaines = domainesPropres(new Set([
			...lienUrl.domaines,
			...domainesDansTexte(`${e.title ?? ""} ${e.summary ?? ""} ${description}`),
		]));
		if (domaines.size === 0) continue;
		citations.push({
			source: e.source_url ?? `event:${normaliser(e.title).slice(0, 60)}`,
			domaines,
			lienSortant: lienUrl.lienSortant,
		});
	}

	const racines = [...new Set(citations.flatMap((c) => [...c.domaines]).map((d) => d.split(".")[0] ?? ""))]
		.filter((r) => r.length >= 5 && !FOURNISSEURS.has(r))
		.sort();

	// 2) Organisations candidates, sans charger 1,67 M de lignes en mémoire.
	const parId = new Map<number, OrgCandidate>();
	const sqlNomDomaine = `(^|[^a-z0-9])(www\\.)?[a-z0-9][a-z0-9-]{2,}(\\.[a-z0-9-]+)*\\.(${TLD_ALT})([^a-z0-9]|$)`;
	const { rows: orgsDomaine } = await ingestQuery<{ id: number; name: string }>(
		`SELECT id, name FROM org
		  WHERE (domain IS NULL OR btrim(domain) = '')
		    AND (website IS NULL OR btrim(website) = '')
		    AND name ~* $1
		  ORDER BY id`,
		[sqlNomDomaine],
	);
	for (const org of orgsDomaine) {
		const domaineNom = domaineDansTexte(org.name);
		if (!domaineNom || !racineAdmissible(domaineNom)) continue;
		parId.set(org.id, {
			...org,
			domaineNom,
			racineNom: racineDomaine(domaineNom),
			mots: motsDuNom(org.name),
		});
	}
	const candidatsNomDomaine = parId.size;

	// Voie 2 : le nom contient la racine d'un domaine cité. Tranche par tranche
	// pour rester sous le timeout des requêtes de maintenance.
	const avantParRacine = parId.size;
	for (let i = 0; i < racines.length; i += 500) {
		const { rows } = await ingestQuery<{ id: number; name: string }>(
			`SELECT DISTINCT o.id, o.name
			   FROM unnest($1::text[]) AS r(racine)
			   JOIN org o ON o.name_norm ILIKE '%' || r.racine || '%'
			  WHERE (o.domain IS NULL OR btrim(o.domain) = '')
			    AND (o.website IS NULL OR btrim(o.website) = '')`,
			[racines.slice(i, i + 500)],
		);
		for (const org of rows) {
			if (!parId.has(org.id)) {
				parId.set(org.id, { ...org, domaineNom: null, racineNom: null, mots: motsDuNom(org.name) });
			}
		}
	}
	const candidatsParRacine = parId.size - avantParRacine;

	const parDomaine = new Map<string, number[]>();
	const parRacine = new Map<string, number[]>();
	for (const org of parId.values()) {
		if (org.domaineNom) {
			const exact = parDomaine.get(org.domaineNom) ?? [];
			exact.push(org.id);
			parDomaine.set(org.domaineNom, exact);
		}
		if (org.racineNom) {
			const liste = parRacine.get(org.racineNom) ?? [];
			liste.push(org.id);
			parRacine.set(org.racineNom, liste);
		}
	}
	for (const org of parId.values()) {
		for (const mot of org.mots) {
			if (!racineAdmissible(`${mot}.com`)) continue;
			const liste = parRacine.get(mot) ?? [];
			if (!liste.includes(org.id)) liste.push(org.id);
			parRacine.set(mot, liste);
		}
	}

	// 3) Preuves : un domaine ne peut viser que des orgs dont le nom le porte.
	const preuves = new Map<number, Map<string, Preuve>>();
	const racinesAmbigues = new Set<string>();
	for (const citation of citations) {
		for (const domaine of citation.domaines) {
			const racine = racineDomaine(domaine);
			const idsRacine = racine ? parRacine.get(racine) ?? [] : [];
			const cibles = new Set<number>(parDomaine.get(domaine) ?? []);
			for (const id of idsRacine) cibles.add(id);
			for (const id of cibles) {
				const org = parId.get(id);
				if (!org) continue;
				const nomCompact = normaliser(org.name).replace(/[^a-z0-9]/g, "");
				const exact = org.domaineNom === domaine;
				const parNomRacine = Boolean(racine && racine === org.racineNom);
				const parTokens = Boolean(racine && (
					org.mots.has(racine) || (racine.length >= 8 && nomCompact.includes(racine))
				));
				if (!exact && !parNomRacine && !parTokens) continue;
				// Même racine chez plusieurs orgs sans correspondance exacte :
				// on ne choisit pas arbitrairement.
				if (!exact && idsRacine.length > 1) {
					if (racine) racinesAmbigues.add(racine);
					continue;
				}
				const parOrg = preuves.get(id) ?? new Map<string, Preuve>();
				const preuve = parOrg.get(domaine) ?? {
					exact: false,
					racine: false,
					tokens: false,
					lienSortant: false,
					sources: new Set<string>(),
				};
				preuve.exact ||= exact;
				preuve.racine ||= parNomRacine;
				preuve.tokens ||= parTokens;
				preuve.lienSortant ||= citation.lienSortant;
				preuve.sources.add(citation.source);
				parOrg.set(domaine, preuve);
				preuves.set(id, parOrg);
			}
		}
	}

	const retenues: Proposition[] = [];
	let sousSeuil = 0;
	let ambigus = 0;
	for (const [orgId, parDomaineOrg] of preuves) {
		const notes = [...parDomaineOrg].map(([domaine, preuve]) => ({
			domaine,
			confiance: score(preuve, domaine),
			sources: preuve.sources.size,
		}));
		notes.sort((a, b) => b.confiance - a.confiance || a.domaine.localeCompare(b.domaine));
		const meilleur = notes[0]!;
		if (meilleur.confiance < seuil) {
			sousSeuil++;
			continue;
		}
		const suivant = notes[1];
		if (suivant && suivant.confiance >= seuil && meilleur.confiance - suivant.confiance < 0.1) {
			ambigus++;
			continue;
		}
		retenues.push({
			orgId,
			orgName: parId.get(orgId)?.name ?? `#${orgId}`,
			domaine: meilleur.domaine,
			confiance: meilleur.confiance,
			sources: meilleur.sources,
		});
	}
	retenues.sort((a, b) => b.confiance - a.confiance || a.orgId - b.orgId);

	const confiances = retenues.map((r) => r.confiance);
	const { rows: avant } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE domain IS NOT NULL");
	let misesAJour = 0;
	if (appliquer && retenues.length > 0) {
		await withTransaction(async (client) => {
			for (const r of retenues) {
				const res = await client.query(
					`UPDATE org SET domain = $1
					  WHERE id = $2 AND (domain IS NULL OR btrim(domain) = '')`,
					[r.domaine, r.orgId],
				);
				misesAJour += res.rowCount ?? 0;
			}
		});
	}
	const { rows: apres } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE domain IS NOT NULL");

	const palette = { "0.70-0.79": 0, "0.80-0.89": 0, "0.90-1.00": 0 };
	for (const c of confiances) {
		if (c < 0.8) palette["0.70-0.79"]++;
		else if (c < 0.9) palette["0.80-0.89"]++;
		else palette["0.90-1.00"]++;
	}
	const rapport = {
		mode: appliquer ? "application" : "rapport (aucune écriture)",
		seuil,
		candidatsNomDomaine,
		candidatsParRacine,
		racinesCitees: racines.length,
		citationsExaminees: { quarantines: quarantines.length, evenements: evenements.length },
		organisationsAvecProposition: preuves.size,
		retenues: retenues.length,
		refusSousSeuil: sousSeuil,
		refusAmbigus: ambigus,
		refusRacinePartagee: racinesAmbigues.size,
		confiance: {
			min: confiances.length ? Math.min(...confiances) : null,
			max: confiances.length ? Math.max(...confiances) : null,
			moyenne: confiances.length
				? Math.round((confiances.reduce((a, b) => a + b, 0) / confiances.length) * 100) / 100
				: null,
		},
		repartition: palette,
		domainesAvant: Number(avant[0]?.n ?? 0),
		domainesApres: Number(apres[0]?.n ?? 0),
		misesAJour,
		echantillon: retenues.slice(0, 20),
	};

	console.log(`[domaines] ${rapport.mode} — seuil ${seuil}`);
	console.log(
		`[domaines] ${rapport.candidatsNomDomaine} noms-domaines + ${rapport.candidatsParRacine} noms rattachés à ${rapport.racinesCitees} racines citées`,
	);
	console.log(`[domaines] ${rapport.organisationsAvecProposition} ont au moins une proposition issue des sources`);
	console.log(
		`[domaines] ${rapport.retenues} gagnent un domaine : confiance min ${rapport.confiance.min ?? "-"}, ` +
			`max ${rapport.confiance.max ?? "-"}, moyenne ${rapport.confiance.moyenne ?? "-"}`,
	);
	console.log(
		`[domaines] refus : ${rapport.refusSousSeuil} sous le seuil, ${rapport.refusAmbigus} ambigus, ` +
			`${rapport.refusRacinePartagee} racines partagées`,
	);
	console.log(
		`[domaines] domaines renseignés : ${rapport.domainesAvant} → ${rapport.domainesApres} ` +
			`(${rapport.misesAJour} UPDATE)`,
	);
	for (const r of rapport.echantillon) {
		console.log(
			`  ${String(r.orgId).padStart(8)}  ${r.confiance.toFixed(2)}  ${r.orgName.slice(0, 40).padEnd(40)} → ${r.domaine} (${r.sources} source(s))`,
		);
	}
	console.log(JSON.stringify(rapport));
}

try {
	await main();
} finally {
	await closePools();
}
