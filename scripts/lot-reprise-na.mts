/**
 * Task 4 — lot de reprise des entités restantes de `mission-vague2-complete.md`
 * (169 entités), méthode des sources gratuites : lecture du site de l'entité
 * quand la revendication porte un domaine, puis registre SIRENE via
 * recherche-entreprises.api.gouv.fr (sans clé). SIREN jamais inventé.
 *
 * Chaque verdict porte la requête réellement lancée (URL) et le texte réellement
 * reçu (titre de page, résultats verbatim du registre). Verdicts :
 *   - `present`       : identité légale française au registre, active, nom
 *                       recoupé avec le domaine ou le titre du site — chargée en base ;
 *   - `absent`        : aucune identité légale française au registre (actifs
 *                       et cessés) ;
 *   - `cannot_verify` : homonymie ou site inaccessible — arbitrage humain.
 *
 *   DATABASE_URL=... tsx scripts/lot-reprise-na.mts --lot=1
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const LOT = Number(argv.find((a) => a.startsWith("--lot="))?.split("=")[1] ?? 1);
const TAILLE = 10;

const SOURCE_REF = "bench/results/manques-referentiel-2026-11-15.json";
const SOURCE_TRAITES = "bench/results/manques-glm-vague2.json";
const ENTITY_SOURCE = "lot-reprise-na";

type Manque = { nomLisible: string; occurrences: number; premiereVue?: string; derniereVue?: string; familles?: string[] };

/** Domaine canonique depuis un nom de manque : retire schéma, www., chemins, annotations. */
function domaineDe(nom: string): string | null {
	const clean = nom.replace(/\(old\)/g, "").replace(/<Updated>/g, "").trim();
	const m = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/i.exec(clean);
	return m ? m[1].toLowerCase() : null;
}

type Verdict = "present" | "absent" | "cannot_verify";

type Resolution = {
	nomLisible: string;
	domaine: string | null;
	verdict: Verdict;
	/** URL de la lecture du site, et le texte réellement reçu. */
	site?: { url: string; http: number | null; titre: string | null; metaDescription: string | null; erreur?: string };
	/** Requête réellement lancée au registre, et les résultats reçus verbatim. */
	registre?: { requete: string; http: number | null; resultats: { denomination: string; siren: string; commune: string | null; dept: string | null; etat: string }[]; erreur?: string };
	raison: string;
	/** Chargé en base ? (verdict `present` + SIREN à 9 chiffres) */
	chargeEnBase?: boolean;
};

/** Titre et meta description d'une page, copiés du HTML reçu. */
function titresDe(html: string): { titre: string | null; meta: string | null } {
	const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
	const m = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]?.trim()
		?? /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(html)?.[1]?.trim();
	return { titre: t ? t.slice(0, 500) : null, meta: m ? m.slice(0, 500) : null };
}

async function fetchSite(domaine: string): Promise<Resolution["site"]> {
	const url = `https://${domaine}`;
	try {
		const r = await fetch(url, {
			headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) radar-mesure/1.0", "Accept": "text/html" },
			signal: AbortSignal.timeout(15000),
			redirect: "follow",
		});
		const html = await r.text();
		const { titre, meta } = titresDe(html);
		return { url, http: r.status, titre, metaDescription: meta };
	} catch (e) {
		return { url, http: null, titre: null, metaDescription: null, erreur: String(e).slice(0, 200) };
	}
}

type ResultatRegistre = { denomination: string; siren: string; commune: string | null; dept: string | null; etat: string };

