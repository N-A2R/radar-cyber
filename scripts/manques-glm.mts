#!/usr/bin/env -S npx tsx
/**
 * Vague manques GLM — traiter les 10 premières entités de la cohorte `france`
 * du fichier `bench/results/manques-referentiel-2026-11-15.json`.
 *
 * Méthode : l'identité légale est cherchée dans le registre SIRENE national via
 * l'API publique recherche-entreprises.api.gouv.fr (sans clé, source déjà
 * branchée par scripts/import-sirene.mts et apps/api/src/collectors/geocode.ts).
 * Quand la revendication donne un domaine, le site de l'entité est lu : un
 * SIREN ou un numéro RCS publié par le site lui-même, recoupé avec le registre,
 * est la preuve la plus forte ; sinon la dénomination la plus longue publiée
 * sur le site corrobore le candidat. Aucun SIREN n'est jamais inventé : tout
 * identifiant provient du registre ou d'une page publiée par l'entité, recoupée
 * avec le registre. Les entités cessées sont cherchées aussi
 * (etat_administratif=C) : une identité disparue reste une identité réelle, et
 * le verdict le dit.
 *
 * Échelles de confiance :
 *   haute   — SIREN/RCS publié par le site de l'entité et confirmé au registre,
 *             ou dénomination la plus longue publiée sur le site du domaine ;
 *   moyenne — égalité exacte de dénomination au registre, sans preuve de site ;
 *   faible  — dénomination à un jeton près (alias officiel, homonymie interne
 *             au même groupe) : à revoir par un humain avant chargement.
 *
 * Le script n'écrit que le fichier JSON demandé ; jamais la base.
 *
 * Usage :
 *   tsx scripts/manques-glm.mts --dry-run
 *   tsx scripts/manques-glm.mts --json=bench/results/manques-glm-2026-11-20.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT = `${ROOT}bench/results/manques-referentiel-2026-11-15.json`;
const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";
const UA = "radar-cyber-referentiel/1.0";

/** Pause entre les appels API : la limite publique anonyme est de 7 req/s. */
const PAUSE_MS = 260;

// ---------------------------------------------------------------------------
// Aides pures (testées par apps/api/test/manques-glm.test.ts)
// ---------------------------------------------------------------------------

/** Jetons trop génériques pour départager une dénomination. */
const GENERIQUES = new Set(["de", "du", "des", "d", "l", "la", "le", "les"]);

/** Découpe en jetons minuscules sans accents, jetons courts et génériques écartés. */
export function jetons(nom: string): string[] {
	return nom
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter((j) => j.length >= 2 && !GENERIQUES.has(j));
}

/** Minuscules sans accents ni séparateurs : « NORMANDY DIESEL » → « normandydiesel ». */
export function sansSeparateurs(s: string): string {
	return s
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

/** Un nom lisible est un domaine quand il ressemble à hôte.tld (2 ou 3 lettres). */
export function estDomaine(nom: string): boolean {
	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(nom.trim()) &&
		/^[a-z]{2,3}$/i.test(nom.trim().split(".").pop() ?? "");
}

/** D'un nom lisible, retire le domaine (www. ôté) et la marque (TLD ôté). */
export function marqueEtDomaine(nomLisible: string): { marque: string; domaine: string | null } {
	const nom = nomLisible.trim();
	if (!estDomaine(nom)) return { marque: nom, domaine: null };
	const sansWww = nom.replace(/^www\./i, "");
	const morceaux = sansWww.split(".");
	return { domaine: sansWww, marque: morceaux.slice(0, -1).join(".") };
}

/** Dénomination nettoyée de ses parenthèses (usuelles), et les parenthèses comme variantes. */
export function variantesDenomination(denom: string): string[] {
	const nettoyee = denom.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
	const entreParentheses = [...denom.matchAll(/\(([^)]+)\)/g)]
		.map((m) => m[1].replace(/\s+/g, " ").trim())
		.filter((s) => s.length >= 2);
	return [...new Set([nettoyee, ...entreParentheses])].filter((s) => s.length > 0);
}

