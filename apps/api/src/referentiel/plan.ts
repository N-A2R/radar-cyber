/**
 * Transformation du jeu territorial en organisations et alias, sans base.
 *
 * Séparation volontaire : ce module décide *quoi* charger, `load.ts` décide
 * *comment* l'écrire. Toute la logique épineuse — communes déléguées rattachées
 * à leur parent, homogénéité des secteurs, alias dédupliqués — se teste ici
 * sans Postgres.
 *
 * Aucun identifiant n'est inventé : le slug dérive du code officiel (INSEE pour
 * les communes, SIREN pour les EPCI), ce qui rend le chargement rejouable.
 */
import {
	communeAliases,
	departementAliases,
	departementName,
	epciAliases,
	epciName,
	regionAliases,
} from "./aliases.js";
import type { ReferentielNA } from "./model.js";

export type ReferentielSector = "commune" | "epci" | "departement" | "region";

export type PlannedAlias = { alias: string; source: string };

/**
 * `kind` couvre désormais les établissements et les entreprises, pas seulement
 * les collectivités : c'est le vocabulaire fermé de la migration 022, complété
 * par ce que `planReferentielEtendu` sait produire. `sector` reste une chaîne
 * libre — c'est lui qui porte la nature réelle (pharmacie, collège, numerique).
 */
export type PlannedOrgKind =
	| "collectivite"
	| "sante"
	| "enseignement"
	| "entreprise"
	| "recherche"
	| "operateur_critique"
	| "ess";

export type PlannedOrg = {
	slug: string;
	name: string;
	kind: PlannedOrgKind;
	sector: string | null;
	city: string | null;
	dept: string | null;
	siren: string | null;
	lat: number | null;
	lon: number | null;
	geoSource: string;
	status: "confirme" | "a_confirmer";
	/** Code officiel : INSEE communal, SIREN d'EPCI, FINESS, UAI, code département. */
	entityCode: string;
	codesPostaux: string[];
	population: number | null;
	aliases: PlannedAlias[];
	/** Jeu d'origine de `entityCode` — absent pour le référentiel territorial. */
	entitySource?: string;
	/** Code NAF de l'entreprise, quand il y en a un. */
	naf?: string | null;
	/** Borne basse de la tranche d'effectif INSEE. */
	effectifMin?: number | null;
	/** Site web et domaine, utiles au rattachement d'actifs. */
	website?: string | null;
	domain?: string | null;
};

export type ReferentielPlan = {
	orgs: PlannedOrg[];
	counts: {
		orgs: number;
		aliases: number;
		communes: number;
		epci: number;
		departements: number;
		regions: number;
		enfantsRattaches: number;
		sansCoordonnees: number;
		sansSiren: number;
	};
	warnings: string[];
};

const GEO_SOURCE = "admin-express-centroide";
const ALIAS_SOURCE = "referentiel-na";

function dedupeAliases(aliases: readonly string[], source: string): PlannedAlias[] {
	const seen = new Set<string>();
	const out: PlannedAlias[] = [];
	for (const raw of aliases) {
		const alias = raw.replace(/\s+/g, " ").trim();
		if (alias.length < 3) continue;
		const key = alias.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ alias, source });
	}
	return out;
}

