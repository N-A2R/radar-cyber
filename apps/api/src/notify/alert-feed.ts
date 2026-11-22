/**
 * Lecture des nouvelles alertes pour le flux temps réel.
 *
 * Extrait de la route SSE pour être testable sans connexion : la route ne fait
 * que mettre en forme, la sélection et la rédaction vivent ici.
 *
 * Même règle de confidentialité que le canal d'événements : une alerte assise
 * sur un événement non public n'est pas poussée. Le titre d'une alerte peut
 * contenir un indicateur restreint ou le nom d'une organisation victime.
 */
import { query } from "../db.js";
import { evenementPublicSql } from "../security/tlp.js";

export type LiveAlert = {
	id: number;
	rule_id: string;
	title: string;
	severity: number;
	status: string;
	event_id: number | null;
	indicator_id: number | null;
	org_id: number | null;
	scope: string | null;
	created_at: string;
};

/** Alertes d'identifiant strictement supérieur à `sinceId`, les plus anciennes d'abord. */
export async function selectNewAlerts(sinceId: number, limit = 100): Promise<LiveAlert[]> {
	const r = await query<LiveAlert>(
		`SELECT a.id, a.rule_id, a.title, a.severity, a.status, a.event_id, a.indicator_id,
		        a.org_id, a.scope, a.created_at
		   FROM alert a
		   LEFT JOIN event e ON e.id = a.event_id
		  WHERE a.id > $1
		    AND ${evenementPublicSql("e")}
		  ORDER BY a.id
		  LIMIT $2`,
		[sinceId, limit],
	);
	return r.rows
		.map((alert) => ({
			...alert,
			id: Number(alert.id),
			severity: Number(alert.severity),
			event_id: alert.event_id === null ? null : Number(alert.event_id),
			indicator_id: alert.indicator_id === null ? null : Number(alert.indicator_id),
			org_id: alert.org_id === null ? null : Number(alert.org_id),
			created_at: new Date(alert.created_at).toISOString(),
		}));
}

/** Point de départ d'un client qui se connecte sans identifiant de reprise. */
export async function latestAlertId(): Promise<number> {
	const r = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM alert");
	return Number(r.rows[0]?.m ?? 0);
}