/** Validation Luhn d'un SIREN à 9 chiffres (contrôle INSEE). */
export function luhnValide(siren: string): boolean {
	if (!/^\d{9}$/.test(siren)) return false;
	let somme = 0;
	for (let i = 0; i < 9; i++) {
		let d = Number(siren[i]);
		if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
		somme += d;
	}
	return somme % 10 === 0;
}

export type SirenPilhe = { siren: string; contexte: string };

/**
 * SIREN imprimés dans un texte de page : suites de 9 chiffres (séparateurs
 * souples tolérés) validés par Luhn, à condition qu'un mot-clé d'identification
 * (siren, siret, rcs, immatricul…) apparaisse à moins de 120 caractères.
 */
export function extraireSirens(texte: string): SirenPilhe[] {
	const vus = new Map<string, string>();
	const modele = /(?<!\d)(\d{3})[ .,  -]?(\d{3})[ .,  -]?(\d{3})(?!\d)/g;
	const mots = /(?:siren|siret|rcs|immatricul)/i;
	for (const m of texte.matchAll(modele)) {
		if (m.index === undefined) continue;
		const siren = m[1] + m[2] + m[3];
		if (!luhnValide(siren) || vus.has(siren)) continue;
		const debut = Math.max(0, m.index - 120);
		const fin = Math.min(texte.length, m.index + m[0].length + 120);
		const contexte = texte.slice(debut, fin).replace(/\s+/g, " ").trim();
		if (!mots.test(contexte)) continue;
		vus.set(siren, contexte);
	}
	return [...vus].map(([siren, contexte]) => ({ siren, contexte }));
}

/**
 * Longueur du plus grand fragment d'une dénomination publié mot à mot dans un
 * texte (frontières non alphanumériques exigées) : 0 si absent. C'est la
 * corroboration par le site — la plus longue dénomination gagne, pour ne pas
 * corroborer « ISETA » quand le site dit « ISETA-ECA ».
 */
export function longueurPubliee(texte: string, denom: string): number {
	const texteN = texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
	const motif = denom
		.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
		.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
		.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("[^a-z0-9]+");
	if (!motif) return 0;
	const m = new RegExp(`(^|[^a-z0-9])${motif}($|[^a-z0-9])`).exec(texteN);
	return m ? m[0].length : 0;
}

// ---------------------------------------------------------------------------
// Candidats du registre
// ---------------------------------------------------------------------------

export type Candidat = {
	siren: string;
	denom: string;
	variantes: string[];
	etat: "A" | "C";
	ville: string | null;
	dept: string | null;
	nature: string | null;
	adresseSiege: string | null;
	siretSiege: string | null;
	extras: string[]; // jetons de la dénomination absents de la marque
	exact: boolean; // une variante égale exactement la marque
};

type ApiResultat = {
	siren?: string;
	nom_complet?: string;
	nom_raison_sociale?: string | null;
	etat_administratif?: string;
	nature_juridique?: string | null;
	siege?: {
		libelle_commune?: string | null;
		commune?: string | null;
		departement?: string | null;
		adresse?: string | null;
		siret?: string | null;
	} | null;
};

/** Nature juridique INSEE → famille d'organisation du référentiel. */
export function famille(nature: string | null): string {
	if (nature === null) return "entreprise";
	if (nature.startsWith("92")) return "association";
	if (nature.startsWith("72")) return "collectivite"; // communes, départements, EPCI
	if (/^738/.test(nature)) return "etablissement_public"; // EPSCP, EPCC
	return "entreprise"; // sociétés (5xxx) et SEM/EPL (73xx) : personnes morales de droit privé
}

