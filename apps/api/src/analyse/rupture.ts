/**
 * Trois agents de rupture — détecteurs déterministes, sans LLM.
 *
 * Chaque détecteur prend des données déjà en base (événements, orgs, familles,
 * historique) et renvoie soit une alerte `{ agent, orgId, motif, score, faits,
 * explication }`, soit `null`. Aucun seuil n'est magique : chaque constante
 * porte son justification.
 */

import { ALERT_SCOPE_RUPTURE_REVUE } from "../alert-scope.js";
import { mediane } from "./mediane.js";
import { consignerLot, type JournalEntry } from "../journal/index.js";

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

export const ANCIENNETE_REFERENTIEL_JOURS = 180;
/** 30 j : fenêtre d'une revue hebdomadaire élargie ; non mesuré, à calibrer. */
export const FENETRE_NOUVEAUTE_JOURS = 30;

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
export const FENETRE_RAFLE_JOURS = 7;
/** 3 faits minimum : en dessous, un seul incident bien couvert suffit ; non mesuré. */
export const SEUIL_RAFLE_MIN = 3;

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
export const ECART_GRAVITE = 2;

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
 * Détecte les ruptures sur la base courante, à un instant donné.
 *
 * Séparé des détecteurs (qui restent purs et testables) : ici on ne fait que
 * lire ce qu'il faut leur donner. Sur une base sans événement, la fonction
 * renvoie une liste vide — ce n'est pas « aucune rupture », c'est « rien à
 * observer », et `dossier-reprise` le dit ainsi.
 *
 * `maintenant` est réellement propagé aux requêtes : les fenêtres se calculent
 * depuis cet instant, pas depuis l'horloge du serveur. C'est ce qui permet le
 * rejeu historique — la mesure du taux de fausses alertes
 * (`scripts/mesure-fausses-alertes.mts`) rejoue ces fenêtres sur les douze
 * derniers mois. Avant ce chantier, le paramètre n'atteignait pas le SQL
 * (les requêtes utilisaient `now()` en dur) : rejouer une date passée
 * regardait en réalité la semaine présente.
 *
 * Ce qui manque encore et qui est assumé : `referentielDepuis` est approximé
 * par `org.created_at` (date de chargement), pas par la date de création
 * réelle de l'organisation. Tant que le référentiel est chargé en bloc, les
 * deux coïncident ; le jour où il est mis à jour finement, il faudra une
 * vraie source.
 */
