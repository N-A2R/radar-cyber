/**
 * État de santé et backoff persistant des sources de collecte.
 *
 * Trois états, et seulement trois :
 *   - `ok`    : dernier run réussi, aucune attente ;
 *   - `rouge` : échec(s) récent(s), la source est en backoff et retentée plus tard ;
 *   - `morte` : seuil d'échecs consécutifs franchi, plus aucune tentative
 *               automatique (décision admin pour réactiver).
 *
 * Le backoff vit en base, pas dans une carte mémoire : un redémarrage ne doit
 * pas effacer l'historique d'échecs et transforms une source en difficulté en
 * source « jamais collectée » retentée à chaque tick. Les paliers viennent du
 * client HTTP (`backoffDelayMs`) pour garder une seule politique de délai.
 */
import { query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { backoffDelayMs } from "./http.js";

export type SanteSource = "ok" | "rouge" | "morte";

/** Au-delà (ou à égalité), la source est déclarée morte. */
export const SEUIL_ECHECS_MORTE = 5;

export type EtatSourceSante = {
  id: string;
  sante?: string | null;
  statut?: string | null;
  enabled?: boolean;
  echecs_consecutifs?: number | null;
  prochaine_tentative_at?: string | Date | null;
  last_ok_at?: string | Date | null;
  last_error_at?: string | Date | null;
};

export type IssueCollecte = {
  sante: SanteSource;
  echecs: number;
  delaiMs: number;
  morte: boolean;
};

/** Une source morte (statut déclaré ou santé calculée) ne se collecte plus. */
export function estMorte(s: EtatSourceSante): boolean {
  return s.statut === "morte" || s.sante === "morte";
}

/** État calculé après un échec, sans toucher à la base. */
export function santeApresEchec(echecsConsecutifs: number): SanteSource {
  return echecsConsecutifs >= SEUIL_ECHECS_MORTE ? "morte" : "rouge";
}

/** Délai avant la tentative suivante, en millisecondes (0 avant tout échec). */
export function delaiBackoffMs(echecsConsecutifs: number): number {
  return backoffDelayMs(echecsConsecutifs);
}

/** Temps restant avant qu'une source soit de nouveau éligible. */
export function attenteRestanteMs(s: EtatSourceSante, maintenant = Date.now()): number {
  if (!s.prochaine_tentative_at) return 0;
  const date = s.prochaine_tentative_at instanceof Date
    ? s.prochaine_tentative_at.getTime()
    : Date.parse(s.prochaine_tentative_at);
  if (!Number.isFinite(date)) return 0;
  return Math.max(0, date - maintenant);
}

/** Date de dernière activité, utilisée pour départager les sources à reprendre. */
export function derniereActiviteMs(s: EtatSourceSante): number {
  for (const value of [s.last_ok_at, s.last_error_at]) {
    if (!value) continue;
    const date = value instanceof Date ? value.getTime() : Date.parse(value);
    if (Number.isFinite(date)) return date;
  }
  return 0;
}

/** Succès : remise à zéro complète, avec les compteurs de rendement si fournis. */
export async function enregistrerSuccesSource(
  sourceId: string,
  stats?: { items: number; ajoutes: number },
): Promise<void> {
  await query(
    `UPDATE source
        SET sante = 'ok',
            echecs_consecutifs = 0,
            backoff_niveau = 0,
            prochaine_tentative_at = NULL,
            last_ok_at = now(),
            last_error = NULL,
            last_error_at = NULL,
            items_total = COALESCE($2, items_total),
            last_items = COALESCE($3, last_items)
      WHERE id = $1`,
    [sourceId, stats?.items ?? null, stats?.ajoutes ?? null],
  );
}

/**
 * Échec : incrémente le compteur, pose le backoff, bascule en rouge puis en
 * morte au seuil. Compteur, état et trace de mort sont dans la même transaction :
 * on ne peut pas avoir une source morte sans motif, ni un motif sans source.
 * Ne lève jamais — un trou de comptage ne doit pas faire perdre la collecte.
 */
export async function enregistrerEchecSource(
  sourceId: string,
  erreur: unknown,
  log: (msg: string) => void = () => {},
): Promise<IssueCollecte | null> {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  try {
    return await withTransaction(async (client) => {
      const r = await client.query<{ echecs_consecutifs: number; sante: string }>(
        `UPDATE source
            SET echecs_consecutifs = echecs_consecutifs + 1,
                sante = CASE WHEN echecs_consecutifs + 1 >= $2 THEN 'morte' ELSE 'rouge' END,
                prochaine_tentative_at = NULL,
                last_error_at = now(),
                last_error = $1
          WHERE id = $3 AND statut <> 'morte'
          RETURNING echecs_consecutifs, sante`,
        [message.slice(0, 2000), SEUIL_ECHECS_MORTE, sourceId],
      );
      const etat = r.rows[0];
      if (!etat) return null;
      const echecs = Number(etat.echecs_consecutifs);
      const delaiMs = delaiBackoffMs(echecs);
      // Le délai dépend du rang de l'échec : on l'écrit après l'UPDATE, dans la
      // même transaction, pour éviter un SQL plus complexe qu'il ne faut.
      await client.query(
        `UPDATE source SET backoff_niveau = LEAST($2::int, $3::int),
            prochaine_tentative_at = now() + ($4::bigint * interval '1 millisecond')
          WHERE id = $1`,
        [sourceId, echecs, SEUIL_ECHECS_MORTE - 1, delaiMs],
      );
      if (etat.sante !== "morte") {
        return { sante: "rouge", echecs, delaiMs, morte: false };
      }

      const morte = await client.query(
        `UPDATE source
            SET statut = 'morte',
                enabled = false,
                derniere_erreur = $1,
                disabled_at = COALESCE(disabled_at, now()),
                disabled_reason = $1
          WHERE id = $2 AND statut = 'active'
          RETURNING id`,
        [message.slice(0, 1000), sourceId],
      );
      if (!morte.rows[0]) return { sante: "morte", echecs, delaiMs, morte: false };

      const trace = await consignerAvec(
        (sql, params) => client.query(sql, params as unknown[]),
        {
          kind: "source.morte",
          subject: sourceId,
          summary: `source ${sourceId} marquée morte après ${echecs} échecs consécutifs — ${message}`,
          actor: `collecteur:${sourceId}`,
          payload: { seuil: SEUIL_ECHECS_MORTE, echecsConsecutifs: echecs, raison: message.slice(0, 300) },
        },
      );
      if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
      return { sante: "morte", echecs, delaiMs, morte: true };
    });
  } catch (e) {
    log(`santé ${sourceId} : échec non comptabilisé — ${String(e)}`);
    return null;
  }
}

/** Réactivation (admin) : efface backoff, compteur et état d'erreur. */
export async function reinitialiserSanteSource(sourceId: string): Promise<void> {
  await query(
    `UPDATE source
        SET sante = 'ok', echecs_consecutifs = 0, backoff_niveau = 0,
            prochaine_tentative_at = NULL, last_error = NULL, last_error_at = NULL
      WHERE id = $1`,
    [sourceId],
  );
}

export type EtatSanteLu = {
  sante: string;
  statut: string;
  enabled: boolean;
  echecs_consecutifs: number;
  prochaine_tentative_at: string | null;
};

export async function lireSanteSource(sourceId: string): Promise<EtatSanteLu | null> {
  const r = await query<EtatSanteLu>(
    `SELECT sante, statut, enabled, echecs_consecutifs, prochaine_tentative_at
       FROM source WHERE id = $1`,
    [sourceId],
  );
  return r.rows[0] ?? null;
}