export function versCandidat(r: ApiResultat, marque: string, jetonsMarque: string[]): Candidat | null {
	if (!r.siren || !/^\d{9}$/.test(r.siren)) return null;
	const denom = (r.nom_complet ?? r.nom_raison_sociale ?? "").trim();
	if (!denom) return null;
	const variantes = variantesDenomination(denom);
	const exact = variantes.some((v) => sansSeparateurs(v) === sansSeparateurs(marque));
	const denomJetons = new Set(variantes.flatMap((v) => jetons(v)));
	const extras = [...denomJetons].filter((j) => !jetonsMarque.includes(j));
	const pertinent =
		exact ||
		variantes.some((v) => sansSeparateurs(v).includes(sansSeparateurs(marque))) ||
		jetonsMarque.every((j) => denomJetons.has(j));
	if (!pertinent) return null;
	return {
		siren: r.siren,
		denom,
		variantes,
		etat: r.etat_administratif === "C" ? "C" : "A",
		ville: (r.siege?.libelle_commune ?? r.siege?.commune ?? null) || null,
		dept: r.siege?.departement ?? null,
		nature: r.nature_juridique ?? null,
		adresseSiege: r.siege?.adresse ?? null,
		siretSiege: r.siege?.siret ?? null,
		extras,
		exact,
	};
}

/** Exact d'abord, puis jetons superflus croissants, puis actifs, puis SIREN. */
export function ranger(candidats: Candidat[]): Candidat[] {
	return [...candidats].sort((a, b) =>
		Number(b.exact) - Number(a.exact) ||
		a.extras.length - b.extras.length ||
		(a.etat === "A" ? 0 : 1) - (b.etat === "A" ? 0 : 1) ||
		a.siren.localeCompare(b.siren),
	);
}

// ---------------------------------------------------------------------------
// Réseau
// ---------------------------------------------------------------------------

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, PAUSE_MS));

async function apiRecherche(requete: string, cessees: boolean): Promise<ApiResultat[]> {
	const etat = cessees ? "&etat_administratif=C" : "";
	const url = `${API_BASE}?q=${encodeURIComponent(requete)}&per_page=25${etat}`;
	const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`recherche-entreprises HTTP ${res.status} pour « ${requete} »`);
	const data = (await res.json()) as { results?: ApiResultat[] };
	return data.results ?? [];
}

async function chercher(requete: string): Promise<ApiResultat[]> {
	const actifs = await apiRecherche(requete, false);
	const cessees = await apiRecherche(requete, true);
	return [...actifs, ...cessees];
}

export type Page = {
	urlDemandee: string;
	urlFinale: string;
	statut: number | null;
	titre: string | null;
	texte: string;
	sirens: SirenPilhe[];
	echec?: string;
};

function decodageMinimal(html: string): string {
	return html
		.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
		.replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		.replace(/&#(\d+);/g, " ");
}

async function lirePage(url: string): Promise<Page> {
	const base: Page = {
		urlDemandee: url, urlFinale: url, statut: null, titre: null, texte: "", sirens: [],
	};
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": UA, Accept: "text/html" },
			redirect: "follow",
			signal: AbortSignal.timeout(15_000),
		});
		const html = await res.text();
		const titre = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? null;
		const texte = decodageMinimal(
			html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
				.replace(/<[^>]+>/g, " "),
		).replace(/\s+/g, " ");
		return {
			...base,
			urlFinale: res.url || url,
			statut: res.status,
			titre,
			texte,
			sirens: extraireSirens(texte),
		};
	} catch (e) {
		return { ...base, echec: `site inaccessible (${String(e).slice(0, 90)})` };
	}
}

/** Page d'accueil, puis page mentions légales si aucun SIREN publié. */
async function sonderSite(domaine: string): Promise<{ accueil: Page; mentions: Page | null }> {
	const accueil = await lirePage(`https://${domaine}/`);
	if (accueil.sirens.length > 0 || accueil.echec) return { accueil, mentions: null };
	const mentions = await lirePage(`https://${domaine}/mentions-legales`);
	return { accueil, mentions: mentions.sirens.length > 0 ? mentions : null };
}

// ---------------------------------------------------------------------------
// Décision
// ---------------------------------------------------------------------------

export type Indices = {
	candidatsRanges: Candidat[];
	sirenPublie: { siren: string; contexte: string; url: string } | null;
	corroborees: Set<string>; // SIREN dont la dénomination est publiée sur le site du domaine
	siteVivant: boolean;
	domaine: string | null;
};

export type Verdict = {
	resolu: boolean;
	confiance: "haute" | "moyenne" | "faible" | null;
	candidat: Candidat | null;
	raison: string;
};

