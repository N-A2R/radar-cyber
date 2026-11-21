/**
 * Précision des rattachements DÉJÀ EN BASE — échantillon de 100 liens
 * `event.org_id` vérifiés à la main par recoupement de sources.
 *
 * Ce script ne juge rien tout seul : il tire un échantillon déterministe,
 * rassemble les preuves (événement, organisation, journal de rattachement,
 * registre des entreprises, sites cités), puis n'imprime un taux que lorsque
 * les 100 verdicts manuels sont renseignés dans le fichier de verdicts.
 * Comparer deux noms par programme serait circulaire : le verdict est posé
 * par une personne sur les extraits, jamais déduit d'un score.
 *
 * Commandes (depuis la racine du dépôt) :
 *
 *   tsx scripts/precision-rattachement.mts                 # tirage si besoin + rapport
 *   tsx scripts/precision-rattachement.mts --web            # collecte registre/sites
 *   tsx scripts/precision-rattachement.mts --dossier        # preuves, lecture humaine
 *   tsx scripts/precision-rattachement.mts --stats          # état d'avancement
 *
 * Fichiers :
 *   bench/precision/rattachements-echantillon.json  — tirage + preuves + verdicts
 *   bench/precision/rattachements-verdicts.json     — verdicts manuels (entrée)
 *   docs/precision-rattachement.md                  — rapport généré
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const ECHANTILLON = option("echantillon") ?? "bench/precision/rattachements-echantillon.json";
const VERDICTS = option("verdicts") ?? "bench/precision/rattachements-verdicts.json";
const RAPPORT = option("rapport") ?? "docs/precision-rattachement.md";
const GRAINE = Number(option("graine") ?? 20261121);
const TAILLE = Number(option("taille") ?? 100);
const CONCURRENCE = Number(option("concurrence") ?? 4);
const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

const VERDICTS_ADMIS = ["exacte", "partielle", "hors_sujet", "indecidable"] as const;
type Verdict = (typeof VERDICTS_ADMIS)[number];

type PreuveRegistre = { requete: string; statutHttp: number | null; reponse: string } | null;
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
	siteVictime: PreuveSite;
	siteOrg: PreuveSite;
	le: string;
};

type Provenance = {
	motif: string | null;
	alias: string | null;
	moteur: string | null;
	journal: string | null;
};

type Entree = {
	ordre: number;
	eventId: string;
	dedupKey: string;
	titre: string | null;
	resume: string | null;
	sourceId: string | null;
	sourceNom: string | null;
	sourceUrl: string | null;
	observedAt: string | null;
	description: string | null;
	domaineVictime: string | null;
	org: {
		id: number;
		name: string;
		kind: string | null;
		city: string | null;
		dept: string | null;
		domain: string | null;
		website: string | null;
		siren: string | null;
		entityCode: string | null;
		entitySource: string | null;
		createdAt: string | null;
	};
	provenance: Provenance[];
	preuve?: Preuve | null;
	verdict?: {
		verdict: Verdict;
		motif: string;
		sources: string[];
		instructif?: boolean;
		rang?: number;
		le: string;
	} | null;
};

type Echantillon = {
	protocole: {
		question: string;
		date: string;
		population: string;
		effectifPopulation: number;
		taille: number;
		graine: string;
		methode: string;
		sources: string[];
		definitions: string;
	};
	entrees: Entree[];
};

const maintenant = (): string => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** PRNG mulberry32 : tirage reproductible, graine consignée dans le fichier. */
function mulberry32(graine: number): () => number {
	let a = graine >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Mélange de Fisher-Yates sur place. */
function melanger<T>(liste: T[], prochain: () => number): T[] {
	for (let i = liste.length - 1; i > 0; i--) {
		const j = Math.floor(prochain() * (i + 1));
		[liste[i], liste[j]] = [liste[j]!, liste[i]!];
	}
	return liste;
}

type LigneLien = {
	id: string;
	dedup_key: string;
	title: string | null;
	summary: string | null;
	source_id: string | null;
	source_url: string | null;
	observed_at: string | null;
	evidence: Record<string, unknown> | null;
	org_id: number;
	org_name: string;
	org_kind: string | null;
	org_city: string | null;
	org_dept: string | null;
	org_domain: string | null;
	org_website: string | null;
	org_siren: string | null;
	entity_code: string | null;
	entity_source: string | null;
	org_created_at: string | null;
	source_nom: string | null;
};

/** Domaines cités par un texte (le titre ou la description de la revendication). */
function domainesTexte(...textes: Array<string | null>): string[] {
	const vus = new Set<string>();
	for (const texte of textes) {
		if (!texte) continue;
		for (const m of texte.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,12}\b/gi)) {
			const d = m[0].toLowerCase().replace(/^www\./, "");
			if (d.includes(".")) vus.add(d);
		}
	}
	return [...vus];
}

