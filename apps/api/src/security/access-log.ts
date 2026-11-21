/**
 * Journal des accès API : qui a appelé quoi, avec quel résultat et quelle
 * décision de contrôle. Les données directement identifiantes (adresse IP,
 * user-agent) n'y sont jamais écrites en clair : on n'en garde qu'une
 * empreinte SHA-256 poivrée, ce qui suffit à corréler deux accès sans
 * reconstituer un profil de navigation.
 *
 * L'écriture ne doit jamais faire échouer une requête : en cas d'indisponibilité
 * de la base, l'incident est consigné dans les logs du serveur et la réponse
 * suit son cours. Le journal de vérité garde, lui, les refus (voir rbac.ts).
 */
import { createHash, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { query } from "../db.js";

const PEPPER = process.env.RADAR_AUDIT_PEPPER ?? "radar-audit-pepper-a-changer-en-production";
if (process.env.NODE_ENV === "production" && !process.env.RADAR_AUDIT_PEPPER) {
  throw new Error("RADAR_AUDIT_PEPPER is required in production (access log hashing)");
}

export function empreinteAudit(valeur: string): string {
  return createHash("sha256").update(`${PEPPER}:${valeur}`).digest("hex").slice(0, 32);
}

/** Identifiant de corrélation : fourni par le client ou généré par le serveur. */
export function correlationId(req: FastifyRequest): string {
  const brut = req.headers["x-request-id"];
  const candidat = Array.isArray(brut) ? brut[0] : brut;
  return candidat !== undefined && /^[A-Za-z0-9._:-]{1,64}$/.test(candidat) ? candidat : randomUUID();
}

export type DecisionAcces = "autorise" | "refuse";

export type AccesEnregistre = {
  methode: string;
  route: string;
  statut: number;
  decision: DecisionAcces;
  motif: string | null;
  niveauRequis: string;
  role: string | null;
  userId: number | null;
  acteur: string;
  ipHash: string;
  userAgentHash: string | null;
  correlationId: string;
  dureeMs: number;
};

/** Écrit une ligne. Ne lève jamais : l'audit ne bloque pas le service. */
export async function enregistrerAcces(entree: AccesEnregistre): Promise<boolean> {
  try {
    await query(
      `INSERT INTO access_log
         (methode, route, statut, decision, motif, niveau_requis, role, user_id,
          acteur, ip_hash, user_agent_hash, correlation_id, duree_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entree.methode, entree.route, entree.statut, entree.decision, entree.motif,
        entree.niveauRequis, entree.role, entree.userId, entree.acteur, entree.ipHash,
        entree.userAgentHash, entree.correlationId, Math.max(0, Math.round(entree.dureeMs)),
      ],
    );
    return true;
  } catch (error) {
    console.error("journal des accès : écriture impossible", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export type AccessLogRow = {
  id: number;
  recorded_at: string;
  methode: string;
  route: string;
  statut: number;
  decision: DecisionAcces;
  motif: string | null;
  niveau_requis: string;
  role: string | null;
  acteur: string;
  correlation_id: string;
  duree_ms: number;
};

/** Relecture administrateur, filtrable et bornée — aucun secret n'est exposé. */
export async function lireAcces(options: {
  depuis?: string;
  jusqua?: string;
  acteur?: string;
  decision?: DecisionAcces;
  route?: string;
  correlationId?: string;
  limite?: number;
  offset?: number;
} = {}): Promise<{ items: AccessLogRow[]; total: number; limite: number; offset: number }> {
  const conditions: string[] = [];
  const valeurs: unknown[] = [];
  const ajouter = (sql: string, valeur: unknown) => {
    valeurs.push(valeur);
    conditions.push(sql.replace("?", `$${valeurs.length}`));
  };
  if (options.depuis) ajouter("recorded_at >= ?", options.depuis);
  if (options.jusqua) ajouter("recorded_at <= ?", options.jusqua);
  if (options.acteur) ajouter("acteur = ?", options.acteur);
  if (options.decision) ajouter("decision = ?", options.decision);
  if (options.route) ajouter("route = ?", options.route);
  if (options.correlationId) ajouter("correlation_id = ?", options.correlationId);
  const ou = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limite = Math.min(Math.max(options.limite ?? 100, 1), 500);
  const offset = Math.min(Math.max(options.offset ?? 0, 0), 1_000_000);

  const [lignes, total] = await Promise.all([
    query<AccessLogRow>(
      `SELECT id, recorded_at::text AS recorded_at, methode, route, statut, decision, motif,
              niveau_requis, role, acteur, correlation_id, duree_ms
         FROM access_log ${ou}
        ORDER BY recorded_at DESC, id DESC
        LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
      [...valeurs, limite, offset],
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM access_log ${ou}`, valeurs),
  ]);
  return { items: lignes.rows ?? [], total: total.rows[0]?.n ?? 0, limite, offset };
}
