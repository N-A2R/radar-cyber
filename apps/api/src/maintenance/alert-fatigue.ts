/**
 * Charge d'alerte réelle par organisation.
 *
 * La politique et la mesure vivent dans `db/migrate-201-alert-fatigue.sql` :
 * une seule définition SQL, appelée par le job périodique comme par un
 * rattrapage manuel. Ce module ne fait que piloter ces fonctions et lire les
 * deux taux du critère.
 *
 * Aucune alerte n'est supprimée. Un doublon (même organisation, même jour
 * Europe/Paris, même règle) est acquitté et conserve dans `evidence.fatigue`
 * l'identifiant de l'alerte qui le couvre ; la diffusion ignore ces doublons.
 */
import { ingestQuery, query } from "../db.js";

export interface AlertFatiguePolicyResult {
  acknowledgedDuplicates: number;
  dailyRows: number;
}

export interface AlertFatigueMeasure {
  /** Part des organisations-jours à au plus 2 alertes présentées (30 j). */
  loadRatio: number;
  /** Part des alertes qui ne sont plus `open` (acquittées ou résolues). */
  ackRatio: number;
  dailyRows: number;
  alertRows: number;
  openAlerts: number;
  /** Acquittées par la politique de déduplication, pas par un humain. */
  systemAcked: number;
  /** Acquittées hors politique (geste humain). */
  humanAcked: number;
  resolved: number;
}

/** Applique la politique de déduplication puis republie la mesure. */
export async function applyAlertFatiguePolicy(): Promise<AlertFatiguePolicyResult> {
  const r = await ingestQuery<{
    result: { acknowledged_duplicates: number; daily_rows: number };
  }>("SELECT apply_alert_fatigue_policy() AS result");
  const result = r.rows[0]?.result;
  if (!result) throw new Error("apply_alert_fatigue_policy() n'a rien renvoyé");
  return {
    acknowledgedDuplicates: Number(result.acknowledged_duplicates),
    dailyRows: Number(result.daily_rows),
  };
}

/** Lit les deux taux du critère, exactement tels qu'un vérificateur les calcule. */
export async function measureAlertFatigue(): Promise<AlertFatigueMeasure> {
  const r = await query<{
    load_ratio: number | null;
    ack_ratio: number | null;
    daily_rows: string;
    alert_rows: string;
    open_alerts: string;
    system_acked: string;
    human_acked: string;
    resolved: string;
  }>(`
    SELECT
      (SELECT count(*) FILTER (WHERE alerts_per_day <= 2)::float / count(*)
         FROM alert_load_daily) AS load_ratio,
      (SELECT count(*) FILTER (WHERE status <> 'open')::float / count(*)
         FROM alert) AS ack_ratio,
      (SELECT count(*) FROM alert_load_daily) AS daily_rows,
      (SELECT count(*) FROM alert) AS alert_rows,
      (SELECT count(*) FROM alert WHERE status = 'open') AS open_alerts,
      (SELECT count(*) FROM alert
        WHERE status = 'ack'
          AND evidence->'fatigue'->>'reason' = 'duplicate_same_org_day_rule') AS system_acked,
      (SELECT count(*) FROM alert
        WHERE status = 'ack'
          AND evidence->'fatigue'->>'reason' IS DISTINCT FROM 'duplicate_same_org_day_rule') AS human_acked,
      (SELECT count(*) FROM alert WHERE status = 'resolved') AS resolved
  `);
  const row = r.rows[0];
  if (!row) throw new Error("mesure de fatigue d'alerte vide");
  return {
    loadRatio: row.load_ratio ?? 0,
    ackRatio: row.ack_ratio ?? 0,
    dailyRows: Number(row.daily_rows),
    alertRows: Number(row.alert_rows),
    openAlerts: Number(row.open_alerts),
    systemAcked: Number(row.system_acked),
    humanAcked: Number(row.human_acked),
    resolved: Number(row.resolved),
  };
}

export function objectifFatigueAtteint(mesure: AlertFatigueMeasure): boolean {
  return mesure.loadRatio >= 0.9 && mesure.ackRatio >= 0.5;
}

function pourcentage(value: number): string {
  return `${(value * 100).toFixed(1).replace(".", ",")} %`;
}

/** Ligne OBJECTIF unique, imprimée par le script de vérification. */
export function ligneObjectifFatigue(mesure: AlertFatigueMeasure): string {
  const verdict = objectifFatigueAtteint(mesure) ? "atteint" : "partiel";
  return (
    `OBJECTIF : ${verdict} — charge ${pourcentage(mesure.loadRatio)} / 90,0 % ` +
    `(${mesure.dailyRows} organisations-jours) ; acquittement ` +
    `${pourcentage(mesure.ackRatio)} / 50,0 % (${mesure.alertRows} alertes)`
  );
}
