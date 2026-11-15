/**
 * Vague 2 — compléter le référentiel SIRENE au-delà des sièges nommés.
 *
 * La vague 1 (`import-sirene-stock-na.mts`) a importé les sièges **actifs
 * portant une dénomination** : 667 881 organisations. Deux trous restaient
 * assumés, que cette vague referme :
 *
 *   1. **Les personnes physiques** (~502 000) : artisans et auto-entrepreneurs
 *      dont la dénomination est vide — le nom légal porte le nom de la
 *      personne (`nomUniteLegale` + `prenomUsuelUniteLegale`). Sans eux, la
 *      couverture W % des salariés et les secteurs agricole et BTP restent
 *      sous-comptés.
 *   2. **Les sites secondaires portant une enseigne** : le magasin est la
 *      victime (« Intermarché de Gradignan »), pas la coopérative dont le
 *      siège est ailleurs. Seuls les sites portant une `enseigne1` sont
 *      importés — l'enseigne est ce que le texte nomme, et l'arbitrage
 *      communal de gazetteer@3 fait le reste. Identifiés par SIRET (siren
 *      NULL : l'unité légale existe déjà comme siège).
 *
 * En fin de vague, chaque organisation du référentiel sans aucune ligne
 * d'alias reçoit son nom comme alias (`sirene-nom`) : sans cela, l'org est
 * invisible pour le moteur, qui matche sur `org_alias` et pas sur `org`.
 *
 * Idempotent : personnes par SIREN (DO NOTHING), sites par SIRET (slug
 * déterministe + ON CONFLICT slug), alias par NOT EXISTS. Mêmes filtres que
 * la vague 1 : actifs, diffusion O, catégorie juridique 7xxx écartée.
 *
 * Usage :
 *   DATABASE_URL=... tsx scripts/import-sirene-vague2.mts \
 *     --etab=stock-etablissement.zip --ul=stock-unitelegale.zip \
 *     --geoloc=geoloc.zip
 */
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import { consignerLot } from "../apps/api/src/journal/index.js";
import { secteurDeDivision } from "./naf-division-secteurs.mts";
import { secteurDeNaf } from "./naf-secteurs.mts";
import { DEPTS_NA, TRANCHE_EFFECTIF_MIN, lireCsv, slugifier } from "./sirene-commun.mts";

const args = process.argv.slice(2);
const opt = (nom: string): string | null =>
	args.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=") ?? null;

const ETAB_ZIP = opt("etab");
const UL_ZIP = opt("ul");
const GEOLOC_ZIP = opt("geoloc");
if (!ETAB_ZIP || !UL_ZIP || !GEOLOC_ZIP) {
	console.error("usage: --etab=<zip> --ul=<zip> --geoloc=<zip>");
	process.exit(1);
}

const PAQUET = 500;

type Siege = {
	siren: string;
	codeCommune: string;
	city: string | null;
	naf: string | null;
	tranche: string | null;
};

type Site = {
	siren: string;
	enseigne: string;
	city: string;
	dept: string;
	naf: string | null;
	tranche: string | null;
};

type Personne = {
	nom: string;
	dept: string;
	city: string | null;
	naf: string | null;
	tranche: string | null;
	siretSiege: string;
};

