/**
 * Accès base de la certification d'identité légale.
 *
 * Les écritures sont étroites : une seule organisation à la fois, avec un
 * critère qui ne remplace jamais un SIREN déjà vérifié. Le décliage d'un
 * événement conserve la raison dans son `evidence` : une attribution retirée
 * doit rester explicable, pas disparaître silencieusement.
 */
import { ingestQuery, query } from "../db.js";

export interface OrgCitee {
  id: number;
  name: string;
  siren: string | null;
  dept: string | null;
  city: string | null;
  siren_verifie_le: Date | null;
  evenements: number;
}

/** Toutes les organisations actuellement citées par au moins un événement. */
export async function lireOrganisationsCitees(): Promise<OrgCitee[]> {
  const { rows } = await query<OrgCitee>(
    `SELECT o.id, o.name, o.siren, o.dept, o.city, o.siren_verifie_le,
            (SELECT count(*) FROM event e WHERE e.org_id = o.id)::int AS evenements
       FROM org o
      WHERE o.id IN (SELECT org_id FROM event WHERE org_id IS NOT NULL)
      ORDER BY o.id`,
  );
  return rows;
}

/** Le critère exact, exécutable tel quel par un contrôle externe. */
export async function compterOrganisationsNonVerifiees(): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM org o
      WHERE o.id IN (SELECT org_id FROM event)
        AND (o.siren IS NULL OR o.siren_verifie_le IS NULL OR length(o.siren) <> 9)`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** SIREN déjà porté par une autre organisation : cible d'une fusion, pas d'une copie. */
export async function proprietaireDuSiren(siren: string, orgId: number): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    "SELECT id FROM org WHERE siren = $1 AND id <> $2 LIMIT 1",
    [siren, orgId],
  );
  return rows[0]?.id ?? null;
}

export interface Verification {
  orgId: number;
  siren: string;
  nomOfficiel: string;
  /** Renomme l'organisation quand sa dénomination courante n'est pas la raison sociale. */
  renommer?: boolean;
}

/** Horodate la vérification ; n'écrase jamais une vérification déjà faite. */
export async function enregistrerVerification(verification: Verification): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE org
        SET siren = $2,
            siren_verifie_le = now(),
            siren_nom_officiel = $3,
            name = CASE WHEN $4 THEN $3 ELSE name END
      WHERE id = $1
        AND (siren_verifie_le IS NULL OR siren = $2)`,
    [
      verification.orgId,
      verification.siren,
      verification.nomOfficiel,
      verification.renommer === true,
    ],
  );
  return (rowCount ?? 0) > 0;
}

/** Rapporte les événements d'une organisation sans identité légale vers une autre. */
export async function fusionnerEvenements(orgSource: number, orgCible: number): Promise<number> {
  const { rowCount } = await query(
    `UPDATE event e SET org_id = $2
      WHERE e.org_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM event e2
           WHERE e2.org_id = $2 AND e2.dedup_key = e.dedup_key
        )`,
    [orgSource, orgCible],
  );
  return rowCount ?? 0;
}

/** Retire une attribution non vérifiée en conservant la raison du retrait. */
export async function declierEvenements(orgIds: readonly number[], motif: string): Promise<number> {
  if (orgIds.length === 0) return 0;
  const { rowCount } = await query(
    `WITH cibles AS (
       SELECT id, org_id, dedup_key FROM event
        WHERE org_id = ANY($1::int[]) AND org_id IS NOT NULL
     ), decroches AS (
       UPDATE event e SET org_id = NULL FROM cibles c WHERE e.id = c.id
       RETURNING e.id, e.dedup_key, c.org_id
     ), journalises AS (
       INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
       SELECT 'event.rattachement', dedup_key,
              'certification SIREN : attribution non vérifiée retirée',
              jsonb_build_object('orgId', NULL, 'orgRetiree', org_id, 'reason', $2::text),
              'humain:certification-siren', now()
         FROM decroches
     )
     INSERT INTO identite_legale_decrochage (event_id, motif)
     SELECT id, $2::text FROM decroches
     ON CONFLICT (event_id) DO NOTHING`,
    [[...orgIds], motif],
  );
  return rowCount ?? 0;
}

export interface OrgEchantillon {
  id: number;
  name: string;
  siren: string;
}

/** Tirage aléatoire pour le contrôle des SIREN déjà présents dans le référentiel. */
export async function echantillonSirens(limite: number): Promise<OrgEchantillon[]> {
  const { rows } = await ingestQuery<OrgEchantillon>(
    `SELECT id, name, siren FROM org
      WHERE siren ~ '^[0-9]{9}$'
      ORDER BY random()
      LIMIT $1`,
    [limite],
  );
  return rows;
}
