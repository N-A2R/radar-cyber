/**
 * Import massif du référentiel entreprises de Nouvelle-Aquitaine depuis le
 * stock SIRENE national (data.gouv.fr, édition mensuelle).
 *
 * La vague qui rend « toutes les entreprises » littéral : l'API paginée
 * (25/page) ne pouvait jamais couvrir les 88 divisions NAF — le stock complet
 * les couvre en un passage. Trois fichiers, trois passages en streaming, sans
 * extraction sur disque :
 *
 *   1. `StockEtablissement` — sièges actifs des 12 départements NA, diffusibles :
 *      siret → commune, NAF établissement, tranche d'effectifs, enseignes.
 *   2. `StockUniteLegale` — pour ces sirens : dénomination, dénominations
 *      usuelles, nature juridique, tranche d'effectifs unité légale.
 *   3. `GéolocalisationEtablissement` — pour ces sirets : latitude/longitude
 *      WGS84 (variables `y_latitude` / `x_longitude`, déjà en degrés).
 *
 * Filtres assumés :
 *   - `etablissementSiege = true` : une unité légale = une ligne ; les sites
 *     secondaires viendront en vague 2 si la carte en a besoin ;
 *   - `statutDiffusionEtablissement = O` : les entités à diffusion restreinte
 *     sont des personnes — le radar suit des organisations ;
 *   - catégorie juridique 7xxx (collectivités, établissements publics)
 *     écartée : déjà au référentiel par l'annuaire administratif et
 *     `referentiel-na` ; les associations (92xx) sont gardées avec leur kind ;
 *   - sièges **actifs** seulement : le stock porte tout l'historique depuis
 *     1960, et les sièges fermés sont pour l'essentiel des entreprises
 *     disparues avant la fenêtre. Angle mort assumé : une entreprise fermée
 *     en cours de fenêtre après incident reviendra avec le fichier
 *     Historique.
 *
 * Écriture : INSERT par paquets de 500 avec `ON CONFLICT (siren) DO NOTHING` —
 * idempotent, rejouable, pas de transaction géante sur 400k lignes. Les
 * organisations déjà présentes (imports API du 13-14 novembre) sont gardées
 * telles quelles. Un seul fait `referentiel.charged` au journal, hors
 * transaction : une lacune de journal ne doit pas annuler un import.
 *
 * Usage :
 *   DATABASE_URL=... tsx scripts/import-sirene-stock-na.mts \
 *     --etab=stock-etablissement.zip --ul=stock-unitelegale.zip \
 *     --geoloc=geoloc.zip [--dry-run]
 */
import { spawn } from "node:child_process";
import { closePools, query, ingestQuery } from "../apps/api/src/db.js";
import { consignerLot } from "../apps/api/src/journal/index.js";
import { secteurDeDivision } from "./naf-division-secteurs.mts";
import { secteurDeNaf } from "./naf-secteurs.mts";

const args = process.argv.slice(2);
const opt = (nom: string): string | null =>
	args.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=") ?? null;
const DRY_RUN = args.includes("--dry-run");

const ETAB_ZIP = opt("etab");
const UL_ZIP = opt("ul");
const GEOLOC_ZIP = opt("geoloc");
if (!ETAB_ZIP || !UL_ZIP || !GEOLOC_ZIP) {
	console.error("usage: --etab=<zip> --ul=<zip> --geoloc=<zip> [--dry-run]");
	process.exit(1);
}

