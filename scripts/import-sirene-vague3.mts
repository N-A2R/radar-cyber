/**
 * Vague 3 — compléter le registre NA pour supprimer les absences
 * (chantier couverture, docs/plans/chantier-couverture.md S1.2).
 *
 * La vague 1 a importé les sièges **actifs** portant une dénomination ; la
 * vague 2, les personnes physiques actives et les sites à enseigne. Deux
 * absences restaient, que cette vague referme :
 *
 *   1. **Les organisations fermées** : une entreprise victime d'un incident
 *      puis cessée dans la fenêtre n'a plus de siège actif — elle était hors
 *      du référentiel (angle mort assumé de la vague 1). Import : sièges
 *      fermés des 12 départements NA, diffusibles, personne morale
 *      (dénomination ou dénomination usuelle non vide, catégorie juridique
 *      hors 7xxx). Personnes physiques fermées écartées : des noms de
 *      personnes de l'historique depuis 1960 multiplieraient les homonymies
 *      sans servir le rattachement.
 *   2. **Les dénominations usuelles du référentiel entier** : la vague 1 n'a
 *      posé les usuelles en alias que pour les organisations **nouvelles** à
 *      son passage (jointure par slug) — les 41 801 organisations déjà en
 *      base le 14 novembre n'ont jamais reçu les leurs. Ce sont les sigles
 *      officiels du registre (ce que la règle « sigle confirmé au registre »
 *      lit) : cette vague les pose pour **tout** siren NA déjà en base,
 *      source `sirene-usuelle`.
 *
 * Villes et départements : la vague 1 + 2 les ont remplis (4 sans dept, 194
 * sans ville au 21 novembre) — rien à faire, le script le re-mesure.
 *
 * Idempotent : organisations par SIREN (`ON CONFLICT DO NOTHING`), aliases
 * par la contrainte unique `(org_id, alias)`. Sans géolocalisation : les
 * nouvelles organisations fermées arrivent sans lat/lon (elles servent au
 * rattachement par nom, pas à la carte).
 *
 * Usage :
 *   DATABASE_URL=... tsx scripts/import-sirene-vague3.mts \
 *     --etab=stock-etablissement.zip --ul=stock-unitelegale.zip [--dry-run]
 */
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import { consignerLot } from "../apps/api/src/journal/index.js";
import { secteurDeDivision } from "./naf-division-secteurs.mts";
import { secteurDeNaf } from "./naf-secteurs.mts";
import { DEPTS_NA, lireCsv, slugifier } from "./sirene-commun.mts";

const args = process.argv.slice(2);
const opt = (nom: string): string | null =>
	args.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=") ?? null;
const DRY_RUN = args.includes("--dry-run");

const ETAB_ZIP = opt("etab");
const UL_ZIP = opt("ul");
if (!ETAB_ZIP || !UL_ZIP) {
	console.error("usage: --etab=<zip> --ul=<zip> [--dry-run]");
	process.exit(1);
}

const PAQUET = 500;

