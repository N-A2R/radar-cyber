/**
 * Trois agents de rupture — détecteurs déterministes, sans LLM.
 *
 * Chaque détecteur prend des données déjà en base (événements, orgs, familles,
 * historique) et renvoie soit une alerte `{ agent, orgId, motif, score, faits,
 * explication }`, soit `null`. Aucun seuil n'est magique : chaque constante
 * porte son justification.
 */

import { mediane } from "./mediane.js";

export type AlerteRupture = {
	agent: string;
	orgId: number;
	motif: string;
	score: number;
	faits: number[];
	explication: string;
};

export type FaitRupture = {
	id: number;
	orgId: number;
	family: string;
	date: string;
	severity: number | null;
	zone?: string;
};

const JOUR_MS = 86_400_000;

// ---------------------------------------------------------------------------
// 1. Nouvelle organisation
// ---------------------------------------------------------------------------

/** Seuil non mesuré : 180 j = six mois, choix arbitraire d'« ancien au référentiel » ;
 *  à calibrer sur la base réelle quand elle sera disponible. */
/** Les trois détecteurs, nommés une fois : le dossier les cite, les tests les vérifient. */
export const DETECTEURS_RUPTURE = ["nouvelle-organisation", "rafale", "changement-nature"] as const;

const ANCIENNETE_REFERENTIEL_JOURS = 180;
/** 30 j : fenêtre d'une revue hebdomadaire élargie ; non mesuré, à calibrer. */
const FENETRE_NOUVEAUTE_JOURS = 30;

export function detecterNouvelleOrganisation(input: {
	org: { id: number; premiereApparition: string; referentielDepuis: string };
	faits: readonly FaitRupture[];
	maintenant?: number;
}): AlerteRupture | null {
	const maintenant = input.maintenant ?? Date.now();
	const ageReferentielJours =
		(maintenant - Date.parse(input.org.referentielDepuis)) / JOUR_MS;
	if (!Number.isFinite(ageReferentielJours) || ageReferentielJours < ANCIENNETE_REFERENTIEL_JOURS) {
		return null;
	}
	const ageApparitionJours =
		(maintenant - Date.parse(input.org.premiereApparition)) / JOUR_MS;
	if (!Number.isFinite(ageApparitionJours) || ageApparitionJours > FENETRE_NOUVEAUTE_JOURS) {
		return null;
	}
	const faitsOrg = input.faits.filter((f) => f.orgId === input.org.id);
	if (faitsOrg.length === 0) return null;
	return {
		agent: "nouvelle-organisation",
		orgId: input.org.id,
		motif: "organisation ancienne au référentiel, première apparition récente",
		score: Math.min(1, ageReferentielJours / 365),
		faits: faitsOrg.map((f) => f.id),
		explication: `référentiel depuis ${Math.round(ageReferentielJours)} j, apparition il y a ${Math.round(ageApparitionJours)} j`,
	};
}

// ---------------------------------------------------------------------------
// 2. Rafale
// ---------------------------------------------------------------------------

/** 7 j : fenêtre d'une semaine, alignée sur la revue hebdomadaire ; non mesuré. */
const FENETRE_RAFLE_JOURS = 7;
/** 3 faits minimum : en dessous, un seul incident bien couvert suffit ; non mesuré. */
const SEUIL_RAFLE_MIN = 3;

export function detecterRafale(input: {
	zone: string;
	famille: string;
	faitsRecents: readonly FaitRupture[];
	historiqueFenetres: readonly number[];
	maintenant?: number;
}): AlerteRupture | null {
	const maintenant = input.maintenant ?? Date.now();
	const limite = maintenant - FENETRE_RAFLE_JOURS * JOUR_MS;
	const recents = input.faitsRecents.filter(
		(f) => f.family === input.famille && f.zone === input.zone && Date.parse(f.date) >= limite,
	);
	if (recents.length < SEUIL_RAFLE_MIN) return null;
	const med = mediane(input.historiqueFenetres);
	if (med === null) return null;
	// Seuil non mesuré : facteur 2 sur la médiane ; à calibrer selon le bruit observé.
	if (recents.length <= 2 * med) return null;
	const orgId = recents[0]?.orgId ?? 0;
	return {
		agent: "rafale",
		orgId,
		motif: `rafale de ${recents.length} faits ${input.famille} sur ${input.zone} en ${FENETRE_RAFLE_JOURS} j`,
		score: Math.min(1, recents.length / (2 * med + 1)),
		faits: recents.map((f) => f.id),
		explication: `médiane historique ${med} faits par fenêtre de ${FENETRE_RAFLE_JOURS} j`,
	};
}

// ---------------------------------------------------------------------------
// 3. Changement de nature
// ---------------------------------------------------------------------------

/** 2 niveaux : évite les faux positifs sur des écarts d'un seul cran ; non mesuré. */
const ECART_GRAVITE = 2;