const DEPTS_NA = new Set(["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);

/** Tranche SIRENE → borne basse de l'effectif salarié (NN = non renseigné). */
const TRANCHE_EFFECTIF_MIN: Record<string, number> = {
	"01": 1, "02": 3, "03": 6, "11": 10, "12": 20, "21": 50, "22": 100,
	"31": 200, "32": 250, "41": 500, "42": 1000, "51": 2000, "52": 5000, "53": 10000,
};

type Siege = {
	siren: string;
	siret: string;
	codeCommune: string;
	libelleCommune: string;
	naf: string | null;
	trancheEtab: string | null;
	enseignes: string[];
};

/** Découpe une ligne SCSV en respectant les champs cités (guillemets INSEE). */
function decouper(ligne: string): string[] {
	const champs: string[] = [];
	let courant = "";
	let cite = false;
	for (let i = 0; i < ligne.length; i++) {
		const c = ligne[i];
		if (cite) {
			if (c === '"') {
				if (ligne[i + 1] === '"') { courant += '"'; i++; }
				else cite = false;
			} else courant += c;
		} else if (c === '"') cite = true;
		else if (c === ";" || c === ",") { champs.push(courant); courant = ""; }
		else courant += c;
	}
	champs.push(courant);
	return champs;
}

/**
 * Lit un CSV depuis un zip, ligne à ligne, sans rien extraire sur disque.
 * Le séparateur est détecté sur l'en-tête (point-virgule dans SIRENE,
 * virgule dans le fichier géoloc).
 */
async function lireCsv(
	zip: string,
	attendus: readonly string[],
	parLigne: (champs: Record<string, string>) => void,
): Promise<{ lignes: number }> {
	const enfant = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
	let reste = "";
	let entete: string[] | null = null;
	let indices: (number | null)[] | null = null;
	let lignes = 0;
	let rescan = "";

	const traiter = (ligne: string): void => {
		if (ligne.length === 0) return;
		if (ligne.startsWith("#") && entete === null) return;
		if (entete === null) {
			entete = decouper(ligne).map((h) => h.trim().toLowerCase());
			const manquants = attendus.filter((a) => !entete!.includes(a));
			if (manquants.length > 0) {
				throw new Error(`colonnes absentes dans ${zip} : ${manquants.join(", ")}`);
			}
			indices = attendus.map((a) => entete!.indexOf(a));
			return;
		}
		const champs = decouper(ligne);
		const objet: Record<string, string> = {};
		for (let i = 0; i < attendus.length; i++) {
			const idx = indices![i];
			objet[attendus[i]] = idx !== null && idx < champs.length ? champs[idx] : "";
		}
		lignes++;
		parLigne(objet);
		if (lignes % 2_000_000 === 0) console.log(`  ... ${lignes.toLocaleString("fr-FR")} lignes lues (${zip.split("/").pop()})`);
	};

	await new Promise<void>((resoudre, echouer) => {
		enfant.stdout.setEncoding("utf8");
		enfant.stdout.on("data", (morceau: string) => {
			rescan += morceau;
			let i;
			while ((i = rescan.indexOf("\n")) !== -1) {
				const ligne = rescan.slice(0, i).replace(/\r$/, "");
				rescan = rescan.slice(i + 1);
				try { traiter(ligne); }
				catch (e) { enfant.kill(); echouer(e); return; }
			}
		});
		enfant.on("error", echouer);
		enfant.on("close", (code) => {
			if (code !== 0) { echouer(new Error(`unzip a échoué (code ${code}) pour ${zip}`)); return; }
			if (rescan.trim().length > 0) traiter(rescan.trim());
			resoudre();
		});
	});
	return { lignes };
}

function slugifier(nom: string, siren: string): string {
	return `${nom
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)}-${siren}`;
}

async function main(): Promise<void> {
	// Passage 1 — établissements : sièges NA diffusibles.
	console.log("Passage 1/3 — StockEtablissement (sièges NA, diffusion O)...");
	const sieges = new Map<string, Siege>();
	let fermes = 0;
	await lireCsv(ETAB_ZIP,
		["siren", "siret", "etablissementsiege", "etatadministratifetablissement", "statutdiffusionetablissement",
			"codecommuneetablissement", "libellecommuneetablissement", "activiteprincipaleetablissement",
			"trancheeffectifsetablissement", "enseigne1etablissement"],
		(e) => {
			// v3 du stock : booleans « true/false », états « A »/« F ».
			const siege = e.etablissementsiege.toLowerCase();
			if (siege !== "true" && siege !== "oui") return;
			if (e.statutdiffusionetablissement.toUpperCase() !== "O") return;
			const codeCommune = e.codecommuneetablissement;
			const dept = codeCommune.slice(0, 2);
			if (!DEPTS_NA.has(dept)) return;
			// Sièges actifs seulement : les sièges fermés (historique complet du
			// stock depuis 1960) multiplieraient le référentiel par cinq pour
			// servir surtout des entreprises disparues avant la fenêtre.
			if (e.etatadministratifetablissement.toUpperCase() !== "A") { fermes++; return; }
			sieges.set(e.siret, {
				siren: e.siren,
				siret: e.siret,
				codeCommune,
				libelleCommune: e.libellecommuneetablissement || "",
				naf: e.activiteprincipaleetablissement || null,
				trancheEtab: e.trancheeffectifsetablissement || null,
				enseignes: e.enseigne1etablissement ? [e.enseigne1etablissement] : [],
			});
		});
	console.log(`  sièges NA actifs retenus : ${sieges.size.toLocaleString("fr-FR")} (fermés écartés : ${fermes.toLocaleString("fr-FR")})`);
	// Index SIREN : le passage 2 lit des unités légales, pas des sirets.
	const sirensNa = new Set<string>();
	for (const s of sieges.values()) sirensNa.add(s.siren);

	// Passage 2 — unités légales : dénominations, nature, effectifs.
	console.log("Passage 2/3 — StockUniteLegale (dénominations, natures, effectifs)...");
	const unites = new Map<string, {
		nom: string; usuelles: string[]; categorie: string; tranche: string | null; etat: string;
	}>();
	let collectivites = 0;
	let particuliers = 0;
	await lireCsv(UL_ZIP,
		["siren", "denominationunitelegale", "denominationusuelle1unitelegale", "denominationusuelle2unitelegale",
			"denominationusuelle3unitelegale", "categoriejuridiqueunitelegale", "trancheeffectifsunitelegale",
			"etatadministratifunitelegale"],
		(e) => {
			if (!sirensNa.has(e.siren)) return;
			const categorie = e.categoriejuridiqueunitelegale;
			if (categorie.startsWith("7")) { collectivites++; return; }
			const usuelles = [e.denominationusuelle1unitelegale, e.denominationusuelle2unitelegale, e.denominationusuelle3unitelegale]
				.filter((u) => u.length > 0);
			unites.set(e.siren, {
				nom: e.denominationunitelegale || usuelles[0] || "",
				usuelles,
				categorie,
				tranche: e.trancheeffectifsunitelegale || null,
				etat: e.etatadministratifunitelegale,
			});
		});
	console.log(`  unités légales retenues : ${unites.size.toLocaleString("fr-FR")} (collectivités publiques écartées : ${collectivites.toLocaleString("fr-FR")}, particuliers : ${particuliers.toLocaleString("fr-FR")})`);

	// Passage 3 — géolocalisation des sièges retenus.
	console.log("Passage 3/3 — GéolocalisationEtablissement (lat/lon des sièges)...");
	const coordonnees = new Map<string, { lat: string; lon: string }>();
	await lireCsv(GEOLOC_ZIP,
		["siret", "y_latitude", "x_longitude"],
		(e) => {
			if (!sieges.has(e.siret)) return;
			if (e.y_latitude && e.x_longitude) {
				coordonnees.set(e.siret, { lat: e.y_latitude, lon: e.x_longitude });
			}
		});
	console.log(`  sièges géolocalisés : ${coordonnees.size.toLocaleString("fr-FR")} / ${sieges.size.toLocaleString("fr-FR")}`);

	// Fusion + insertion par paquets.
	type LigneOrg = {
		siren: string; nom: string; slug: string; kind: string; sector: string | null;
		naf: string | null; dept: string; city: string | null; lat: string | null; lon: string | null;
		effectifMin: number | null; aliases: string[];
	};
	const lignes: LigneOrg[] = [];
	for (const [siret, siege] of sieges) {
		const unite = unites.get(siege.siren);
		if (!unite || unite.nom.length === 0) continue;
		const secteur =
			secteurDeNaf(siege.naf) ?? secteurDeDivision(siege.naf);
		const geo = coordonnees.get(siret);
		const aliases = [...new Set([...unite.usuelles, ...siege.enseignes])]
			.filter((a) => a.length > 0 && a !== unite.nom)
			.slice(0, 6);
		lignes.push({
			siren: siege.siren,
			nom: unite.nom.slice(0, 200),
			slug: slugifier(unite.nom, siege.siren),
			kind: unite.categorie.startsWith("92") ? "association" : "entreprise",
			sector: secteur,
			naf: siege.naf,
			dept: siege.codeCommune.slice(0, 2),
			city: siege.libelleCommune || null,
			lat: geo?.lat ?? null,
			lon: geo?.lon ?? null,
			effectifMin: TRANCHE_EFFECTIF_MIN[siege.trancheEtab ?? ""] ?? TRANCHE_EFFECTIF_MIN[unite.tranche ?? ""] ?? null,
			aliases,
		});
	}
	console.log(`\nOrganisations à insérer : ${lignes.length.toLocaleString("fr-FR")}`);

	if (DRY_RUN) {
		const parSecteur: Record<string, number> = {};
		for (const l of lignes) parSecteur[l.sector ?? "(null)"] = (parSecteur[l.sector ?? "(null)"] ?? 0) + 1;
		console.log("dry-run — par secteur :", parSecteur);
		await closePools();
		return;
	}

	const PAQUET = 500;
	let inserees = 0;
	let existantes = 0;
	for (let d = 0; d < lignes.length; d += PAQUET) {
		const paquet = lignes.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples = paquet.map((l, i) => {
			const b = i * 12;
			valeurs.push(
				l.nom, l.slug, l.kind, l.sector, l.naf, l.dept, l.city,
				l.lat, l.lon, l.effectifMin, l.siren, l.siren,
			);
			return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},'sirene')`;
		});
		const r = await ingestQuery<{ id: number; inserted: boolean }>(
			`INSERT INTO org (name, slug, kind, sector, naf, dept, city, lat, lon, effectif_min, siren, entity_code, entity_source)
			 VALUES ${tuples.join(",")}
			 ON CONFLICT (siren) WHERE siren IS NOT NULL DO NOTHING
			 RETURNING id, (xmax = 0) AS inserted`,
			valeurs,
		);
		// `inserted` est un booléen texte côté pg selon le pilote : on normalise.
		for (const ligne of r.rows) {
			if (ligne.inserted === true || ligne.inserted === "t" || ligne.inserted === "true") {
				inserees++;
			} else existantes++;
		}
		if (d % 25_000 === 0) {
			console.log(`  ... ${d.toLocaleString("fr-FR")} / ${lignes.length.toLocaleString("fr-FR")} lignes traitées (insérées : ${inserees.toLocaleString("fr-FR")})`);
		}
	}
	console.log(`Organisations insérées : ${inserees.toLocaleString("fr-FR")} — déjà présentes : ${existantes.toLocaleString("fr-FR")}`);

	// Aliases des nouvelles organisations : dénominations usuelles et enseignes.
	const aliasNouvelles = lignes.filter((l) => l.aliases.length > 0);
	let aliasInserts = 0;
	for (let d = 0; d < aliasNouvelles.length; d += PAQUET) {
		const paquet = aliasNouvelles.slice(d, d + PAQUET);
		const valeurs: unknown[] = [];
		const tuples: string[] = [];
		let b = 0;
		for (const l of paquet) {
			for (const alias of l.aliases) {
				valeurs.push(l.slug, alias, "sirene");
				tuples.push(`($${b + 1},$${b + 2},$${b + 3})`);
				b += 3;
				aliasInserts++;
			}
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
	console.log(`Aliases ajoutés : ${aliasInserts.toLocaleString("fr-FR")}`);

	// Un fait de chargement pour la vague, hors transaction.
	const { rows } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org");
	const fait = {
		kind: "referentiel.charged" as const,
		subject: "sirene-stock-na",
		summary: `stock SIRENE NA : ${inserees.toLocaleString("fr-FR")} insérées, ${existantes.toLocaleString("fr-FR")} déjà présentes, total ${rows[0]?.n}`,
		actor: "moteur:sirene-stock@1",
		payload: {
			inserees, existantes, totalEnBase: Number(rows[0]?.n ?? 0),
			siegesVus: sieges.size, collectivitesEcarter: collectivites, particuliersEcartes: particuliers,
			geolocalisees: coordonnees.size, aliases: aliasInserts,
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
