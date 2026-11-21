/**
 * S1.2/S1.3 — collecte de preuves et enregistrement des verdicts, vague
 * précision. Deux sous-commandes, séparées exprès :
 *
 *   --collecter   Pour chaque entrée du corpus dans la plage demandée, va
 *                 chercher les deux canaux de preuve du plan et les range
 *                 dans le champ `preuve` de l'entrée. Ce script ne décide
 *                 RIEN : il rend la vérification auditable.
 *
 *                 1. registre — recherche-entreprises.api.gouv.fr interrogé
 *                    sur le SIREN de l'organisation proposée (requête + réponse
 *                    consignées). Sans SIREN, ou si le registre ne connaît pas
 *                    le SIREN, c'est consigné tel quel : l'absence de réponse
 *                    est aussi une preuve.
 *                 2. site — le domaine cité par l'indice (ce que le texte
 *                    désigne) et, s'il existe, le site du référentiel (ce que
 *                    l'organisation prétend être). URL finale + extrait
 *                    verbatim (titre, og:site_name, description, début du
 *                    texte visible).
 *
 *   --verdicts=<fichier>  Fusionne mes verdicts manuels — un JSON d'objets
 *                 { ordre, verdict, motif } — dans le corpus : chaque slot
 *                 `verdict` reçoit { verdict, motif, registre, site, le } où
 *                 registre/site sont la preuve déjà collectée. Refuse de
 *                 poser un verdict sans preuve collectée pour cette entrée
 *                 (sauf `--admettre-sans-site` pour les cas où les deux canaux
 *                 ont échoué et que le registre seul tranche — il faut alors
 *                 que la preuve registre existe).
 *
 * Verdicts (définitions figées de la vague) : exacte | partielle |
 * hors_sujet | indecidable. Un verdict circulaire (deux noms comparés par un
 * script) est interdit : la comparaison des noms se fait à la main, ici, sur
 * les extraits.
 *
 * Rejouer :
 *
 *   tsx scripts/precision-verifier.mts --corpus=bench/precision/corpus-v1.json \
 *     --collecter --de=1 --a=50
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const CORPUS = option("corpus") ?? "bench/precision/corpus-v1.json";
const MODE_COLLECTE = argv.includes("--collecter");
const FICHIER_VERDICTS = option("verdicts");
const DE = Number(option("de") ?? 1);
const A = Number(option("a") ?? Number.MAX_SAFE_INTEGER);
const CONCURRENCE = Number(option("concurrence") ?? 4);
const ADMETTRE_SANS_SITE = argv.includes("--admettre-sans-site");

type PreuveRegistre = {
	requete: string;
	statutHttp: number | null;
	reponse: string;
} | null;

type PreuveSite = {
	url: string;
	demande: string;
	statutHttp: number | null;
	erreur: string | null;
	titre: string | null;
	nomSite: string | null;
	description: string | null;
	extrait: string;
} | null;

type Preuve = {
	registre: PreuveRegistre;
	siteIndice: PreuveSite;
	siteOrg: PreuveSite;
	le: string;
};

type Entree = {
	ordre: number;
	indice: string;
	indiceNorm: string;
	domaineIndice: string | null;
	source: string;
	sourceUrl: string;
	groupe: string | null;
	status: string;
	confiance: number;
	via: string;
	type: string;
	strate: string;
	org: {
		id: number;
		name: string;
		kind: string;
		city: string | null;
		dept: string | null;
		website: string | null;
		domain: string | null;
		siren: string | null;
		naf: string | null;
		obsolete?: boolean;
	};
	preuve?: Preuve | null;
	verdict?: null | Record<string, unknown>;
};

type Corpus = {
	etapes?: Record<string, unknown>;
	protocole?: Record<string, unknown>;
	entrees: Entree[];
};

const HORODATE = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z");

// ── Fetch HTTP borné ─────────────────────────────────────────────────────

const TAILLE_MAX = 300_000; // 300 Ko suffisent : titre + début du texte
const DELAI_MS = 8000;

/** Décodage des entités HTML les plus courantes, sans dépendance. */
function decoderEntites(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&eacute;/g, "é")
		.replace(/&egrave;/g, "è")
		.replace(/&agrave;/g, "à")
		.replace(/&ccedil;/g, "ç")
		.replace(/&#(\d+);/g, (_m, d: string) => {
			const code = Number(d);
			return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
		});
}