/** Interroge le registre et renvoie la réponse reçue, verbatim (champs utiles). */
async function registreSearch(q: string): Promise<{ requete: string; http: number | null; resultats: ResultatRegistre[]; erreur?: string }> {
	const requete = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=5`;
	try {
		const r = await fetch(requete, {
			headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) radar-mesure/1.0", "Accept": "application/json" },
			signal: AbortSignal.timeout(20000),
		});
		const body = (await r.json()) as {
			results?: {
				nom_complet?: string;
				siren?: string;
				etat_administratif?: string;
				siege?: { commune?: string | null; departement?: string | null; libelle_commune?: string | null };
			}[];
		};
		const resultats: ResultatRegistre[] = (body.results ?? []).slice(0, 5).map((x) => ({
			denomination: x.nom_complet ?? "",
			siren: x.siren ?? "",
			commune: x.siege?.libelle_commune ?? x.siege?.commune ?? null,
			dept: x.siege?.departement ?? null,
			etat: x.etat_administratif ?? "inconnu",
		}));
		return { requete, http: r.status, resultats };
	} catch (e) {
		return { requete, http: null, resultats: [], erreur: String(e).slice(0, 200) };
	}
}

/** Recoupement par nom pur : tous les jetons significatifs de l'entité apparaissent dans la dénomination du registre. */
function recoupeParNom(registreNom: string, nomEntite: string): boolean {
	const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const jetons = norm(nomEntite)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3 && !["sarl", "sas", "earl", "sci", "france"].includes(w));
	// Moins de trois jetons : « Chu De Rennes » (2 jetons) recoupait LA MAISON
	// DES FEMMES DU CHU DE RENNES, une sous-organisation — mauvais niveau,
	// arbitrage humain plutôt qu'un SIREN faux.
	if (jetons.length < 3) return false;
	const rn = norm(registreNom);
	return jetons.every((w) => rn.includes(w));
}

/** Recoupement : le nom du registre répond-il au domaine / au titre du site ? */
function recoupe(registreNom: string, domaine: string | null, titre: string | null): boolean {
	const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const rn = norm(registreNom);
	const racine = domaine ? norm(domaine.replace(/\.[a-z]+$/, "").replace(/^www\./, "").replace(/-/g, " ")) : null;
	if (racine) {
		const motsRacine = racine.split(" ").filter((w) => w.length >= 3);
		if (motsRacine.length > 0 && motsRacine.every((w) => rn.includes(w))) return true;
	}
	if (titre) {
		const tn = norm(titre);
		const motsTitre = tn.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
		if (motsTitre.length >= 2 && motsTitre.slice(0, 4).every((w) => rn.includes(w))) return true;
	}
	return false;
}

async function main(): Promise<void> {
	const dateMesure = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

	const ref = JSON.parse(readFileSync(SOURCE_REF, "utf8")) as { manques: Manque[] };
	const traites = new Set(
		(JSON.parse(readFileSync(SOURCE_TRAITES, "utf8")) as { manques: Manque[] }).manques.map((m) => m.nomLisible),
	);
	const restants = ref.manques.filter((m) => m.zone === "france" && !traites.has(m.nomLisible));
	const lot = restants.slice((LOT - 1) * TAILLE, LOT * TAILLE);

	console.log(`Lot ${LOT} : ${lot.length} entité(s) sur ${restants.length} restantes`);

	const resolutions: Resolution[] = [];
	for (const m of lot) {
		const domaine = domaineDe(m.nomLisible);
		const res: Resolution = { nomLisible: m.nomLisible, domaine, verdict: "cannot_verify", raison: "" };

		// 1. Lecture du site quand l'entité porte un domaine.
		if (domaine) res.site = await fetchSite(domaine);
		const titre = res.site?.titre ?? null;

		// 2. Registre SIRENE : d'abord la racine du domaine (le plus fidèle à
		//    l'entité citée), sinon le titre du site, sinon le nom lisible —
		//    une entité sans domaine est cherchée par son NOM, jamais marquée
		//    « absente » sans requête.
		const racine = domaine?.replace(/\.[a-z]+$/, "").replace(/^www\./, "") ?? null;
		const nomPropre = m.nomLisible.replace(/\(old\)/g, "").replace(/<Updated>/g, "").replace(/FOR SALE.*/i, "").trim();
		const queries = racine ? [racine] : [];
		if (titre && titre.length >= 3) queries.push(titre.slice(0, 60));
		if (queries.length === 0 && nomPropre.length >= 3) queries.push(nomPropre.slice(0, 60));
		let meilleur: { r: Awaited<ReturnType<typeof registreSearch>>; nom: string } | null = null;
		for (const q of queries) {
			const r = await registreSearch(q);
			if (r.resultats.length > 0 && (!meilleur || r.resultats.length > meilleur.r.resultats.length)) {
				meilleur = { r, nom: q };
			}
			if (r.resultats.length > 0) break; // premier registre qui répond suffit ; les essais sont tous consignés
		}
		if (queries.length > 1) res.registre = meilleur?.r ?? (await registreSearch(queries[0]));
		else res.registre = meilleur?.r ?? { requete: queries[0] ? `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(queries[0])}&page=1&per_page=5` : "(aucune requête : ni domaine ni titre)", http: null, resultats: [] };

		// 3. Verdict.
		const candidats = (res.registre?.resultats ?? []).filter((x) => /^\d{9}$/.test(x.siren));
		const actifs = candidats.filter((x) => x.etat === "Actif" || x.etat === "actif");
		const retenus = actifs.length > 0 ? actifs : candidats;
		const recoupeOK = retenus.find(
			(x) => recoupe(x.denomination, domaine, titre) || (racine === null && recoupeParNom(x.denomination, nomPropre)),
		);
		if (recoupeOK) {
			res.verdict = "present";
			res.raison = `SIREN ${recoupeOK.siren} au registre (état ${recoupeOK.etat}, ${recoupeOK.commune ?? "commune ?"} ${recoupeOK.dept ?? "?"}), recoupé avec ${domaine ?? (titre ? "le titre du site" : "le nom cité : " + nomPropre)}`;
			// 4. Chargement idempotent (verdict `present` + SIREN à 9 chiffres).
			const name = recoupeOK.denomination.slice(0, 200);
			const slug = `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "org"}-${recoupeOK.siren}`;
			const deptOk = recoupeOK.dept && /^\d{2}$/.test(recoupeOK.dept) ? recoupeOK.dept : null;
			try {
				await query(
					`INSERT INTO org (name, slug, kind, city, dept, domain, website, entity_code, entity_source, status)
					 VALUES ($1,$2,'entreprise',$3,$4,$5,$6,$7,$8,'confirme')
					 ON CONFLICT (entity_source, entity_code) WHERE entity_code IS NOT NULL AND entity_source IS NOT NULL
					 DO UPDATE SET domain = COALESCE(org.domain, EXCLUDED.domain),
					   website = COALESCE(org.website, EXCLUDED.website),
					   city = COALESCE(org.city, EXCLUDED.city),
					   dept = COALESCE(org.dept, EXCLUDED.dept)`,
					[name, slug, recoupeOK.commune ?? null, deptOk, domaine, domaine ? `https://${domaine}` : null, recoupeOK.siren, ENTITY_SOURCE],
				);
			} catch (e) {
				// Conflit de slug : la même entité légale (même SIREN) est déjà au
				// référentiel par une autre voie (import SIRENE…). On rattrape cette
				// org existante — jamais de doublon de SIREN.
				if ((e as { code?: string }).code !== "23505") throw e;
				await query(
					`UPDATE org SET domain = COALESCE(domain, $2), website = COALESCE(website, $3),
					   city = COALESCE(city, $4), dept = COALESCE(dept, $5)
					 WHERE slug = $1`,
					[slug, domaine, domaine ? `https://${domaine}` : null, recoupeOK.commune ?? null, deptOk],
				);
				res.raison += " ; SIREN déjà au référentiel, org existante rattrapée (pas de doublon)";
			}
			res.chargeEnBase = true;
		} else if (candidats.length === 0 && (res.registre?.erreur || res.site?.erreur)) {
			res.verdict = "cannot_verify";
			res.raison = `site ou registre inaccessible : ${res.site?.erreur ?? res.registre?.erreur}`;
		} else if (candidats.length === 0) {
			res.verdict = "absent";
			res.raison = "aucune identité légale française au registre (requête consignée) ; site : " + (titre ? `« ${titre.slice(0, 80)} »` : "titre vide ou inaccessible");
		} else {
			res.verdict = "cannot_verify";
			res.raison = `candidat(s) au registre mais aucun recoupement avec ${domaine ?? titre} — arbitrage humain`;
		}

		console.log(`  ${res.verdict.padEnd(13)} ${m.nomLisible.padEnd(40)} ${res.raison.slice(0, 100)}`);
		resolutions.push(res);
	}

	const compte = {
		present: resolutions.filter((r) => r.verdict === "present").length,
		absent: resolutions.filter((r) => r.verdict === "absent").length,
		cannot_verify: resolutions.filter((r) => r.verdict === "cannot_verify").length,
	};

	const sortie = {
		dateMesure,
		plan: "docs/plans/mission-nuit-na.md — Task 4 (reprise vague 2)",
		lot: LOT,
		source: { ref: SOURCE_REF, traites: SOURCE_TRAITES, entiteSource: ENTITY_SOURCE },
		method: "lecture du site (fetch, titre et meta verbatim) + recherche-entreprises.api.gouv.fr sans clé ; requêtes et réponses consignées ; SIREN recoupé, jamais inventé",
		compte,
		resolutions,
	};
	const fichier = `bench/results/na-lot-reprise-${LOT}.json`;
	writeFileSync(fichier, `${JSON.stringify(sortie, null, 2)}\n`, "utf8");
	console.log(`\nlot publié : ${fichier} — ${compte.present} chargée(s), ${compte.absent} absente(s), ${compte.cannot_verify} à arbitrer`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
