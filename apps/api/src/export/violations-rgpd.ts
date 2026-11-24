/**
 * Export mensuel du registre des violations de données personnelles.
 *
 * Une ligne par violation dont la prise de connaissance est dans le mois
 * demandé. Le fichier porte un nom daté (`violations_AAAA-MM.csv`) et une
 * empreinte SHA-256 calculée sur les octets exacts du CSV : la même fonction
 * sert la route HTTP, le script d'export sur disque et le contrôle externe.
 * Aucune donnée personnelle : identifiants publics, type d'organisation,
 * dates et statut uniquement — ni titre, résumé, victime ni corps brut.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";

export const ENTETE_CSV =
  "reference,organisation_id,organisation_type,departement,famille,source_id,date_prise_connaissance,echeance_72h,statut,date_notification,source_url\r\n";

type Ligne = {
  reference: string;
  organisation_id: string;
  organisation_type: string;
  departement: string;
  famille: string;
  source_id: string;
  date_prise_connaissance: string;
  echeance_72h: string;
  statut: string;
  date_notification: string;
  source_url: string;
};

export type ExportViolations = {
  mois: string;
  fichier: string;
  corps: string;
  sha256: string;
  lignes: number;
};

/** $1 = début du mois UTC, $2 = début du mois suivant (borne exclue). */
const SQL_EXPORT = `
  SELECT v.reference,
         COALESCE(v.org_id::text, '') AS organisation_id,
         v.org_kind AS organisation_type,
         COALESCE(v.dept, '') AS departement,
         v.famille,
         COALESCE(v.source_id, '') AS source_id,
         to_char(v.date_prise_connaissance AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date_prise_connaissance,
         to_char(v.echeance_72h AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS echeance_72h,
         v.statut,
         COALESCE(to_char(v.date_notification AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '') AS date_notification,
         COALESCE(v.source_url, '') AS source_url
    FROM violation_rgpd v
   WHERE v.date_prise_connaissance >= $1::timestamptz
     AND v.date_prise_connaissance <  $2::timestamptz
   ORDER BY v.date_prise_connaissance ASC, v.id ASC`;

export function verifierMois(mois: string): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(mois)) {
    throw new TypeError(`mois invalide (attendu AAAA-MM) : ${mois}`);
  }
  return mois;
}

/** Bornes UTC du mois : aucune dépendance au fuseau de la base ou du serveur. */
export function bornesMois(mois: string): [string, string] {
  verifierMois(mois);
  const [annee, numero] = mois.split("-").map(Number) as [number, number];
  return [
    new Date(Date.UTC(annee, numero - 1, 1)).toISOString(),
    new Date(Date.UTC(annee, numero, 1)).toISOString(),
  ];
}

export function celluleCsv(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return "";
  const texte = String(valeur);
  return /[",\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function construireExport(moisBrut: string = moisCourant()): Promise<ExportViolations> {
  const mois = verifierMois(moisBrut);
  const [debut, fin] = bornesMois(mois);
  const resultat = await query<Ligne>(SQL_EXPORT, [debut, fin]);
  const corps = resultat.rows.map((ligne) => [
    ligne.reference, ligne.organisation_id, ligne.organisation_type, ligne.departement,
    ligne.famille, ligne.source_id, ligne.date_prise_connaissance, ligne.echeance_72h,
    ligne.statut, ligne.date_notification, ligne.source_url,
  ].map(celluleCsv).join(",") + "\r\n").join("");
  const contenu = ENTETE_CSV + corps;
  return {
    mois,
    fichier: `violations_${mois}.csv`,
    corps: contenu,
    sha256: createHash("sha256").update(Buffer.from(contenu, "utf8")).digest("hex"),
    lignes: resultat.rows.length,
  };
}

/** Empreinte d'un fichier déjà écrit, pour le contrôle `--check`. */
export function empreinteFichier(contenu: Buffer | string): string {
  return createHash("sha256").update(contenu).digest("hex");
}