/** Tirage des liens existants, avec les preuves internes (base + journal). */
async function tirerEchantillon(): Promise<Echantillon> {
	const { rows } = await query<LigneLien>(`
		SELECT e.id::text, e.dedup_key, e.title, e.summary, e.source_id, e.source_url,
		       e.observed_at::text, e.evidence,
		       o.id AS org_id, o.name AS org_name, o.kind AS org_kind, o.city AS org_city,
		       o.dept AS org_dept, o.domain AS org_domain, o.website AS org_website,
		       o.siren AS org_siren, o.entity_code, o.entity_source, o.created_at::text AS org_created_at,
		       s.name AS source_nom
		  FROM event e
		  JOIN org o ON o.id = e.org_id
		  LEFT JOIN source s ON s.id = e.source_id
		 ORDER BY e.id
	`);
	if (rows.length < TAILLE) {
		throw new Error(`${rows.length} rattachements en base : moins que les ${TAILLE} demandés`);
	}
	const tirage = melanger([...rows], mulberry32(GRAINE)).slice(0, TAILLE);
	tirage.sort((a, b) => Number(a.id) - Number(b.id));

	// Le journal porte l'alias et le motif qui ont posé chaque lien : c'est une
	// source à part entière, distincte du texte de l'événement.
	const clefs = [...new Set(tirage.map((r) => r.dedup_key))];
	const { rows: journaux } = await query<{
		subject: string;
		summary: string | null;
		payload: Record<string, unknown> | null;
	}>(`SELECT subject, summary, payload FROM journal WHERE subject = ANY($1::text[]) ORDER BY id`, [clefs]);
	const parClef = new Map<string, typeof journaux>();
	for (const j of journaux) {
		const liste = parClef.get(j.subject) ?? [];
		liste.push(j);
		parClef.set(j.subject, liste);
	}

	const entrees: Entree[] = tirage.map((r, i) => {
		const evidence = r.evidence ?? {};
		const description =
			typeof evidence.description === "string"
				? evidence.description
				: typeof evidence.texte === "string"
					? evidence.texte
					: null;
		const domaines = domainesTexte(r.title, description, r.summary);
		const provenance = (parClef.get(r.dedup_key) ?? []).map((j) => ({
			motif: typeof j.payload?.motif === "string" ? j.payload.motif : null,
			alias: typeof j.payload?.alias === "string" ? j.payload.alias : null,
			moteur: typeof j.payload?.moteur === "string" ? j.payload.moteur : null,
			journal: j.summary,
		}));
		return {
			ordre: i + 1,
			eventId: r.id,
			dedupKey: r.dedup_key,
			titre: r.title,
			resume: r.summary,
			sourceId: r.source_id,
			sourceNom: r.source_nom,
			sourceUrl: r.source_url,
			observedAt: r.observed_at,
			description,
			domaineVictime: domaines[0] ?? r.org_domain,
			org: {
				id: r.org_id,
				name: r.org_name,
				kind: r.org_kind,
				city: r.org_city,
				dept: r.org_dept,
				domain: r.org_domain,
				website: r.org_website,
				siren: r.org_siren,
				entityCode: r.entity_code,
				entitySource: r.entity_source,
				createdAt: r.org_created_at,
			},
			provenance,
			preuve: null,
			verdict: null,
		};
	});

	return {
		protocole: {
			question: "Parmi 100 rattachements déjà posés en base (event.org_id), combien sont justes ?",
			date: AUJOURDHUI,
			population: "tous les événements de event portant un org_id non nul",
			effectifPopulation: rows.length,
			taille: TAILLE,
			graine: String(GRAINE),
			methode: "tirage aléatoire sans remplacement (mulberry32, graine consignée), tri par id pour l'affichage",
			sources: [
				"événement (titre, résumé, evidence, source_url)",
				"table source (flux d'origine)",
				"journal (alias, motif, moteur ayant posé le lien)",
				"table org (nom, domaine, SIREN, commune)",
				"registre public recherche-entreprises.api.gouv.fr",
				"site cité par l'événement (domaine du titre ou de la description, article relié) et site de l'organisation",
			],
			definitions:
				"exacte = l'org désignée est celle que le texte vise ; partielle = bonne enseigne/groupe, mauvaise entité ; hors_sujet = aucune relation réelle ; indecidable = les sources ne tranchent pas. Précision = (exacte + partielle/2) / (exacte + partielle + hors_sujet), indécidables hors dénominateur.",
		},
		entrees,
	};
}