export async function detecterRupturesDepuisBase(maintenant: number = Date.now()): Promise<AlerteRupture[]> {
	const appels: AlerteRupture[] = [];
	const instant = new Date(maintenant).toISOString();

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
		 HAVING min(e.observed_at) >= $2::timestamptz - make_interval(days => $1)`,
		[FENETRE_NOUVEAUTE_JOURS, instant],
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
		  WHERE e.observed_at >= $2::timestamptz - make_interval(days => $1) AND o.dept IS NOT NULL
		  GROUP BY o.dept, e.family
		 HAVING count(*) >= $3`,
		[FENETRE_RAFLE_JOURS, instant, SEUIL_RAFLE_MIN],
	);
	for (const r of rafales.rows) {
		// `zone` fait partie du contrat du détecteur : sans elle, son filtre
		// `f.zone === zone` comparait `undefined` à un département et aucune
		// rafale ne partait jamais — un câblage structurellement mort.
		const recents = await query<FaitRupture>(
			`SELECT e.id, e.org_id AS "orgId", e.family, e.severity, e.observed_at AS date, o.dept AS zone
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE o.dept = $1 AND e.family = $2
			    AND e.observed_at >= $3::timestamptz - make_interval(days => $4)`,
			[r.dept, r.family, instant, FENETRE_RAFLE_JOURS],
		);
		// Historique : nombre de faits par fenêtre de même durée, sur 12 fenêtres.
		const hist = await query<{ n: number }>(
			`SELECT count(*)::int AS n
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE o.dept = $1 AND e.family = $2
			    AND e.observed_at < $3::timestamptz - make_interval(days => $4)
			  GROUP BY width_bucket(
			           extract(epoch FROM ($3::timestamptz - e.observed_at)),
			           extract(epoch FROM make_interval(days => $4)),
			           extract(epoch FROM make_interval(days => $4)) * 13, 12)`,
			[r.dept, r.family, instant, FENETRE_RAFLE_JOURS],
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

	// 3. Changement de nature : le dernier fait d'une organisation est d'une
	// famille jamais vue et d'une gravité qui dépasse le maximum antérieur.
	// Candidats sélectionnés en une requête, historique lu par organisation :
	// les détecteurs restent purs, la base ne fait que leur donner à manger.
	const candidats = await query<{
		orgId: number;
		id: number;
		family: string;
		severity: number;
		observed: string;
		maxPrev: number;
	}>(
		`WITH dernier AS (
		   SELECT DISTINCT ON (e.org_id)
		          e.org_id, e.id, e.family, e.severity, e.observed_at
		     FROM event e
		    WHERE e.org_id IS NOT NULL AND e.severity IS NOT NULL
		    ORDER BY e.org_id, e.observed_at DESC, e.id DESC
		 )
		 SELECT d.org_id AS "orgId", d.id, d.family, d.severity,
		        d.observed_at::text AS observed, h.max_prev::int AS "maxPrev"
		   FROM dernier d
		   JOIN (SELECT h.org_id, max(h.severity) AS max_prev
		           FROM event h
		           JOIN dernier d2 ON d2.org_id = h.org_id
		                  AND (h.observed_at < d2.observed_at
		                       OR (h.observed_at = d2.observed_at AND h.id < d2.id))
		          WHERE h.severity IS NOT NULL
		          GROUP BY h.org_id) h ON h.org_id = d.org_id
		  WHERE NOT EXISTS (SELECT 1 FROM event e2
		                     WHERE e2.org_id = d.org_id AND e2.family = d.family
		                       AND (e2.observed_at < d.observed_at
		                            OR (e2.observed_at = d.observed_at AND e2.id < d.id)))
		    AND d.severity >= h.max_prev + $1`,
		[ECART_GRAVITE],
	);
	for (const c of candidats.rows) {
		const historique = await query<{ family: string; severity: number | null }>(
			`SELECT family, severity FROM event
			  WHERE org_id = $1
			    AND (observed_at < $2::timestamptz OR (observed_at = $2::timestamptz AND id < $3))
			  ORDER BY observed_at DESC LIMIT 20`,
			[c.orgId, c.observed, c.id],
		);
		const alerte = detecterChangementNature({
			orgId: c.orgId,
			historique: historique.rows,
			nouveau: { id: c.id, orgId: c.orgId, family: c.family, date: c.observed, severity: c.severity },
		});
		if (alerte) appels.push(alerte);
	}

	return appels;
}

// ---------------------------------------------------------------------------
// Passage en revue : les alertes de rupture deviennent des lignes de la revue
// ---------------------------------------------------------------------------

/** Résultat d'un passage de capture : la comptabilité demandée à tout écrivain. */
export type ResultatRuptures = {
	/** Alertes détectées à ce passage. */
	emises: number;
	/** Lignes de revue créées. */
	creees: number;
	/** Lignes existantes mises à jour (evidence, sévérité). */
	misesAJour: number;
	/** Faits `alert.changed` consignés (créations et mises à jour). */
	journal: number;
	/** Faits restés sans trace ou remplacés par une lacune. */
	lacunes: number;
};

/**
 * score ∈ [0,1] → sévérité entière 1..5 : une alerte de rupture partage
 * l'échelle des règles de détection, la revue trie sur la même colonne.
 */
function severiteDe(score: number): number {
	return Math.min(5, Math.max(1, Math.round(score * 4) + 1));
}

/**
 * Persiste les alertes de rupture dans la revue.
 *
 * Une ligne par (agent, organisation) : une situation qui dure met à jour
 * l'evidence au lieu d'empiler des doublons, et une alerte confirmée par un
 * analyste n'est jamais rouverte par un passage (le statut ne se touche pas
 * ici). Chaque écriture est consignée comme `alert.changed` — un fait par
 * alerte, hors transaction : une lacune de journal ne doit pas perdre une
 * alerte de revue (type dédié, exclu de la diffusion).
 */
export async function capterAlertesRupture(maintenant: number = Date.now()): Promise<ResultatRuptures> {
	const alertes = await detecterRupturesDepuisBase(maintenant);
	const { ingestQuery } = await import("../db.js");

	const faits: JournalEntry[] = [];
	let creees = 0;
	let misesAJour = 0;

	for (const a of alertes) {
		const ins = await ingestQuery<{ id: number; nouveau: boolean }>(
			`INSERT INTO alert (rule_id, title, severity, org_id, evidence, scope)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (rule_id, org_id) WHERE scope = $6 AND org_id IS NOT NULL DO UPDATE
			   SET evidence = EXCLUDED.evidence, severity = EXCLUDED.severity, updated_at = now()
			 RETURNING id, (xmax = 0) AS nouveau`,
			[
				`rupture:${a.agent}`,
				`${a.agent} — ${a.motif}`,
				severiteDe(a.score),
				a.orgId,
				JSON.stringify({ motif: a.motif, score: a.score, explication: a.explication, faits: a.faits }),
				ALERT_SCOPE_RUPTURE_REVUE,
			],
		);
		const ligne = ins.rows[0];
		if (!ligne) continue;
		if (ligne.nouveau) creees++;
		else misesAJour++;
		faits.push({
			kind: "alert.changed",
			subject: `alert:rupture:${a.agent}:${a.orgId}`,
			summary: `${a.agent} : alerte ${ligne.nouveau ? "créée" : "mise à jour"} — ${a.motif}`,
			actor: "moteur:rupture@1",
			payload: { agent: a.agent, orgId: a.orgId, motif: a.motif, score: a.score, faits: a.faits, alerte: ligne.id },
		});
	}

	const lot = await consignerLot(faits);
	return {
		emises: alertes.length,
		creees,
		misesAJour,
		journal: lot.consignes,
		lacunes: lot.lacunes + lot.erreurs.length,
	};
}