async function main(): Promise<void> {
	// Sirens déjà en base : les fermés d'un siren déjà présent n'ajoutent rien.
	console.log("Sirens en base...");
	const { rows: rowsSirens } = await query<{ siren: string }>(
		"SELECT siren FROM org WHERE siren IS NOT NULL",
	);
	const enBase = new Set(rowsSirens.map((r) => r.siren));
	console.log(`  ${enBase.size.toLocaleString("fr-FR")} sirens en base`);

	// Passage 1 — établissements : sièges fermés NA, diffusibles.
	console.log("Passage 1/2 — StockEtablissement (sièges fermés NA, diffusion O)...");
	type SiegeFerme = { siren: string; codeCommune: string; libelleCommune: string; naf: string | null };
	const fermes = new Map<string, SiegeFerme>();
	let fermesDejaBase = 0;
	await lireCsv(ETAB_ZIP,
		["siren", "siret", "etablissementsiege", "etatadministratifetablissement", "statutdiffusionetablissement",
			"codecommuneetablissement", "libellecommuneetablissement", "activiteprincipaleetablissement"],
		(e) => {
			if (e.etablissementsiege.toLowerCase() !== "true" && e.etablissementsiege.toLowerCase() !== "oui") return;
			if (e.statutdiffusionetablissement.toUpperCase() !== "O") return;
			if (e.etatadministratifetablissement.toUpperCase() !== "F") return;
			const codeCommune = e.codecommuneetablissement;
			if (!DEPTS_NA.has(codeCommune.slice(0, 2))) return;
			if (enBase.has(e.siren)) { fermesDejaBase++; return; }
			// Un siège fermé par siren (le premier vu — la ville d'un fermé est
			// une métadonnée, pas une clé de rattachement).
			if (!fermes.has(e.siren)) {
				fermes.set(e.siren, {
					siren: e.siren,
					codeCommune,
					libelleCommune: e.libellecommuneetablissement || "",
					naf: e.activiteprincipaleetablissement || null,
				});
			}
		});
	console.log(`  sièges fermés NA hors base : ${fermes.size.toLocaleString("fr-FR")} (sirens déjà en base écartés : ${fermesDejaBase.toLocaleString("fr-FR")})`);

	// Passage 2 — unités légales : usuelles pour tout siren visé, unités pour les fermés.
	console.log("Passage 2/2 — StockUniteLegale (usuelles du référentiel, unités des fermés)...");
	const usuelles = new Map<string, string[]>();
	type UniteFerme = { nom: string; usuelles: string[]; categorie: string };
	const unitesFermes = new Map<string, UniteFerme>();
	let collectivitesFermees = 0;
	let personnesFermees = 0;
	await lireCsv(UL_ZIP,
		["siren", "denominationunitelegale", "denominationusuelle1unitelegale", "denominationusuelle2unitelegale",
			"denominationusuelle3unitelegale", "categoriejuridiqueunitelegale", "etatadministratifunitelegale"],
		(e) => {
			const vise = enBase.has(e.siren) || fermes.has(e.siren);
			if (!vise) return;
			const usue = [e.denominationusuelle1unitelegale, e.denominationusuelle2unitelegale, e.denominationusuelle3unitelegale]
				.filter((u) => u.length > 0 && u !== e.denominationunitelegale);
			if (usue.length > 0 && !usuelles.has(e.siren)) usuelles.set(e.siren, usue);
			if (!fermes.has(e.siren)) return;
			const categorie = e.categoriejuridiqueunitelegale;
			if (categorie.startsWith("7")) { collectivitesFermees++; return; }
			const nom = e.denominationunitelegale || usue[0] || "";
			if (nom.length === 0) { personnesFermees++; return; }
			unitesFermes.set(e.siren, { nom, usuelles: usue, categorie });
		});
	console.log(`  unités fermées retenues : ${unitesFermes.size.toLocaleString("fr-FR")} (collectivités fermées écartées : ${collectivitesFermees.toLocaleString("fr-FR")}, personnes physiques fermées écartées : ${personnesFermees.toLocaleString("fr-FR")})`);
	console.log(`  sirens visés avec dénominations usuelles : ${usuelles.size.toLocaleString("fr-FR")}`);

	// Nouvelles organisations fermées : nom, slug, kind, secteur, dept, ville.
	type LigneOrg = { siren: string; nom: string; slug: string; kind: string; sector: string | null; naf: string | null; dept: string; city: string | null; usuelles: string[] };
	const lignes: LigneOrg[] = [];
	for (const [siren, unite] of unitesFermes) {
		const siege = fermes.get(siren);
		if (!siege) continue;
		lignes.push({
			siren,
			nom: unite.nom.slice(0, 200),
			slug: slugifier(unite.nom, siren),
			kind: unite.categorie.startsWith("92") ? "association" : "entreprise",
			sector: secteurDeNaf(siege.naf) ?? secteurDeDivision(siege.naf),
			naf: siege.naf,
			dept: siege.codeCommune.slice(0, 2),
			city: siege.libelleCommune || null,
			usuelles: unite.usuelles,
		});
	}
	console.log(`\nOrganisations fermées à insérer : ${lignes.length.toLocaleString("fr-FR")}`);

	if (DRY_RUN) {
		const parDept: Record<string, number> = {};
		for (const l of lignes) parDept[l.dept] = (parDept[l.dept] ?? 0) + 1;
		console.log("dry-run — fermées par département :", parDept);
		console.log("dry-run — usuelles à poser :", usuelles.size.toLocaleString("fr-FR"), "sirens");
		await closePools();
		return;
	}

	// Insertion des organisations fermées (sans lat/lon : elles servent au
	// rattachement par nom, pas à la carte).
	let inserees = 0;
	for (let d = 0; d < lignes.length; d += PAQUET) {
		const paquet = lignes.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples = paquet.map((l, i) => {
			const b = i * 9;
			valeurs.push(l.nom, l.slug, l.kind, l.sector, l.naf, l.dept, l.city, l.siren, l.siren);
			return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},NULL,NULL,NULL,$${b + 8},$${b + 9},'sirene-ferme')`;
		});
		const r = await ingestQuery<{ inserted: boolean }>(
			`INSERT INTO org (name, slug, kind, sector, naf, dept, city, lat, lon, effectif_min, siren, entity_code, entity_source)
			 VALUES ${tuples.join(",")}
			 ON CONFLICT (siren) WHERE siren IS NOT NULL DO NOTHING
			 RETURNING id, (xmax = 0) AS inserted`,
			valeurs,
		);
		for (const ligne of r.rows) {
			if (ligne.inserted === true || ligne.inserted === "t" || ligne.inserted === "true") inserees++;
		}
		if (d % 10_000 === 0 && d > 0) console.log(`  ... ${d.toLocaleString("fr-FR")} / ${lignes.length.toLocaleString("fr-FR")} fermées traitées`);
	}
	console.log(`Organisations fermées insérées : ${inserees.toLocaleString("fr-FR")}`);

	// Usuelles en alias — tout siren visé (base + nouvelles fermées).
	// La contrainte unique (org_id, alias) rend l'insertion idempotente : un
	// alias déjà présent sous une autre source n'est pas dupliqué.
	let aliasPoses = 0;
	const sirensAvecUsuelles = [...usuelles.keys()];
	for (let d = 0; d < sirensAvecUsuelles.length; d += PAQUET) {
		const paquetSirens = sirensAvecUsuelles.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples: string[] = [];
		let b = 0;
		for (const siren of paquetSirens) {
			for (const u of usuelles.get(siren) ?? []) {
				if (u.length < 3) continue; // sous 3 caractères, aucun rattachement honnête
				valeurs.push(siren, u);
				tuples.push(`($${b + 1},$${b + 2})`);
				b += 2;
				aliasPoses++;
			}
		}
		if (tuples.length === 0) continue;
		await ingestQuery(
			`INSERT INTO org_alias (org_id, alias, source)
			 SELECT o.id, x.alias, 'sirene-usuelle' FROM org o
			 JOIN (VALUES ${tuples.join(",")}) AS x(siren, alias) ON o.siren = x.siren
			 ON CONFLICT (org_id, alias) DO NOTHING`,
			valeurs,
		);
	}
	console.log(`Aliases « sirene-usuelle » posés : ${aliasPoses.toLocaleString("fr-FR")}`);

	// Nom comme alias pour les fermées sans usuelle — sans cela, l'org est
	// invisible pour le moteur, qui matche sur org_alias (leçon vague 2).
	let nomsFermes = 0;
	for (let d = 0; d < lignes.length; d += PAQUET) {
		const paquet = lignes.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples: string[] = [];
		let b = 0;
		for (const l of paquet) {
			if (l.usuelles.length > 0) continue; // a déjà une usuelle posée ci-dessus
			valeurs.push(l.siren, l.nom);
			tuples.push(`($${b + 1},$${b + 2})`);
			b += 2;
			nomsFermes++;
		}
		if (tuples.length === 0) continue;
		await ingestQuery(
			`INSERT INTO org_alias (org_id, alias, source)
			 SELECT o.id, x.alias, 'sirene-nom' FROM org o
			 JOIN (VALUES ${tuples.join(",")}) AS x(siren, alias) ON o.siren = x.siren
			 ON CONFLICT (org_id, alias) DO NOTHING`,
			valeurs,
		);
	}
	console.log(`Aliases « sirene-nom » des fermées sans usuelle : ${nomsFermes.toLocaleString("fr-FR")}`);

	// Villes / départements manquants : re-mesure (la vague 1 + 2 les ont remplis).
	const { rows: manquants } = await query<{ nod: string; noc: string }>(
		"SELECT count(*) FILTER (WHERE dept IS NULL AND siren IS NOT NULL)::text AS nod, count(*) FILTER (WHERE city IS NULL AND siren IS NOT NULL)::text AS noc FROM org",
	);

	// Un fait de chargement pour la vague, hors transaction.
	const { rows } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org");
	const fait = {
		kind: "referentiel.charged" as const,
		subject: "sirene-vague3-na",
		summary: `vague 3 SIRENE NA : ${inserees.toLocaleString("fr-FR")} fermées insérées, ${aliasPoses.toLocaleString("fr-FR")} usuelles posées, total ${rows[0]?.n}`,
		actor: "moteur:sirene-vague3@1",
		payload: {
			inserees, aliasUsuelles: aliasPoses, aliasesNomsFermes: nomsFermes,
			totalEnBase: Number(rows[0]?.n ?? 0),
			siegesFermesVus: fermes.size, fermesDejaBase,
			collectivitesFermeesEcarter: collectivitesFermees, personnesFermeesEcarter: personnesFermees,
			sirensAvecUsuelles: usuelles.size,
			sansDept: Number(manquants[0]?.nod ?? 0), sansVille: Number(manquants[0]?.noc ?? 0),
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