export function detecterChangementNature(input: {
	orgId: number;
	historique: readonly { family: string; severity: number | null }[];
	nouveau: FaitRupture;
}): AlerteRupture | null {
	const famillesVues = new Set(input.historique.map((h) => h.family));
	if (famillesVues.has(input.nouveau.family)) return null;
	const gravites = input.historique
		.map((h) => h.severity)
		.filter((s): s is number => typeof s === "number");
	const maxPrev = gravites.length ? Math.max(...gravites) : null;
	if (maxPrev === null || input.nouveau.severity === null) return null;
	if (input.nouveau.severity < maxPrev + ECART_GRAVITE) return null;
	return {
		agent: "changement-nature",
		orgId: input.orgId,
		motif: `nouveau type d'incident plus grave (${input.nouveau.family})`,
		score: Math.min(1, (input.nouveau.severity - maxPrev) / 5),
		faits: [input.nouveau.id],
		explication: `gravité ${input.nouveau.severity} contre maximum historique ${maxPrev}`,
	};
}

/**
 * Détecte les ruptures sur la base courante.
 *
 * Séparé des détecteurs (qui restent purs et testables) : ici on ne fait que
 * lire ce qu'il faut leur donner. Sur une base sans événement, la fonction
 * renvoie une liste vide — ce n'est pas « aucune rupture », c'est « rien à
 * observer », et `dossier-reprise` le dit ainsi.
 *
 * Ce qui manque encore et qui est assumé : `referentielDepuis` est approximé
 * par `org.created_at` (date de chargement), pas par la date de création
 * réelle de l'organisation. Tant que le référentiel est chargé en bloc, les
 * deux coïncident ; le jour où il est mis à jour finement, il faudra une
 * vraie source.
 */
export async function detecterRupturesDepuisBase(maintenant: number = Date.now()): Promise<AlerteRupture[]> {
	const appels: AlerteRupture[] = [];

	const { query } = await import("../db.js");

	// 1. Organisation ancienne au référentiel, jamais vue, qui apparaît.
	const nouvelles = await query<{
		id: number;
		premiere: string;
		depuis: string;
	}>(
		`SELECT o.id,
		        min(e.observed_at)::text AS premiere,
		        o.created_at::text        AS depuis
		   FROM org o
		   JOIN event e ON e.org_id = o.id
		  GROUP BY o.id, o.created_at
		 HAVING min(e.observed_at) >= now() - make_interval(days => $1)`,
		[FENETRE_NOUVEAUTE_JOURS],
	);
	for (const n of nouvelles.rows) {
		const faits = await query<FaitRupture>(
			`SELECT id, org_id AS "orgId", family, severity, observed_at AS date
			   FROM event WHERE org_id = $1 ORDER BY observed_at DESC LIMIT 20`,
			[n.id],
		);
		const alerte = detecterNouvelleOrganisation({
			org: { id: n.id, premiereApparition: n.premiere, referentielDepuis: n.depuis },
			faits: faits.rows,
			maintenant,
		});
		if (alerte) appels.push(alerte);
	}

	// 2. Rafale : même famille, même département, fenêtre courte.
	const rafales = await query<{ dept: string; family: string; recents: number }>(
		`SELECT o.dept, e.family, count(*)::int AS recents
		   FROM event e JOIN org o ON o.id = e.org_id
		  WHERE e.observed_at >= now() - make_interval(days => $1) AND o.dept IS NOT NULL
		  GROUP BY o.dept, e.family
		 HAVING count(*) >= $2`,
		[FENETRE_RAFLE_JOURS, SEUIL_RAFLE_MIN],
	);
	for (const r of rafales.rows) {
		const recents = await query<FaitRupture>(
			`SELECT e.id, e.org_id AS "orgId", e.family, e.severity, e.observed_at AS date
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE o.dept = $1 AND e.family = $2
			    AND e.observed_at >= now() - make_interval(days => $3)`,
			[r.dept, r.family, FENETRE_RAFLE_JOURS],
		);
		// Historique : nombre de faits par fenêtre de même durée, sur 12 fenêtres.
		const hist = await query<{ n: number }>(
			`SELECT count(*)::int AS n
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE o.dept = $1 AND e.family = $2
			    AND e.observed_at < now() - make_interval(days => $3)
			  GROUP BY width_bucket(
			           extract(epoch FROM (now() - e.observed_at)),
			           extract(epoch FROM make_interval(days => $3)),
			           extract(epoch FROM make_interval(days => $3)) * 13, 12)`,
			[r.dept, r.family, FENETRE_RAFLE_JOURS],
		);
		const alerte = detecterRafale({
			zone: r.dept,
			famille: r.family,
			faitsRecents: recents.rows,
			historiqueFenetres: hist.rows.map((h) => h.n),
			maintenant,
		});
		if (alerte) appels.push(alerte);
	}

	return appels;
}