/**
 * Ordre des preuves : SIREN publié par le site > dénomination la plus longue
 * publiée sur le site du domaine > égalité exacte au registre > dénomination à
 * un jeton près. Homonymes multiples sans preuve de site : non résolu,
 * arbitrage humain — jamais un tirage au sort.
 */
export function trancher(i: Indices): Verdict {
	if (i.sirenPublie) {
		const c = i.candidatsRanges.find((x) => x.siren === i.sirenPublie!.siren) ?? null;
		return {
			resolu: true, confiance: "haute", candidat: c,
			raison: `SIREN publié par le site (${i.sirenPublie.contexte.slice(0, 140)}) et confirmé au registre`,
		};
	}
	if (i.corroborees.size > 0) {
		const confirms = i.candidatsRanges.filter((c) => i.corroborees.has(c.siren));
		const exacts = confirms.filter((c) => c.exact);
		if (exacts.length > 1) {
			return {
				resolu: false, confiance: null, candidat: null,
				raison: `homonymes exacts corroborés par le site : ${exacts.map((c) => c.siren).join(", ")} — arbitrage humain requis`,
			};
		}
		const c = (exacts[0] ?? confirms[0]) ?? null;
		return {
			resolu: true, confiance: "haute", candidat: c,
			raison: "dénomination publiée sur le site du domaine de la revendication, confirmée au registre",
		};
	}
	const exacts = i.candidatsRanges.filter((c) => c.exact);
	if (exacts.length === 1) {
		const c = exacts[0];
		return {
			resolu: true, confiance: "moyenne", candidat: c,
			raison: i.domaine
				? `dénomination exacte au registre ; site ${i.siteVivant ? "vivant" : "mort ou en parking"} sans dénomination ni SIREN publiés — la marque coïncide avec le domaine`
				: "dénomination exacte et unique au registre ; la revendication ne porte pas de domaine",
		};
	}
	if (exacts.length > 1) {
		return {
			resolu: false, confiance: null, candidat: null,
			raison: `homonymes exacts au registre : ${exacts.map((c) => `${c.siren} (${c.ville ?? "?"})`).join(", ")} — arbitrage humain requis`,
		};
	}
	const proches = i.candidatsRanges.filter((c) => c.extras.length === 1);
	if (proches.length === 1) {
		const c = proches[0];
		return {
			resolu: true, confiance: "faible", candidat: c,
			raison: `dénomination à un jeton près (jeton superflu : ${c.extras[0]}) — à revoir avant chargement`,
		};
	}
	if (proches.length > 1) {
		return {
			resolu: false, confiance: null, candidat: null,
			raison: `${proches.length} dénominations à un jeton près : ${proches.map((c) => c.siren).join(", ")} — arbitrage humain requis`,
		};
	}
	return {
		resolu: false, confiance: null, candidat: null,
		raison: i.candidatsRanges.length === 0
			? "aucune entité correspondante au registre (actifs et cessés)"
			: `dénominations trop éloignées (${i.candidatsRanges.length} candidates non retenues) — non résolu`,
	};
}

// ---------------------------------------------------------------------------
// Déroulé principal
// ---------------------------------------------------------------------------

type Manque = {
	nom: string;
	occurrences: number;
	zone: string;
	nomLisible: string;
	provenance: string;
	sources: number;
	premiereVue: string;
	derniereVue: string;
	familles: string[];
	voie: string;
};

type Traite = Manque & {
	resolu: boolean;
	confiance: "haute" | "moyenne" | "faible" | null;
	siren: string | null;
	siretSiege: string | null;
	denominationLegale: string | null;
	ville: string | null;
	departement: string | null;
	natureJuridique: string | null;
	typeOrganisation: string | null;
	etatAdministratif: "A" | "C" | null;
	adresseSiege: string | null;
	raison: string;
	requetes: string[];
	preuves: { voie: string; url: string; extrait: string; dateConsultation: string }[];
};

/** Requêtes vers le registre : marque telle quelle, puis découpages d'un bloc collé. */
export function requetesPour(marque: string): string[] {
	const requetes = [marque];
	if (!marque.includes(" ") && marque.length >= 6 && marque.length <= 28) {
		for (let i = 3; i < marque.length - 2; i++) requetes.push(`${marque.slice(0, i)} ${marque.slice(i)}`);
	}
	return requetes;
}

