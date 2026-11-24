/**
 * Recensement REC : services essentiels de Nouvelle-Aquitaine et autorité
 * sectorielle à prévenir sous 24 heures.
 *
 * La migration 217 porte les données et le contrôle d'intégrité : ce module ne
 * fait que les lire. Le critère du juge externe est conservé mot pour mot et
 * exécuté tel quel, sans réécriture dans un helper.
 */
import { query } from "../db.js";

/** Critère du contrôle externe, exécuté tel quel. */
export const CRITERE_ORG_REC =
  "SELECT count(*) FROM org o WHERE o.kind='operateur_critique' AND (o.id NOT IN (SELECT org_id FROM org_rec) OR o.secteur IS NULL);";

export const PORTEE_SOURCES_REC = [
  "departementale",
  "regionale",
  "nationale",
  "interne",
] as const;
export type PorteeSourceRec = (typeof PORTEE_SOURCES_REC)[number];

export type OperateurCritiqueRec = {
  id: number;
  name: string;
  dept: string | null;
  secteur: string | null;
  secteurRec: string;
  autoriteCompetente: string;
  dateRecensement: string;
  sourceId: string;
  sourceUrl: string;
  sourceDate: string;
  sourcePortee: PorteeSourceRec;
  notificationHeures: number;
};

export type CompteursRec = {
  operateurs: number;
  sansRec: number;
  sansSecteur: number;
  fichesIncompletes: number;
  sourcesNonDatees: number;
};

type LigneRec = {
  id: number;
  name: string;
  dept: string | null;
  secteur: string | null;
  secteur_rec: string;
  autorite_competente: string;
  date_recensement: string;
  source_id: string;
  source_url: string;
  source_date: string;
  source_portee: PorteeSourceRec;
  notification_heures: number;
};

// Les dates sont formatées en texte par le SQL : un `date` PostgreSQL arrive
// comme Date à minuit local et toISOString() décalerait d'un jour les fuseaux
// à l'ouest de UTC.

function convertir(ligne: LigneRec): OperateurCritiqueRec {
  return {
    id: ligne.id,
    name: ligne.name,
    dept: ligne.dept,
    secteur: ligne.secteur,
    secteurRec: ligne.secteur_rec,
    autoriteCompetente: ligne.autorite_competente,
    dateRecensement: ligne.date_recensement,
    sourceId: ligne.source_id,
    sourceUrl: ligne.source_url,
    sourceDate: ligne.source_date,
    sourcePortee: ligne.source_portee,
    notificationHeures: ligne.notification_heures,
  };
}

/** Opérateurs qualifiés, avec l'autorité à prévoir et la preuve datée. */
export async function listOperateursCritiques(): Promise<OperateurCritiqueRec[]> {
  const { rows } = await query<LigneRec>(
    `SELECT o.id, o.name, o.dept, o.secteur, r.secteur_rec, r.autorite_competente,
            to_char(r.date_recensement, 'YYYY-MM-DD') AS date_recensement,
            r.source_id, r.source_url,
            to_char(r.source_date, 'YYYY-MM-DD') AS source_date,
            r.source_portee, r.notification_heures
       FROM org o
       JOIN org_rec r ON r.org_id = o.id
      WHERE o.kind = 'operateur_critique'
      ORDER BY o.dept, o.name`,
  );
  return rows.map(convertir);
}

/** Contrôles complémentaires au critère brut, pour le rapport et les tests. */
export async function compteursRec(): Promise<CompteursRec> {
  const { rows } = await query<{
    operateurs: string;
    sans_rec: string;
    sans_secteur: string;
    fiches_incompletes: string;
    sources_non_datees: string;
  }>(
    `SELECT
       (SELECT count(*) FROM org WHERE kind = 'operateur_critique') AS operateurs,
       (SELECT count(*) FROM org o WHERE o.kind = 'operateur_critique'
          AND o.id NOT IN (SELECT org_id FROM org_rec)) AS sans_rec,
       (SELECT count(*) FROM org o WHERE o.kind = 'operateur_critique'
          AND o.secteur IS NULL) AS sans_secteur,
       (SELECT count(*) FROM org_rec
          WHERE btrim(secteur_rec) = '' OR btrim(autorite_competente) = ''
             OR date_recensement IS NULL OR btrim(source_url) = ''
             OR source_date IS NULL OR notification_heures <> 24) AS fiches_incompletes,
       (SELECT count(*) FROM org_rec r JOIN source s ON s.id = r.source_id
          WHERE s.region = 'national' AND r.source_portee <> 'nationale') AS sources_non_datees`,
  );
  const ligne = rows[0];
  if (!ligne) throw new Error("compteurs REC : aucune ligne renvoyée");
  return {
    operateurs: Number(ligne.operateurs),
    sansRec: Number(ligne.sans_rec),
    sansSecteur: Number(ligne.sans_secteur),
    fichesIncompletes: Number(ligne.fiches_incompletes),
    sourcesNonDatees: Number(ligne.sources_non_datees),
  };
}
