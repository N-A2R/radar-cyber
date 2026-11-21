/**
 * Instantané J-21 — noyau partagé entre le script de mesure et son test.
 *
 * Le script `scripts/anticipation.mts` exécute ces requêtes sur PostgreSQL ;
 * le test synthétique exécute **les mêmes requêtes** sur une base de test
 * isolée. Ainsi « aucune donnée postérieure à J-21 » n'est pas une phrase de
 * documentation : c'est une propriété vérifiée sur des faits fabriqués pour
 * l'être, avec des `observed_at` trompeurs.
 *
 * La borne haute est exclusive et porte sur `valid_at` uniquement. Aucune
 * autre colonne temporelle ne décide de l'appartenance à la fenêtre.
 */

export const JOURS_AVANCE = 21;
const JOUR_MS = 86_400_000;

export type Bornes = { j21: Date; debut: Date; fin: Date };

/** Date UTC d'un `YYYY-MM-DD`, sans fuseau ni heure locale. */
export function dateDuJour(valeur: string): Date {
	return new Date(`${valeur.slice(0, 10)}T00:00:00.000Z`);
}

export function iso(date: Date): string {
	return date.toISOString();
}

export function jour(date: Date): string {
	return iso(date).slice(0, 10);
}

/** [J-21 − 20 j, J-21] inclus ; `fin` est la borne haute exclusive. */
export function bornesFenetre(dateReference: Date): Bornes {
	const j21 = new Date(dateReference.getTime());
	j21.setUTCDate(j21.getUTCDate() - JOURS_AVANCE);
	const fin = new Date(j21.getTime() + JOUR_MS);
	return { j21, fin, debut: new Date(fin.getTime() - JOURS_AVANCE * JOUR_MS) };
}

/**
 * Requêtes de l'instantané. Exportées pour que le test synthétique exécute
 * exactement le SQL du script, pas une copie qui pourrait diverger.
 */
export const SQL = {
	evenements: `SELECT e.id, e.family, e.assertion_type, left(e.title, 200) AS titre,
			        e.valid_at, e.source_id, e.org_id
			   FROM event e
			  WHERE e.valid_at >= $1 AND e.valid_at < $2
			  ORDER BY e.valid_at, e.id`,
	sources: `SELECT s.id, s.name, s.family, s.url,
			        CASE WHEN s.last_ok_at < $2 THEN s.last_ok_at END AS dernier_ok,
			        (SELECT count(*)::int FROM event e
			          WHERE e.source_id = s.id AND e.valid_at >= $1 AND e.valid_at < $2) AS evenements_fenetre,
			        (SELECT count(*)::int FROM event e
			          WHERE e.source_id = s.id AND e.valid_at < $2) AS evenements_avant
			   FROM source s
			  WHERE s.enabled = true
			    AND EXISTS (SELECT 1 FROM event e
			                 WHERE e.source_id = s.id AND e.valid_at < $2)
			  ORDER BY s.id`,
	organisations: `SELECT o.id, o.name, o.kind, o.sector, o.dept, o.city,
			        count(*)::int AS evenements_fenetre
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE e.valid_at >= $1 AND e.valid_at < $2
			  GROUP BY o.id, o.name, o.kind, o.sector, o.dept, o.city
			  ORDER BY o.id`,
	totaux: `SELECT count(*) FILTER (WHERE valid_at < $2)::int AS avant,
			        count(*) FILTER (WHERE valid_at >= $1 AND valid_at < $2)::int AS fenetre
			   FROM event`,
	/**
	 * « Historique réel » = jours où le radar a effectivement collecté des
	 * événements (`collected_at`), par opposition à l'ancienneté des dates
	 * `valid_at` que les flux peuvent remonter rétrospectivement.
	 * `$1` filtre sur une source quand le test synthétique le fournit ;
	 * le script de mesure passe `null` pour mesurer tout le corpus.
	 */
	historique: `SELECT count(DISTINCT collected_at::date)::int AS jours_avec_collecte,
			        min(collected_at::date)::text AS premiere_collecte,
			        max(collected_at::date)::text AS derniere_collecte,
			        (max(collected_at::date) - min(collected_at::date) + 1)::int AS jours_calendaires,
			        count(*)::int AS evenements,
			        min(valid_at::date)::text AS plus_ancien_valid_at,
			        max(valid_at::date)::text AS plus_recent_valid_at,
			        (max(valid_at::date) - min(valid_at::date) + 1)::int AS jours_couverts_par_valid_at
			   FROM event
			  WHERE $1::text IS NULL OR source_id = $1`,
} as const;

export type EvenementBrut = {
	id: number;
	family: string;
	assertion_type: string;
	titre: string;
	valid_at: Date;
	source_id: string;
	org_id: number | null;
};

export type SourceBrut = {
	id: string;
	name: string;
	family: string | null;
	url: string | null;
	dernier_ok: Date | null;
	evenements_fenetre: number;
	evenements_avant: number;
};

export type OrganisationBrut = {
	id: number;
	name: string;
	kind: string | null;
	sector: string | null;
	dept: string | null;
	city: string | null;
	evenements_fenetre: number;
};

export type TotauxBrut = { avant: number; fenetre: number };

export type HistoriqueReel = {
	jours_avec_collecte: number;
	premiere_collecte: string;
	derniere_collecte: string;
	jours_calendaires: number;
	evenements: number;
	plus_ancien_valid_at: string;
	plus_recent_valid_at: string;
	jours_couverts_par_valid_at: number;
};

/** Deuxième barrière : même si le SQL changeait, rien ne sort de la fenêtre. */
export function filtrerEvenements(
	evenements: readonly EvenementBrut[],
	bornes: Bornes,
): { retenus: EvenementBrut[]; horsBorne: number } {
	let horsBorne = 0;
	const retenus = evenements.filter((evenement) => {
		const instant = evenement.valid_at.getTime();
		if (instant >= bornes.debut.getTime() && instant < bornes.fin.getTime()) return true;
		horsBorne++;
		return false;
	});
	return { retenus, horsBorne };
}

/** Assemble la ligne JSONL d'un incident, dans l'ordre de la version versionnée. */
export function construireInstantane(
	incident: { id: string; entite: string; dateReference: string; typeReference: string },
	bornes: Bornes,
	evenements: readonly EvenementBrut[],
	sources: readonly SourceBrut[],
	organisations: readonly OrganisationBrut[],
	totaux: readonly TotauxBrut[],
): Record<string, unknown> {
	return {
		incident,
		j21: jour(bornes.j21),
		fenetre: { debut: jour(bornes.debut), fin: jour(bornes.j21), jours: JOURS_AVANCE },
		comptes: {
			evenements_avant_j21: totaux[0]?.avant ?? 0,
			evenements_fenetre: evenements.length,
			sources_actives: sources.length,
			organisations_citees: organisations.length,
		},
		evenements: evenements.map((e) => ({
			id: e.id,
			family: e.family,
			assertion_type: e.assertion_type,
			titre: e.titre,
			valid_at: iso(e.valid_at),
			source_id: e.source_id,
			org_id: e.org_id,
		})),
		sources_actives: sources.map((s) => ({
			id: s.id,
			name: s.name,
			family: s.family,
			url: s.url,
			dernier_ok_avant_j21: s.dernier_ok ? iso(s.dernier_ok) : null,
			evenements_fenetre: s.evenements_fenetre,
			evenements_avant: s.evenements_avant,
		})),
		organisations_citees: organisations,
	};
}