// ── Preuves externes (registre + sites) ──────────────────────────────────

const REGISTRE_BASE = "https://recherche-entreprises.api.gouv.fr";
const TAILLE_MAX = 300_000;
const DELAI_MS = 8000;

function decoderEntites(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_m, d: string) => {
			const code = Number(d);
			return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
		});
}

function texteVisible(html: string): string {
	return decoderEntites(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
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
	const essais = [url];
	if (url.startsWith("https://")) essais.push(url.replace("https://", "http://"));
	for (const essai of essais) {
		const controleur = new AbortController();
		const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
		try {
			const reponse = await fetch(essai, {
				signal: controleur.signal,
				redirect: "follow",
				headers: {
					"user-agent": "Mozilla/5.0 (compatible; radar-precision-rattachement/1.0)",
					accept: "text/html,application/xhtml+xml,*/*;q=0.5",
					"accept-language": "fr,en;q=0.5",
				},
			});
			const texte = (await reponse.text()).slice(0, TAILLE_MAX);
			const titre = texte.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
			clearTimeout(minuteur);
			return {
				url: reponse.url,
				demande: essai,
				statutHttp: reponse.status,
				erreur: null,
				titre: titre ? decoderEntites(titre.replace(/\s+/g, " ").trim()).slice(0, 200) : null,
				nomSite: attributMeta(texte, "og:site_name"),
				description: attributMeta(texte, "description"),
				extrait: texteVisible(texte).slice(0, 600),
			};
		} catch (e) {
			clearTimeout(minuteur);
			if (essai === essais[essais.length - 1]) {
				return {
					url: essai,
					demande: essai,
					statutHttp: null,
					erreur: (e instanceof Error ? e.message : String(e)).slice(0, 200),
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

function resumerRegistre(json: { results?: Array<Record<string, unknown>>; total_results?: number }): string {
	const resultats = json.results ?? [];
	const premier = resultats[0];
	if (!premier) return JSON.stringify({ total: json.total_results ?? 0 });
	const siege = (premier.siege ?? {}) as Record<string, unknown>;
	return JSON.stringify({
		total: json.total_results ?? resultats.length,
		siren: premier.siren,
		nomComplet: premier.nom_complet,
		sigle: premier.sigle ?? null,
		communeSiege: siege.libelle_commune ?? null,
		activite: (premier.activite_principale as Record<string, unknown>)?.libelle ?? null,
	}).slice(0, 1000);
}

function cibleRegistre(e: Entree): { requete: string; quoi: string } | null {
	if (e.org.siren) {
		return {
			requete: `${REGISTRE_BASE}/search?q=${encodeURIComponent(e.org.siren.replace(/\s/g, ""))}&per_page=1`,
			quoi: `SIREN ${e.org.siren}`,
		};
	}
	const code = e.org.entityCode ?? "";
	if (/^\d{9}$/.test(code.replace(/\s/g, ""))) {
		return {
			requete: `${REGISTRE_BASE}/search?q=${encodeURIComponent(code.replace(/\s/g, ""))}&per_page=1`,
			quoi: `code d'entité ${code} (${e.org.entitySource ?? "?"})`,
		};
	}
	if (e.org.name.trim().length >= 2) {
		return {
			requete: `${REGISTRE_BASE}/search?q=${encodeURIComponent(e.org.name.trim())}&per_page=5`,
			quoi: `recherche par nom « ${e.org.name.trim()} »`,
		};
	}
	return null;
}

async function interrogerRegistre(e: Entree): Promise<PreuveRegistre> {
	const cible = cibleRegistre(e);
	if (!cible) return null;
	for (let essai = 0; essai < 3; essai++) {
		if (essai > 0) await new Promise((r) => setTimeout(r, 1200 * essai));
		const controleur = new AbortController();
		const minuteur = setTimeout(() => controleur.abort(), 15000);
		try {
			const reponse = await fetch(cible.requete, {
				signal: controleur.signal,
				headers: { accept: "application/json", "user-agent": "radar-precision-rattachement/1.0" },
			});
			const texte = await reponse.text();
			clearTimeout(minuteur);
			if (reponse.status === 429) continue;
			let reponseResumee: string;
			try {
				reponseResumee = resumerRegistre(JSON.parse(texte) as { results?: Array<Record<string, unknown>>; total_results?: number });
			} catch {
				reponseResumee = texte.slice(0, 400);
			}
			return { requete: `${cible.requete} — ${cible.quoi}`, statutHttp: reponse.status, reponse: reponseResumee };
		} catch (err) {
			clearTimeout(minuteur);
			if (essai === 2) {
				return {
					requete: `${cible.requete} — ${cible.quoi}`,
					statutHttp: null,
					reponse: `erreur : ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
				};
			}
		}
	}
	return { requete: cible.requete, statutHttp: null, reponse: "erreur : trois essais échoués" };
}

async function collecterWeb(echantillon: Echantillon): Promise<void> {
	const cacheSites = new Map<string, PreuveSite>();
	const site = async (url: string | null): Promise<PreuveSite> => {
		if (!url) return null;
		let valeur = cacheSites.get(url);
		if (valeur === undefined) {
			valeur = await fetchSite(url);
			cacheSites.set(url, valeur);
		}
		return valeur;
	};
	const cibles = echantillon.entrees.filter((e) => !e.preuve);
	console.log(`Collecte des preuves externes pour ${cibles.length} entrées…`);
	let fait = 0;
	const file = [...cibles];
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCE, Math.max(1, file.length)) }, async () => {
			while (true) {
				const e = file.shift();
				if (!e) return;
				await new Promise((r) => setTimeout(r, 350));
				const registre = await interrogerRegistre(e);
				const siteVictime = await site(e.domaineVictime ? `https://${e.domaineVictime}` : null);
				const siteOrg = await site(e.org.website ?? (e.org.domain ? `https://${e.org.domain}` : null));
				e.preuve = { registre, siteVictime, siteOrg, le: maintenant() };
				fait++;
				if (fait % 10 === 0) console.log(`  ${fait}/${cibles.length}`);
			}
		}),
	);
}

// ── Dossiers de lecture humaine ──────────────────────────────────────────

function afficherDossier(echantillon: Echantillon, de: number, a: number): void {
	for (const e of echantillon.entrees) {
		if (e.ordre < de || e.ordre > a) continue;
		console.log(`#${e.ordre} event=${e.eventId} [${e.sourceId}] ${e.titre}`);
		if (e.description) console.log(`  desc: ${e.description.slice(0, 320)}`);
		if (e.resume) console.log(`  résumé: ${e.resume.slice(0, 240)}`);
		console.log(
			`  org#${e.org.id}: ${e.org.name} | ${e.org.kind ?? "?"} | ${e.org.city ?? "?"} (${e.org.dept ?? "?"}) | domaine ${e.org.domain ?? "—"} | siren ${e.org.siren ?? e.org.entityCode ?? "—"} | créée ${e.org.createdAt?.slice(0, 10) ?? "?"}`,
		);
		for (const p of e.provenance) {
			console.log(`  journal: ${p.alias ?? "?"} / ${p.motif ?? "?"} / ${p.moteur ?? "?"} — ${p.journal ?? ""}`);
		}
		const p = e.preuve;
		console.log(`  registre: ${p?.registre?.reponse ?? "non interrogé"}`);
		for (const [nom, sp] of [["siteVictime", p?.siteVictime], ["siteOrg", p?.siteOrg]] as const) {
			console.log(
				`  ${nom}: ${sp ? `${sp.statutHttp ?? sp.erreur} ${sp.url} | ${sp.titre ?? "—"} | ${sp.nomSite ?? "—"} | ${sp.extrait.slice(0, 220)}` : "—"}`,
			);
		}
	}
}

// ── Verdicts manuels et rapport ──────────────────────────────────────────

type VerdictManuel = {
	ordre: number;
	verdict: Verdict;
	motif: string;
	sources: string[];
	instructif?: boolean;
	rang?: number;
};

function mergerVerdicts(echantillon: Echantillon, chemin: string): void {
	const propositions = JSON.parse(readFileSync(chemin, "utf8")) as VerdictManuel[];
	const parOrdre = new Map(propositions.map((p) => [p.ordre, p]));
	for (const e of echantillon.entrees) {
		const p = parOrdre.get(e.ordre);
		if (!p) continue;
		if (!VERDICTS_ADMIS.includes(p.verdict)) throw new Error(`verdict inconnu en #${e.ordre} : ${p.verdict}`);
		if (!p.motif?.trim()) throw new Error(`verdict sans motif en #${e.ordre}`);
		if (!Array.isArray(p.sources) || p.sources.length < 2) {
			throw new Error(`verdict en #${e.ordre} : au moins deux sources recoupées sont exigées`);
		}
		if (!e.preuve) throw new Error(`verdict posé en #${e.ordre} sans preuve collectée (lancer --web)`);
		e.verdict = {
			verdict: p.verdict,
			motif: p.motif,
			sources: p.sources,
			instructif: p.instructif,
			rang: p.rang,
			le: maintenant(),
		};
	}
}

function ecrireRapport(echantillon: Echantillon, chemin: string): void {
	const manquants = echantillon.entrees.filter((e) => !e.verdict);
	if (manquants.length > 0) {
		throw new Error(`${manquants.length} verdicts manquants (ordres ${manquants.slice(0, 12).map((e) => e.ordre).join(", ")}…) : aucun taux publié avant la fin`);
	}
	const comptes = new Map<Verdict, number>();
	for (const v of VERDICTS_ADMIS) comptes.set(v, 0);
	for (const e of echantillon.entrees) comptes.set(e.verdict!.verdict, (comptes.get(e.verdict!.verdict) ?? 0) + 1);
	const n = (v: Verdict): number => comptes.get(v) ?? 0;
	const denom = n("exacte") + n("partielle") + n("hors_sujet");
	const precision = (n("exacte") + n("partielle") / 2) / Math.max(1, denom);
	const justes = n("exacte") + n("partielle");
	const synthetiques = echantillon.entrees.filter(
		(e) =>
			e.verdict!.verdict === "exacte" &&
			e.org.domain !== null &&
			e.org.name.trim().toLowerCase() === e.org.domain.trim().toLowerCase(),
	).length;

	const parFamille = new Map<string, { total: number; justes: number }>();
	for (const e of echantillon.entrees) {
		const famille = (e.sourceId ?? "?").split(":")[0]!;
		const s = parFamille.get(famille) ?? { total: 0, justes: 0 };
		s.total++;
		if (e.verdict!.verdict === "exacte" || e.verdict!.verdict === "partielle") s.justes++;
		parFamille.set(famille, s);
	}

	const instructives = echantillon.entrees
		.filter((e) => e.verdict?.instructif && e.verdict.verdict !== "exacte")
		.sort((a, b) => (a.verdict!.rang ?? 999) - (b.verdict!.rang ?? 999))
		.slice(0, 10);

	const pct = (x: number, d: number): string => `${((100 * x) / Math.max(1, d)).toFixed(1)} %`;
	const lignes: string[] = [];
	lignes.push("# Précision des rattachements existants — échantillon de 100");
	lignes.push("");
	lignes.push(`Mesure du ${echantillon.protocole.date} sur la base live \`postgres://radar:radar@localhost:5432/radar\`.`);
	lignes.push("Question : sur les rattachements **déjà posés** (\`event.org_id\`), combien sont justes ?");
	lignes.push("");
	lignes.push("## Résultat");
	lignes.push("");
	lignes.push("| Mesure | Valeur |");
	lignes.push("|---|---:|");
	lignes.push(`| Rattachements existants dans la base | ${echantillon.protocole.effectifPopulation} |`);
	lignes.push(`| Échantillon vérifié à la main | ${echantillon.entrees.length} (graine ${echantillon.protocole.graine}) |`);
	lignes.push(`| **Justes** (exactes + partielles) | **${justes} / ${echantillon.entrees.length} (${pct(justes, echantillon.entrees.length)})** |`);
	lignes.push(`| Précision au protocole de la vague (partielle = ½) | **${pct(precision, 1)}** |`);
	lignes.push(`| Exactes / partielles / hors_sujet / indécidables | ${n("exacte")} / ${n("partielle")} / ${n("hors_sujet")} / ${n("indecidable")} |`);
	lignes.push(`| Dont organisations synthétiques créées depuis la revendication | ${synthetiques} |`);
	lignes.push(`| Justes sur des organisations indépendantes | ${justes - synthetiques} / ${echantillon.entrees.length} |`);
	lignes.push("");
	lignes.push("Dénominateur de la précision : exactes + partielles + hors_sujet ; les indécidables en sortent et sont comptés à part.");
	lignes.push("");
	lignes.push("## Protocole");
	lignes.push("");
	lignes.push(`- Population : ${echantillon.protocole.population} (${echantillon.protocole.effectifPopulation} liens).`);
	lignes.push(`- Tirage : ${echantillon.protocole.methode}.`);
	lignes.push("- Chaque verdict a été posé à la main sur au moins deux sources recoupées :");
	for (const s of echantillon.protocole.sources) lignes.push(`  - ${s};`);
	lignes.push(`- ${echantillon.protocole.definitions}`);
	lignes.push("- Le script ne compare aucun nom par programme : un verdict sans preuve collectée est refusé.");
	lignes.push("");
	lignes.push("## Répartition par flux");
	lignes.push("");
	lignes.push("| Flux | Échantillon | Justes |");
	lignes.push("|---|---:|---:|");
	for (const [famille, s] of [...parFamille.entries()].sort((a, b) => b[1].total - a[1].total)) {
		lignes.push(`| ${famille} | ${s.total} | ${s.justes} (${pct(s.justes, s.total)}) |`);
	}
	lignes.push("");
	lignes.push("## Les 10 erreurs les plus instructives");
	lignes.push("");
	lignes.push("| # | Événement | Lien posé | Verdict | Ce que montre le recoupement |");
	lignes.push("|---|---|---|---|---|");
	for (const e of instructives) {
		const motif = e.verdict!.motif.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
		const titre = (e.titre ?? "?").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 90);
		lignes.push(`| ${e.eventId} | ${titre} | ${e.org.name} | ${e.verdict!.verdict} | ${motif} |`);
	}
	lignes.push("");
	lignes.push("## Limites");
	lignes.push("");
	lignes.push(`- ${synthetiques} des ${n("exacte")} exactes pointent vers une organisation synthétique créée depuis le hint de la propre revendication (\`entity_source = hint:quarantine\`) : le libellé est exact, mais la vérification est tautologique. Sans elles : ${justes - synthetiques} justes sur ${echantillon.entrees.length}.`);
	lignes.push(`- ${n("indecidable")} seul cas indécidable est écarté du dénominateur ; en le comptant comme échec, la précision serait de ${pct(n("exacte") + n("partielle") / 2, echantillon.entrees.length)}.`);
	lignes.push(`- La population ne compte que ${echantillon.protocole.effectifPopulation} liens ; ${echantillon.protocole.effectifPopulation - echantillon.entrees.length} n'ont pas été tirés, et la base continue d'évoluer : ce chiffre est un instantané du ${echantillon.protocole.date}.`);
	lignes.push("- La mesure porte sur les liens présents dans `event.org_id`, pas sur les rattachements proposés par le moteur aux indices de quarantaine (campagne distincte, voir docs/mesure-precision.md).");
	lignes.push("");
	lignes.push("## Rejouer");
	lignes.push("");
	lignes.push("```bash");
	lignes.push("apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts --web");
	lignes.push("apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts --dossier --de=1 --a=20");
	lignes.push("apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts");
	lignes.push("```");
	lignes.push("");
	lignes.push(`Tirage, preuves et verdicts : \`${ECHANTILLON}\` ; verdicts manuels : \`${VERDICTS}\`.`);
	lignes.push("");
	writeFileSync(chemin, lignes.join("\n"));
}

// ── Point d'entrée ───────────────────────────────────────────────────────

let echantillon: Echantillon;
if (existsSync(ECHANTILLON)) {
	echantillon = JSON.parse(readFileSync(ECHANTILLON, "utf8")) as Echantillon;
} else {
	echantillon = await tirerEchantillon();
	writeFileSync(ECHANTILLON, JSON.stringify(echantillon, null, "\t") + "\n");
	console.log(`Tirage écrit : ${echantillon.entrees.length} liens dans ${ECHANTILLON}`);
}

if (argv.includes("--web")) {
	await collecterWeb(echantillon);
	writeFileSync(ECHANTILLON, JSON.stringify(echantillon, null, "\t") + "\n");
}

if (argv.includes("--dossier")) {
	afficherDossier(
		echantillon,
		Number(option("de") ?? 1),
		Number(option("a") ?? echantillon.entrees.length),
	);
} else if (argv.includes("--stats")) {
	const comptes = new Map<string, number>();
	let preuves = 0;
	for (const e of echantillon.entrees) {
		if (e.preuve) preuves++;
		if (e.verdict) comptes.set(e.verdict.verdict, (comptes.get(e.verdict.verdict) ?? 0) + 1);
	}
	console.log(`entrées ${echantillon.entrees.length} · avec preuve ${preuves} · verdicts ${[...comptes.values()].reduce((a, b) => a + b, 0)}`);
	for (const [v, n] of [...comptes.entries()].sort()) console.log(`  ${v} : ${n}`);
} else {
	if (existsSync(VERDICTS)) {
		mergerVerdicts(echantillon, VERDICTS);
		writeFileSync(ECHANTILLON, JSON.stringify(echantillon, null, "\t") + "\n");
	}
	ecrireRapport(echantillon, RAPPORT);
	console.log(`Rapport écrit : ${RAPPORT}`);
}

await closePools();