/** Texte visible : scripts et styles retirés, balises retirées, espaces réduits. */
function texteVisible(html: string): string {
	return decoderEntites(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim();
}

function attributMeta(html: string, cle: string): string | null {
	const re = new RegExp(
		`<meta[^>]+(?:content=["']([^"']*)["'][^>]*(?:property|name)=["']${cle}["']|(?:property|name)=["']${cle}["'][^>]*content=["']([^"']*)["'])`,
		"i",
	);
	const m = html.match(re);
	if (!m) return null;
	const brut = (m[1] ?? m[2] ?? "").trim();
	return brut === "" ? null : decoderEntites(brut).slice(0, 300);
}

async function fetchSite(url: string): Promise<PreuveSite> {
	const essais: string[] = [url];
	if (url.startsWith("https://")) essais.push(url.replace("https://", "http://"));
	for (const essai of essais) {
		const controleur = new AbortController();
		const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
		try {
			const reponse = await fetch(essai, {
				signal: controleur.signal,
				redirect: "follow",
				headers: {
					"user-agent": "Mozilla/5.0 (compatible; radar-precision-campaign/1.0; verification bot)",
					accept: "text/html,application/xhtml+xml,*/*;q=0.5",
					"accept-language": "fr,en;q=0.5",
				},
			});
			const texte = (await reponse.text()).slice(0, TAILLE_MAX);
			const titreBrut = texte.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
			const extrait = texteVisible(texte).slice(0, 600);
			clearTimeout(minuteur);
			return {
				url: reponse.url,
				demande: essai,
				statutHttp: reponse.status,
				erreur: null,
				titre: titreBrut ? decoderEntites(titreBrut.replace(/\s+/g, " ").trim()).slice(0, 200) : null,
				nomSite: attributMeta(texte, "og:site_name"),
				description: attributMeta(texte, "description"),
				extrait,
			};
		} catch (e) {
			clearTimeout(minuteur);
			const message = e instanceof Error ? e.message : String(e);
			// Dernier essai : consigner l'échec, c'est aussi une preuve.
			if (essai === essais[essais.length - 1]) {
				return {
					url: essai,
					demande: essai,
					statutHttp: null,
					erreur: message.slice(0, 200),
					titre: null,
					nomSite: null,
					description: null,
					extrait: "",
				};
			}
		}
	}
	return null;
}

// ── Registre ─────────────────────────────────────────────────────────────

/** Résumé d'une réponse du registre, borné : ce qu'il faut pour juger une
 * identité (dénomination, état, siège, activité) — pas le JSON entier. */
function resumerRegistre(json: { results?: Array<Record<string, unknown>>; total_results?: number }): string {
	const resultats = json.results ?? [];
	const total = json.total_results ?? resultats.length;
	const premier = resultats[0];
	if (!premier) return JSON.stringify({ total });
	const siege = (premier.siege ?? {}) as Record<string, unknown>;
	const resume = {
		total,
		siren: premier.siren,
		nomComplet: premier.nom_complet,
		sigle: premier.sigle ?? null,
		etatAdministratif: (premier.etat_administratif as Record<string, unknown>)?.value ?? premier.etat_administratif,
		communeSiege: siege.libelle_commune ?? null,
		cpSiege: siege.code_postal ?? null,
		activitePrincipale: (premier.activite_principale as Record<string, unknown>)?.libelle ?? null,
		trancheEffectif: premier.tranche_effectif_salarie ?? null,
	};
	return JSON.stringify(resume).slice(0, 1200);
}

const REGISTRE_BASE = "https://recherche-entreprises.api.gouv.fr";

/** Le registre public plafonne le débit ; on reste sous ~3 req/s et on
 * reprend sur 429 avec un délai croissant. */
async function interrogeregistre(siren: string): Promise<PreuveRegistre> {
	const requete = `${REGISTRE_BASE}/search?q=${encodeURIComponent(siren.replace(/\s/g, ""))}&per_page=1&page=1`;
	for (let essai = 0; essai < 3; essai++) {
		if (essai > 0) await new Promise((r) => setTimeout(r, 1200 * essai));
		const controleur = new AbortController();
		const minuteur = setTimeout(() => controleur.abort(), 15000);
		try {
			const reponse = await fetch(requete, {
				signal: controleur.signal,
				headers: { accept: "application/json", "user-agent": "radar-precision-campaign/1.0 (verification)" },
			});
			const texte = await reponse.text();
			clearTimeout(minuteur);
			if (reponse.status === 429) continue; // débit dépassé : reprendre
			let reponseResumee: string;
			try {
				reponseResumee = resumerRegistre(
					JSON.parse(texte) as { results?: Array<Record<string, unknown>>; total_results?: number },
				);
			} catch {
				reponseResumee = texte.slice(0, 400);
			}
			return { requete, statutHttp: reponse.status, reponse: reponseResumee };
		} catch (e) {
			clearTimeout(minuteur);
			const message = e instanceof Error ? e.message : String(e);
			if (essai === 2) {
				return { requete, statutHttp: null, reponse: `erreur : ${message.slice(0, 200)}` };
			}
		}
	}
	return { requete, statutHttp: null, reponse: "erreur : trois essais échoués" };
}

// ── Collecte ─────────────────────────────────────────────────────────────

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as Corpus;

if (MODE_COLLECTE) {
	const cibles = corpus.entrees.filter(
		(e) => e.ordre >= DE && e.ordre <= A && e.preuve === undefined,
	);
	console.log(`Collecte de preuves pour ${cibles.length} entrées (ordre ${DE}–${A})…`);
	let fait = 0;
	const file = [...cibles];
	const ouvriers = Array.from({ length: Math.min(CONCURRENCE, Math.max(1, file.length)) }, async () => {
		while (true) {
			const entree = file.shift();
			if (!entree) return;
			// Canal 1 — le registre sur l'organisation proposée.
			const registre = entree.org.siren
				? await interrogeregistre(entree.org.siren)
				: null;
			// Petit délai : on reste sous le débit plafonné du registre.
			await new Promise((r) => setTimeout(r, 350));
			// Canal 2 — ce que le texte désigne (domaine cité) et ce que le
			// référentiel prétend être (site de l'organisation).
			const siteIndice = entree.domaineIndice
				? await fetchSite(`https://${entree.domaineIndice}`)
				: null;
			const siteOrg = entree.org.website ? await fetchSite(entree.org.website) : null;
			entree.preuve = { registre, siteIndice, siteOrg, le: HORODATE() };
			fait++;
			if (fait % 10 === 0) console.log(`  ${fait}/${cibles.length}`);
		}
	});
	await Promise.all(ouvriers);
	writeFileSync(CORPUS, JSON.stringify(corpus, null, "\t") + "\n");
	console.log(`Preuves écrites dans ${CORPUS}`);
}

// ── Verdicts manuels ─────────────────────────────────────────────────────

if (FICHIER_VERDICTS) {
	const propositions = JSON.parse(readFileSync(FICHIER_VERDICTS, "utf8")) as Array<{
		ordre: number;
		verdict: string;
		motif: string;
	}>;
	const parOrdre = new Map(propositions.map((p) => [p.ordre, p]));
	let posees = 0;
	for (const entree of corpus.entrees) {
		const p = parOrdre.get(entree.ordre);
		if (!p) continue;
		if (!["exacte", "partielle", "hors_sujet", "indecidable"].includes(p.verdict)) {
			throw new Error(`verdict inconnu pour l'entrée ${entree.ordre} : ${p.verdict}`);
		}
		const registre = entree.preuve?.registre ?? null;
		const siteIndice = entree.preuve?.siteIndice ?? null;
		const siteOrg = entree.preuve?.siteOrg ?? null;
		if (registre === null && siteIndice === null && siteOrg === null && !ADMETTRE_SANS_SITE) {
			throw new Error(
				`entrée ${entree.ordre} : aucune preuve collectée — un verdict sans preuve n'existe pas (lancez --collecter d'abord)`,
			);
		}
		entree.verdict = {
			verdict: p.verdict,
			motif: p.motif,
			registre,
			siteIndice,
			siteOrg,
			le: HORODATE(),
		};
		posees++;
	}
	writeFileSync(CORPUS, JSON.stringify(corpus, null, "\t") + "\n");
	console.log(`Verdicts posés : ${posees} (source : ${FICHIER_VERDICTS})`);
}

// ── Dossiers compacts pour la lecture humaine des preuves ────────────────

if (argv.includes("--dossier")) {
	for (const e of corpus.entrees) {
		if (e.ordre < DE || e.ordre > A) continue;
		const verdictActuel = e.verdict && typeof e.verdict === "object" ? (e.verdict.verdict as string) : "…";
		console.log(`#${e.ordre} [${e.strate}] ${e.confiance} · verdict: ${verdictActuel}`);
		console.log(`  indice: ${JSON.stringify(e.indice)} · groupe: ${e.groupe ?? "?"} · source: ${e.source}`);
		console.log(
			`  org(#${e.org.id}): ${e.org.name} | siren ${e.org.siren ?? "—"} | ${e.org.kind} | ${e.org.city ?? "?"} (${e.org.dept ?? "?"}) | NAF ${e.org.naf ?? "—"}${e.org.obsolete ? " | OBSOLÈTE" : ""} | site: ${e.org.website ?? e.org.domain ?? "—"}`,
		);
		const registre = e.preuve?.registre ?? null;
		console.log(`  registre: ${registre ? registre.reponse : "non interrogé (pas de SIREN)"}`);
		const si = e.preuve?.siteIndice ?? null;
		console.log(
			`  siteIndice: ${si ? `${si.statutHttp ?? si.erreur} ${si.url} | titre: ${si.titre ?? "—"} | site: ${si.nomSite ?? "—"} | ${si.extrait.slice(0, 260)}` : "pas de domaine dans l'indice"}`,
		);
		const so = e.preuve?.siteOrg ?? null;
		console.log(
			`  siteOrg: ${so ? `${so.statutHttp ?? so.erreur} ${so.url} | titre: ${so.titre ?? "—"} | site: ${so.nomSite ?? "—"} | ${so.extrait.slice(0, 200)}` : "—"}`,
		);
	}
} else if (argv.includes("--stats")) {
	const compteur = new Map<string, number>();
	let verdicts = 0;
	let avecPreuve = 0;
	for (const e of corpus.entrees) {
		if (e.preuve) avecPreuve++;
		const v = e.verdict && typeof e.verdict === "object" ? (e.verdict.verdict as string) : null;
		if (v !== null) {
			verdicts++;
			compteur.set(v, (compteur.get(v) ?? 0) + 1);
		}
	}
	console.log(`entrées: ${corpus.entrees.length} · avec preuve: ${avecPreuve} · verdicts posés: ${verdicts}`);
	for (const [v, n] of [...compteur.entries()].sort()) console.log(`  ${v}: ${n}`);
}

await closePools();