async function main(): Promise<void> {
	// Passage 1 — établissements : sièges actifs (pour joindre les unités) et
	// sites secondaires portant une enseigne.
	console.log("Passage 1/3 — StockEtablissement (sièges actifs + sites à enseigne)...");
	const sieges = new Map<string, Siege>();
	const sirenVersSiretSiege = new Map<string, string>();
	const sites = new Map<string, Site>();
	let sitesVus = 0;
	await lireCsv(ETAB_ZIP,
		["siren", "siret", "etablissementsiege", "etatadministratifetablissement", "statutdiffusionetablissement",
			"codecommuneetablissement", "libellecommuneetablissement", "activiteprincipaleetablissement",
			"trancheeffectifsetablissement", "enseigne1etablissement"],
		(e) => {
			if (e.statutdiffusionetablissement.toUpperCase() !== "O") return;
			const codeCommune = e.codecommuneetablissement;
			const dept = codeCommune.slice(0, 2);
			if (!DEPTS_NA.has(dept)) return;
			if (e.etatadministratifetablissement.toUpperCase() !== "A") return;
			const siegeFlag = e.etablissementsiege.toLowerCase();
			if (siegeFlag === "true" || siegeFlag === "oui") {
				sieges.set(e.siret, {
					siren: e.siren,
					codeCommune,
					city: e.libellecommuneetablissement || null,
					naf: e.activiteprincipaleetablissement || null,
					tranche: e.trancheeffectifsetablissement || null,
				});
				sirenVersSiretSiege.set(e.siren, e.siret);
				return;
			}
			// Site secondaire : sans enseigne, aucun texte ne peut le nommer —
			// il attend une vague où le matching saura le lire autrement.
			if (!e.enseigne1etablissement) return;
			if (!/^\d{14}$/.test(e.siret) || !/^\d{9}$/.test(e.siren)) return;
			sitesVus++;
			sites.set(e.siret, {
				siren: e.siren,
				enseigne: e.enseigne1etablissement,
				city: e.libellecommuneetablissement || "",
				dept,
				naf: e.activiteprincipaleetablissement || null,
				tranche: e.trancheeffectifsetablissement || null,
			});
		});
	console.log(`  sièges actifs NA : ${sieges.size.toLocaleString("fr-FR")} — sites à enseigne retenus : ${sites.size.toLocaleString("fr-FR")} (vus : ${sitesVus.toLocaleString("fr-FR")})`);

	// Passage 2 — unités légales : personnes physiques (dénomination vide) et
	// dénomination légale des sites (pour leur nom complet).
	console.log("Passage 2/3 — StockUniteLegale (personnes physiques, dénominations des sites)...");
	const sirensDesSites = new Set<string>();
	for (const s of sites.values()) sirensDesSites.add(s.siren);
	const personnes = new Map<string, Personne>();
	const denominations = new Map<string, string>();
	let collectivites = 0;
	await lireCsv(UL_ZIP,
		["siren", "denominationunitelegale", "nomunitelegale", "prenomusuelunitelegale", "prenom1unitelegale",
			"categoriejuridiqueunitelegale", "trancheeffectifsunitelegale", "etatadministratifunitelegale"],
		(e) => {
			// Garde de format : une ligne mal découpée (champ cité contenant un
			// retour à la ligne) décale les colonnes et fabrique des sirens
			// fantoches — un seul siren invalide perdait tout le paquet.
			if (!/^\d{9}$/.test(e.siren)) return;
			const estSite = sirensDesSites.has(e.siren);
			const siretSiege = sirenVersSiretSiege.get(e.siren);
			if (!estSite && siretSiege === undefined) return;
			if (e.categoriejuridiqueunitelegale.startsWith("7")) { collectivites++; return; }
			const denomination = e.denominationunitelegale.trim();
			if (estSite) {
				if (denomination.length > 0) denominations.set(e.siren, denomination);
				return;
			}
			// Personne physique : dénomination vide, identité portée par nom + prénom.
			if (denomination.length > 0) return;
			const prenom = e.prenomusuelunitelegale || e.prenom1unitelegale || "";
			const nom = [e.nomunitelegale, prenom].filter((x) => x.length > 0).join(" ").trim();
			if (nom.length === 0) return;
			const siege = sieges.get(siretSiege as string);
			if (!siege) return;
			personnes.set(e.siren, {
				nom: nom.slice(0, 200),
				dept: siege.codeCommune.slice(0, 2),
				city: siege.city,
				naf: siege.naf,
				tranche: e.trancheeffectifsunitelegale || siege.tranche,
				siretSiege: siretSiege as string,
			});
		});
	console.log(`  personnes physiques : ${personnes.size.toLocaleString("fr-FR")} — dénominations de sites trouvées : ${denominations.size.toLocaleString("fr-FR")} (collectivités écartées : ${collectivites.toLocaleString("fr-FR")})`);

	// Passage 3 — géolocalisation des personnes (leur siège) et des sites.
	console.log("Passage 3/3 — GéolocalisationEtablissement...");
	const siretsVoulus = new Set<string>(sites.keys());
	for (const p of personnes.values()) siretsVoulus.add(p.siretSiege);
	const coordonnees = new Map<string, { lat: string; lon: string }>();
	await lireCsv(GEOLOC_ZIP,
		["siret", "y_latitude", "x_longitude"],
		(e) => {
			if (siretsVoulus.has(e.siret) && e.y_latitude && e.x_longitude) {
				coordonnees.set(e.siret, { lat: e.y_latitude, lon: e.x_longitude });
			}
		});
	console.log(`  coordonnées trouvées : ${coordonnees.size.toLocaleString("fr-FR")} / ${siretsVoulus.size.toLocaleString("fr-FR")}`);

	// --- Insertion des personnes physiques ------------------------------------
	// Déduplication avant insertion : un siren déjà en base (vague 1, import
	// API) fait conflit sur l'index siren que l'arbiteur entity_code ne
	// couvre pas — et une seule clause ON CONFLICT par INSERT.
	const sirensExistants = new Set<string>();
	{
		const { rows } = await query<{ siren: string }>("SELECT siren FROM org WHERE siren IS NOT NULL");
		for (const r of rows) sirensExistants.add(r.siren);
	}
	console.log(`sirens déjà en base : ${sirensExistants.size.toLocaleString("fr-FR")}`);
	let personnesInserees = 0;
	const lignesPersonnes = [...personnes.entries()]
		.filter(([siren]) => !sirensExistants.has(siren))
		.map(([siren, p]) => {
		const geo = coordonnees.get(p.siretSiege);
		return {
			nom: p.nom, slug: slugifier(p.nom, siren), sector: secteurDeNaf(p.naf) ?? secteurDeDivision(p.naf),
			naf: p.naf, dept: p.dept, city: p.city, lat: geo?.lat ?? null, lon: geo?.lon ?? null,
			effectifMin: TRANCHE_EFFECTIF_MIN[p.tranche ?? ""] ?? null, siren,
		};
	});
	for (let d = 0; d < lignesPersonnes.length; d += PAQUET) {
		const paquet = lignesPersonnes.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples = paquet.map((l, i) => {
			const b = i * 11;
			// Ordre des paramètres = ordre des colonnes : name, slug, sector,
			// naf, dept, city, lat, lon, siren, entity_code, effectif_min.
			valeurs.push(l.nom, l.slug, l.sector, l.naf, l.dept, l.city, l.lat, l.lon, l.siren, l.siren, l.effectifMin);
			return `($${b + 1},$${b + 2},'entreprise',$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},'confirme',$${b + 9},$${b + 10},'sirene',$${b + 11})`;
		});
		const r = await ingestQuery(
			`INSERT INTO org (name, slug, kind, sector, naf, dept, city, lat, lon, status, siren, entity_code, entity_source, effectif_min)
			 VALUES ${tuples.join(",")}
			 ON CONFLICT (entity_source, entity_code) WHERE entity_source IS NOT NULL AND entity_code IS NOT NULL DO NOTHING`,
			valeurs,
		);
		personnesInserees += r.rowCount ?? 0;
		if (d % 50_000 === 0) console.log(`  ... personnes : ${d.toLocaleString("fr-FR")} / ${lignesPersonnes.length.toLocaleString("fr-FR")}`);
	}
	console.log(`Personnes physiques insérées : ${personnesInserees.toLocaleString("fr-FR")}`);

	// --- Insertion des sites secondaires à enseigne ----------------------------
	// Un site = un établissement : identifié par SIRET (siren NULL, l'unité
	// légale existe déjà comme siège), nom porté par l'enseigne et la commune.
	let sitesInseres = 0;
	const lignesSites = [...sites.entries()].map(([siret, s]) => {
		const geo = coordonnees.get(siret);
		const denomination = denominations.get(s.siren) ?? "";
		const nom = `${s.enseigne} (${s.city})`.slice(0, 200);
		return {
			nom, slug: slugifier(nom, siret), sector: secteurDeNaf(s.naf) ?? secteurDeDivision(s.naf),
			naf: s.naf, dept: s.dept, city: s.city, lat: geo?.lat ?? null, lon: geo?.lon ?? null,
			effectifMin: TRANCHE_EFFECTIF_MIN[s.tranche ?? ""] ?? null, siret,
			enseigne: s.enseigne,
		};
	});
	for (let d = 0; d < lignesSites.length; d += PAQUET) {
		const paquet = lignesSites.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples = paquet.map((l, i) => {
			const b = i * 10;
			// Ordre des paramètres = ordre des colonnes : name, slug, sector,
			// naf, dept, city, lat, lon, entity_code (siret), effectif_min.
			valeurs.push(l.nom, l.slug, l.sector, l.naf, l.dept, l.city, l.lat, l.lon, l.siret, l.effectifMin);
			return `($${b + 1},$${b + 2},'entreprise',$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},'confirme',$${b + 9},'sirene-site',$${b + 10})`;
		});
		const r = await ingestQuery(
			`INSERT INTO org (name, slug, kind, sector, naf, dept, city, lat, lon, status, entity_code, entity_source, effectif_min)
			 VALUES ${tuples.join(",")}
			 ON CONFLICT (slug) DO NOTHING`,
			valeurs,
		);
		sitesInseres += r.rowCount ?? 0;
		if (d % 50_000 === 0) console.log(`  ... sites : ${d.toLocaleString("fr-FR")} / ${lignesSites.length.toLocaleString("fr-FR")}`);
	}
	console.log(`Sites à enseigne insérés : ${sitesInseres.toLocaleString("fr-FR")}`);

	// Aliases des sites : l'enseigne, c'est ce que le texte nomme.
	let aliasSites = 0;
	for (let d = 0; d < lignesSites.length; d += PAQUET) {
		const paquet = lignesSites.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples: string[] = [];
		let b = 0;
		for (const l of paquet) {
			valeurs.push(l.slug, l.enseigne, "sirene-enseigne");
			tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
			b += 3;
			aliasSites++;
		}
		await ingestQuery(
			`INSERT INTO org_alias (org_id, alias, source)
			 SELECT o.id, x.alias, x.source FROM org o
			 JOIN (VALUES ${tuples.join(",")}) AS x(slug, alias, source) ON o.slug = x.slug
			 LEFT JOIN org_alias oa ON oa.org_id = o.id AND oa.alias = x.alias
			 WHERE oa.id IS NULL`,
			valeurs,
		);
	}
	console.log(`Aliases d'enseigne des sites : ${aliasSites.toLocaleString("fr-FR")}`);

	// --- Backfill : chaque organisation sans alias reçoit son nom --------------
	// Le moteur matche sur org_alias, pas sur org : sans cette ligne, une org
	// est invisible au rattachement quelle que soit la qualité de son nom.
	const backfill = await ingestQuery(
		`INSERT INTO org_alias (org_id, alias, source)
		 SELECT o.id, btrim(o.name), 'sirene-nom'
		   FROM org o
		  WHERE o.entity_source LIKE 'sirene%'
		    AND length(btrim(o.name)) >= 4
		    AND NOT EXISTS (SELECT 1 FROM org_alias a WHERE a.org_id = o.id)`,
	);
	console.log(`Aliases de nom en backfill : ${(backfill.rowCount ?? 0).toLocaleString("fr-FR")}`);

	// --- Un fait de chargement pour la vague ----------------------------------
	const { rows } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org");
	const fait = {
		kind: "referentiel.charged" as const,
		subject: "sirene-stock-na-vague2",
		summary: `vague 2 SIRENE NA : ${personnesInserees.toLocaleString("fr-FR")} personnes physiques, ${sitesInseres.toLocaleString("fr-FR")} sites à enseigne, ${(backfill.rowCount ?? 0).toLocaleString("fr-FR")} alias de nom — total ${rows[0]?.n}`,
		actor: "moteur:sirene-stock@1",
		payload: {
			personnesInserees, sitesInseres, aliasesSites: aliasSites,
			aliasesNomBackfill: backfill.rowCount ?? 0,
			totalEnBase: Number(rows[0]?.n ?? 0),
			siegesVus: sieges.size, collectivitesEcartees: collectivites,
		},
	};
	const lot = await consignerLot([fait]);
	console.log(`journal : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s)`);

	await closePools();
}

await main().catch(async (e) => {
	console.error(e);
	await closePools().catch(() => {});
	process.exit(1);
});