async function traiter(m: Manque, aujourdhui: string): Promise<Traite> {
	const { marque, domaine } = marqueEtDomaine(m.nomLisible);
	const jetonsMarque = jetons(marque);

	// 1. Le registre : requête principale, puis découpages si rien de pertinent.
	const candidats: Candidat[] = [];
	const requetesUtilisees = [marque];
	const pousser = (bruts: ApiResultat[]): number => {
		let ajout = 0;
		for (const r of bruts) {
			const c = versCandidat(r, marque, jetonsMarque);
			if (c) { candidats.push(c); ajout++; }
		}
		return ajout;
	};
	pousser(await chercher(marque));
	if (candidats.length === 0) {
		for (const rq of requetesPour(marque).slice(1)) {
			const ajout = pousser(await chercher(rq));
			requetesUtilisees.push(rq);
			if (ajout > 0) break;
		}
	}

	// 2. Le site du domaine, quand la revendication en porte un.
	const site = domaine ? await sonderSite(domaine) : null;
	const pages = site ? [site.accueil, site.mentions].filter((p): p is Page => p !== null) : [];

	// 3. SIREN publié par le site, recoupé avec le registre (actifs et cessés).
	let sirenPublie: { siren: string; contexte: string; url: string } | null = null;
	for (const page of pages) {
		for (const p of page.sirens) {
			const confirmes = await chercher(p.siren);
			if (!confirmes.some((r) => r.siren === p.siren)) continue;
			pousser(confirmes);
			sirenPublie = { siren: p.siren, contexte: p.contexte, url: page.urlFinale };
			break;
		}
		if (sirenPublie) break;
	}

	const ranges = ranger(dedup(candidats));

	// 4. Dénomination la plus longue publiée sur le site du domaine.
	const corroborees = new Set<string>();
	if (site && !site.accueil.echec) {
		const longueurs = ranges.map((c) => ({ siren: c.siren, len: Math.max(0, ...c.variantes.map((v) => longueurPubliee(site!.accueil.texte, v))) }));
		const max = Math.max(0, ...longueurs.map((x) => x.len));
		if (max >= 4) {
			for (const x of longueurs) if (x.len === max) corroborees.add(x.siren);
		}
	}

	// 5. Verdict.
	const verdict = trancher({
		candidatsRanges: ranges,
		sirenPublie,
		corroborees,
		siteVivant: !!(site && site.accueil.statut && site.accueil.statut < 400 && !site.accueil.echec),
		domaine,
	});

	// 6. Preuves : URL + extrait verbatim + date de consultation, sans exception.
	const preuves: Traite["preuves"] = [];
	if (sirenPublie) {
		preuves.push({
			voie: "site-entite",
			url: sirenPublie.url,
			extrait: sirenPublie.contexte,
			dateConsultation: aujourdhui,
		});
	} else if (site) {
		const p = site.accueil;
		const autour = p.echec
			? null
			: extraitAutour(p.texte, new RegExp(échapperRe(marque), "i"));
		preuves.push({
			voie: "site-entite",
			url: p.urlFinale,
			extrait: p.echec
				? p.echec
				: `HTTP ${p.statut}, titre « ${p.titre ?? "?"} » — ${autour ? `extrait : « ${autour} »` : "marque absente du texte"}`,
			dateConsultation: aujourdhui,
		});
	}
	preuves.push({
		voie: "registre-sirene",
		url: `${API_BASE}?q=${encodeURIComponent(sirenPublie?.siren ?? marque)}`,
		extrait: ranges.length > 0
			? ranges.map((c) => `${c.siren} ${c.denom} (${c.etat === "A" ? "actif" : "cessé"}, ${c.ville ?? "?"})`).join(" ; ").slice(0, 400)
			: `aucun résultat pertinent pour « ${marque} » (actifs et cessés)`,
		dateConsultation: aujourdhui,
	});

	const c = verdict.candidat;
	return {
		...m,
		resolu: verdict.resolu,
		confiance: verdict.confiance,
		siren: c?.siren ?? null,
		siretSiege: c?.siretSiege ?? null,
		denominationLegale: c?.denom ?? null,
		ville: c?.ville ?? null,
		departement: c?.dept ?? null,
		natureJuridique: c?.nature ?? null,
		typeOrganisation: c ? famille(c.nature) : null,
		etatAdministratif: c?.etat ?? null,
		adresseSiege: c?.adresseSiege ?? null,
		raison: verdict.raison,
		requetes: requetesUtilisees,
		preuves,
	};
}

function échapperRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extraitAutour(texte: string, motif: RegExp): string | null {
	const m = motif.exec(texte);
	if (!m || m.index === undefined) return null;
	const debut = Math.max(0, m.index - 80);
	const fin = Math.min(texte.length, m.index + m[0].length + 80);
	return texte.slice(debut, fin).replace(/\s+/g, " ").trim();
}

function dedup(candidats: Candidat[]): Candidat[] {
	const vus = new Map<string, Candidat>();
	for (const c of candidats) if (!vus.has(c.siren)) vus.set(c.siren, c);
	return [...vus.values()];
}

async function main(): Promise<void> {
	const dryRun = process.argv.includes("--dry-run");
	const jsonArg = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1]
		?? `${ROOT}bench/results/manques-glm-${new Date().toISOString().slice(0, 10)}.json`;
	const aujourdhui = new Date().toISOString().slice(0, 10);

	const brut = JSON.parse(readFileSync(INPUT, "utf8")) as { date: string; manques: Manque[] };
	const france = brut.manques.filter((m) => m.zone === "france");
	const cible = france.slice(0, 10);
	console.log(`cohorte « france » du ${brut.date} : ${france.length} entités, traitement des ${cible.length} premières\n`);

	const traitees: Traite[] = [];
	for (const [k, m] of cible.entries()) {
		const t = await traiter(m, aujourdhui);
		traitees.push(t);
		console.log(
			`${k + 1}/${cible.length} ${m.nomLisible} → ${t.resolu ? `RÉSOLU (${t.confiance}) ${t.siren} ${t.denominationLegale}` : "non résolu"}\n    ${t.raison}`,
		);
	}

	const resolues = traitees.filter((t) => t.resolu);
	console.log(`\n== Bilan : ${resolues.length}/${cible.length} résolues ==`);
	for (const niv of ["haute", "moyenne", "faible"] as const) {
		const n = resolues.filter((t) => t.confiance === niv).length;
		if (n > 0) console.log(`  ${niv} : ${n}`);
	}
	for (const t of traitees.filter((x) => !x.resolu)) console.log(`  non résolue : ${t.nomLisible} — ${t.raison}`);

	if (dryRun) { console.log("\ndry-run : rien écrit"); return; }
	const sortie = {
		date: aujourdhui,
		source: "bench/results/manques-referentiel-2026-11-15.json",
		methode: "registre SIRENE (recherche-entreprises.api.gouv.fr, sans clé) + lecture du site de l'entité quand la revendication porte un domaine ; SIREN jamais inventé, recoupé avec le registre ; entités cessées cherchées aussi",
		confiances: "haute = SIREN/RCS ou dénomination publiés par le site de l'entité ; moyenne = dénomination exacte au registre ; faible = à un jeton près, à revoir avant chargement",
		cohorte: { zone: "france", total: france.length, traitees: cible.length },
		resolution: {
			resolues: resolues.length,
			taux: `${resolues.length}/${cible.length}`,
			parConfiance: {
				haute: resolues.filter((t) => t.confiance === "haute").length,
				moyenne: resolues.filter((t) => t.confiance === "moyenne").length,
				faible: resolues.filter((t) => t.confiance === "faible").length,
			},
			nonResolues: traitees.filter((t) => !t.resolu).map((t) => t.nomLisible),
		},
		manques: traitees,
	};
	writeFileSync(jsonArg, `${JSON.stringify(sortie, null, 2)}\n`);
	console.log(`\nécrit : ${jsonArg}`);
}

// Lancée en direct seulement : importable par les tests sans effet de bord.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => { console.error(e); process.exitCode = 1; });
}
