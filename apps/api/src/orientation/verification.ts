/**
 * Contrôle de disponibilité du guichet d'orientation des collectivités.
 *
 * Le guichet 17Cyber est NATIONAL et partagé par toutes les collectivités :
 * le contrôle interroge réellement l'URL de chaque alerte de collectivité en
 * HTTP, et n'écrit la date (`lien_verifie_le`) que si toutes répondent 200.
 * Un échec laisse la date précédente intacte et remonte `conforme: false`.
 *
 * Aucune donnée personnelle n'est lue ni stockée : seuls l'identifiant de
 * l'alerte et son URL de guichet sortent de la base.
 */
import {
  ACTIONS_ORIENTATION_COLLECTIVITE,
  ORIENTATION_FRAICHEUR_MS,
  URL_ORIENTATION_COLLECTIVITE,
} from "./collectivite.js";

/** Connexion minimale : compatible avec `query` de db.js et un `pg.Client`. */
export type DbRequete = <T>(
  sql: string,
  params?: unknown[],
) => Promise<{ rows: T[]; rowCount: number | null }>;

export type LienVerifie = {
  alerte_id: number;
  url: string;
  code_http: number;
  verifie_le: string;
};

export type VerificationOrientation = {
  /** Alertes de collectivité inspectées. */
  alertes: number;
  /** Liens ayant répondu 200. */
  ok: number;
  /** Nombre minimal attendu par le critère de sortie. */
  cible: number;
  /** Date commune écrite dans `lien_verifie_le` (ISO 8601). */
  verifie_le: string;
  /** Lignes effectivement mises à jour (0 si le contrôle échoue). */
  mises_a_jour: number;
  conforme: boolean;
  liens: LienVerifie[];
};

const SELECT_COLLECTIVITES = `
  SELECT a.id, a.url_orientation
    FROM alert a JOIN org o ON o.id = a.org_id
   WHERE o.kind = 'collectivite'
   ORDER BY a.id`;

const SELECT_DERNIERE_VERIFICATION = `
  SELECT min(a.lien_verifie_le) AS dernier
    FROM alert a JOIN org o ON o.id = a.org_id
   WHERE o.kind = 'collectivite'`;

async function interrogeGuichet(url: string, fetchImpl: typeof fetch): Promise<number> {
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: { "user-agent": "RadarCyber-VerificationOrientation/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    // Un statut sans corps lisible n'est pas une preuve de disponibilité.
    await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Interroge chaque lien et, si le lot est complet et intégralement en 200,
 * date le résultat dans `lien_verifie_le` pour toutes les collectivités.
 */
export async function verifierOrientationCollectivites(
  db: DbRequete,
  opts: {
    fetchImpl?: typeof fetch;
    cible?: number;
    now?: () => Date;
  } = {},
): Promise<VerificationOrientation> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cible = opts.cible ?? 20;
  const now = opts.now ?? (() => new Date());
  const verifieLe = now().toISOString();

  const { rows } = await db<{ id: number; url_orientation: string | null }>(SELECT_COLLECTIVITES);
  const liens: LienVerifie[] = [];
  for (const alerte of rows) {
    const url = alerte.url_orientation?.trim() || URL_ORIENTATION_COLLECTIVITE;
    liens.push({
      alerte_id: alerte.id,
      url,
      code_http: await interrogeGuichet(url, fetchImpl),
      verifie_le: verifieLe,
    });
  }

  const tousCanoniques = liens.every((l) => l.url === URL_ORIENTATION_COLLECTIVITE);
  const ok = liens.filter((l) => l.code_http === 200).length;
  const conforme = rows.length >= cible && ok === rows.length && tousCanoniques;

  let misesAJour = 0;
  if (conforme) {
    const maj = await db(
      `UPDATE alert a
          SET url_orientation = $1,
              actions = $2::jsonb,
              lien_verifie_le = $3::timestamptz,
              updated_at = now()
         FROM org o
        WHERE o.id = a.org_id AND o.kind = 'collectivite'`,
      [URL_ORIENTATION_COLLECTIVITE, JSON.stringify(ACTIONS_ORIENTATION_COLLECTIVITE), verifieLe],
    );
    misesAJour = maj.rowCount ?? 0;
  }

  return {
    alertes: rows.length,
    ok,
    cible,
    verifie_le: verifieLe,
    mises_a_jour: misesAJour,
    conforme,
    liens,
  };
}

/** Vrai si aucune date n'existe ou si la plus ancienne dépasse la fraîcheur. */
export async function orientationVerificationDue(
  db: DbRequete,
  opts: { now?: () => Date; fraicheurMs?: number } = {},
): Promise<boolean> {
  const { rows } = await db<{ dernier: Date | string | null }>(SELECT_DERNIERE_VERIFICATION);
  const dernier = rows[0]?.dernier;
  if (!dernier) return true;
  const date = dernier instanceof Date ? dernier : new Date(dernier);
  if (Number.isNaN(date.getTime())) return true;
  const now = (opts.now ?? (() => new Date()))().getTime();
  return now - date.getTime() >= (opts.fraicheurMs ?? ORIENTATION_FRAICHEUR_MS);
}