export function planReferentiel(data: ReferentielNA): ReferentielPlan {
	const warnings: string[] = [];
	const orgs: PlannedOrg[] = [];

	// Les communes déléguées et associées ne sont pas des personnes morales
	// distinctes : leur nom devient un alias de la commune parente. Sans ce
	// regroupement, on créerait des organisations fantômes sans SIREN.
	const childrenByParent = new Map<string, string[]>();
	let enfantsRattaches = 0;
	const parentCodes = new Set(
		data.communes.filter((c) => c.parent === null).map((c) => c.code),
	);
	for (const commune of data.communes) {
		if (commune.parent === null) continue;
		if (!parentCodes.has(commune.parent)) {
			warnings.push(
				`commune ${commune.code} (${commune.nom}) : parent ${commune.parent} absent du jeu, ignorée`,
			);
			continue;
		}
		const list = childrenByParent.get(commune.parent) ?? [];
		list.push(commune.nom);
		childrenByParent.set(commune.parent, list);
		enfantsRattaches++;
	}

	for (const commune of data.communes) {
		if (commune.parent !== null) continue;
		const children = childrenByParent.get(commune.code) ?? [];
		const name = `Commune de ${commune.nom}`;
		const aliases = dedupeAliases(
			[name, ...communeAliases(commune.nom, children)],
			ALIAS_SOURCE,
		);
		if (commune.lat === null || commune.lon === null) {
			warnings.push(`commune ${commune.code} (${commune.nom}) : sans centroïde`);
		}
		orgs.push({
			slug: `na-commune-${commune.code}`,
			name,
			kind: "collectivite",
			sector: "commune",
			city: commune.nom,
			dept: commune.departement,
			siren: commune.siren,
			lat: commune.lat,
			lon: commune.lon,
			geoSource: GEO_SOURCE,
			status: "confirme",
			entityCode: commune.code,
			codesPostaux: commune.codesPostaux,
			population: commune.population,
			aliases,
		});
	}

	const communeDept = new Map(data.communes.map((c) => [c.code, c.departement]));
	for (const epci of data.epci) {
		const name = epciName(epci.nom, epci.type);
		// Un EPCI peut chevaucher la région : son département n'est celui de ses
		// membres que s'ils sont tous d'accord. Sinon on laisse le champ vide
		// plutôt que d'affirmer un rattachement faux.
		const depts = new Set(
			epci.membres.map((code) => communeDept.get(code)).filter((d): d is string => Boolean(d)),
		);
		const dept = depts.size === 1 ? [...depts][0] : null;
		if (depts.size > 1) {
			warnings.push(`EPCI ${epci.code} (${epci.nom}) : à cheval sur ${depts.size} départements`);
		}
		orgs.push({
			slug: `na-epci-${epci.code}`,
			name,
			kind: "collectivite",
			sector: "epci",
			city: null,
			dept,
			siren: epci.code,
			lat: epci.lat,
			lon: epci.lon,
			geoSource: "centroide-pondere-membres",
			status: "confirme",
			entityCode: epci.code,
			codesPostaux: [],
			population: epci.population,
			aliases: dedupeAliases([name, ...epciAliases(epci.nom, epci.type)], ALIAS_SOURCE),
		});
	}

	const communeName = new Map(data.communes.map((c) => [c.code, c.nom]));
	for (const dept of data.departements) {
		const name = departementName(dept.nom, dept.code);
		orgs.push({
			slug: `na-departement-${dept.code}`,
			name,
			kind: "collectivite",
			sector: "departement",
			city: dept.chefLieu ? communeName.get(dept.chefLieu) ?? null : null,
			dept: dept.code,
			// Le jeu ne fournit pas de SIREN départemental : on n'en invente pas.
			siren: null,
			lat: dept.lat,
			lon: dept.lon,
			geoSource: GEO_SOURCE,
			status: "confirme",
			entityCode: dept.code,
			codesPostaux: [],
			population: null,
			aliases: dedupeAliases([name, ...departementAliases(dept.nom, dept.code)], ALIAS_SOURCE),
		});
	}

	const region = data.region;
	const regionName = `Région ${region.nom}`;
	orgs.push({
		slug: `na-region-${region.code}`,
		name: regionName,
		kind: "collectivite",
		sector: "region",
		city: region.chefLieu ? communeName.get(region.chefLieu) ?? null : null,
		dept: null,
		siren: null,
		lat: region.lat,
		lon: region.lon,
		geoSource: "centroide-pondere-membres",
		status: "confirme",
		entityCode: region.code,
		codesPostaux: [],
		population: null,
		aliases: dedupeAliases([regionName, ...regionAliases(region.nom)], ALIAS_SOURCE),
	});

	const bySector = (sector: ReferentielSector) => orgs.filter((o) => o.sector === sector).length;
	return {
		orgs,
		counts: {
			orgs: orgs.length,
			aliases: orgs.reduce((total, org) => total + org.aliases.length, 0),
			communes: bySector("commune"),
			epci: bySector("epci"),
			departements: bySector("departement"),
			regions: bySector("region"),
			enfantsRattaches,
			sansCoordonnees: orgs.filter((o) => o.lat === null || o.lon === null).length,
			sansSiren: orgs.filter((o) => o.siren === null).length,
		},
		warnings,
	};
}
