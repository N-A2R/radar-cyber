/**
 * Rapports NIS2 : brouillons et exports datés d'un même incident.
 *
 * La migration 215 crée les deux brouillons (72 h et 1 mois) dès qu'un
 * `event` devient un incident confirmé. Ce module ne ressaisit rien : il lit
 * les sections déjà produites en base, les contrôle, puis publie un export
 * daté par incident et par régime. Aucun titre, résumé, URL ou identité ne
 * transite ici : seuls les champs structurés du brouillon sont rendus.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "../db.js";

export const NIS2_REGIMES = ["NIS2_72h", "NIS2_1mois"] as const;
export type Nis2Regime = (typeof NIS2_REGIMES)[number];

export const NIS2_SECTIONS = ["contexte", "impact", "mesures"] as const;
export type Nis2Section = (typeof NIS2_SECTIONS)[number];
export type SectionsNis2 = Record<Nis2Section, string>;

/** Critère du contrôle externe, exécuté tel quel. */
export const CRITERE_BROUILLONS_NIS2 =
  "SELECT count(*) FROM notification_brouillon WHERE regime IN ('NIS2_72h','NIS2_1mois') AND (echeance IS NULL OR payload->>'mesures' IS NULL OR payload->>'impact' IS NULL OR source_event_id IS NULL);";

const TITRES: Readonly<Record<Nis2Regime, string>> = {
  NIS2_72h: "Rapport NIS2 intermédiaire (72 heures)",
  NIS2_1mois: "Rapport NIS2 final (1 mois)",
};

export type BrouillonNis2 = {
  id: string;
  source_event_id: string;
  regime: Nis2Regime;
  echeance: Date;
  payload: Record<string, unknown>;
  /** Portée déclarée de la source : jamais inférée d'un titre ni d'un département d'incident. */
  source_region: string | null;
  source_department: string | null;
};

export type ExportNis2 = {
  id: string;
  source_event_id: string;
  regime: Nis2Regime;
  exporte_le: Date;
  sections: SectionsNis2;
  contenu: string;
  sha256: string;
  fichier?: string;
};

function estRegime(valeur: unknown): valeur is Nis2Regime {
  return typeof valeur === "string" && (NIS2_REGIMES as readonly string[]).includes(valeur);
}

function date(valeur: unknown): Date {
  if (valeur instanceof Date) return valeur;
  const parsed = new Date(String(valeur));
  if (Number.isNaN(parsed.getTime())) throw new Error(`date invalide : ${String(valeur)}`);
  return parsed;
}

/** Portée de la source, calculée depuis ses seuls champs déclarés. */
export function perimetreSource(region: string | null, department: string | null): string {
  const code = (valeur: string | null): string | null =>
    valeur && /^[A-Za-z0-9_-]{1,20}$/.test(valeur) ? valeur : null;
  if (code(region) === "national") return "nationale";
  const dept = code(department);
  if (dept) return `locale (département ${dept})`;
  if (code(region)) return "régionale";
  return "portée non déclarée";
}

/** Échoue fermé : un brouillon incomplet ne doit jamais produire d'export. */
export function sectionsObligatoires(payload: Record<string, unknown> | null | undefined): SectionsNis2 {
  if (!payload || typeof payload !== "object") throw new Error("brouillon NIS2 sans payload");
  const sections = {} as SectionsNis2;
  for (const cle of NIS2_SECTIONS) {
    const valeur = payload[cle];
    if (typeof valeur !== "string" || valeur.trim().length === 0) {
      throw new Error(`section NIS2 manquante : ${cle}`);
    }
    sections[cle] = valeur.trim();
  }
  return sections;
}

export function renduNis2(brouillon: BrouillonNis2, sections: SectionsNis2, exporteLe: Date): string {
  if (!estRegime(brouillon.regime)) throw new Error(`régime NIS2 inconnu : ${String(brouillon.regime)}`);
  const lignes = [
    `# ${TITRES[brouillon.regime]}`,
    "",
    `- Incident source : ${brouillon.source_event_id}`,
    `- Date d'émission : ${exporteLe.toISOString()}`,
    `- Échéance de notification : ${date(brouillon.echeance).toISOString()}`,
    `- Périmètre de la source : ${perimetreSource(brouillon.source_region ?? null, brouillon.source_department ?? null)}`,
    "",
    "## 1. Contexte et nature de l'incident",
    "",
    sections.contexte,
    "",
    "## 2. Impact",
    "",
    sections.impact,
    "",
    "## 3. Mesures prises",
    "",
    sections.mesures,
    "",
    "Rapport produit depuis les champs structurés de l'incident : ni donnée personnelle, ni récit de victime, ni URL d'article.",
    "",
  ];
  return lignes.join("\n");
}

export type OptionsExportNis2 = {
  /** Incident à exporter ; sans filtre, tous les brouillons disponibles. */
  sourceEventId?: string | number;
  regimes?: readonly Nis2Regime[];
  exporteLe?: Date;
  /** Dossier de fichiers Markdown ; omis, l'export reste en base. */
  dossierSortie?: string;
};

/**
 * Publie un export daté par brouillon. Le contenu est stocké avec son empreinte
 * et, si un dossier est fourni, écrit sur disque sous un nom daté.
 */
export async function exporterRapportsNis2(options: OptionsExportNis2 = {}): Promise<ExportNis2[]> {
  const exporteLe = options.exporteLe ?? new Date();
  const regimes = options.regimes ? [...options.regimes] : [...NIS2_REGIMES];
  for (const regime of regimes) {
    if (!estRegime(regime)) throw new Error(`régime NIS2 inconnu : ${String(regime)}`);
  }
  const resultat = await query<BrouillonNis2>(
    `SELECT b.id::text, b.source_event_id::text, b.regime, b.echeance, b.payload,
            s.region AS source_region, s.department AS source_department
       FROM notification_brouillon b
       LEFT JOIN event e ON e.id = b.source_event_id
       LEFT JOIN source s ON s.id = e.source_id
      WHERE ($1::bigint IS NULL OR b.source_event_id = $1)
        AND b.regime = ANY($2::text[])
      ORDER BY b.source_event_id::bigint, b.regime`,
    [options.sourceEventId === undefined ? null : String(options.sourceEventId), regimes],
  );

  if (options.dossierSortie) await mkdir(options.dossierSortie, { recursive: true });
  const exports: ExportNis2[] = [];
  for (const brouillon of resultat.rows) {
    const sections = sectionsObligatoires(brouillon.payload);
    const contenu = renduNis2(brouillon, sections, exporteLe);
    const sha256 = createHash("sha256").update(contenu, "utf8").digest("hex");
    const ecriture = await query<{
      id: string;
      source_event_id: string;
      regime: Nis2Regime;
      exporte_le: Date;
      sections: SectionsNis2;
      contenu: string;
      sha256: string;
    }>(
      `INSERT INTO rapport_nis2_export (source_event_id, regime, exporte_le, sections, contenu, sha256)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id::text, source_event_id::text, regime, exporte_le, sections, contenu, sha256`,
      [brouillon.source_event_id, brouillon.regime, exporteLe, JSON.stringify(sections), contenu, sha256],
    );
    const ligne = ecriture.rows[0];
    if (!ligne) throw new Error("export NIS2 non enregistré");
    const exportNis2: ExportNis2 = { ...ligne, exporte_le: date(ligne.exporte_le) };
    if (options.dossierSortie) {
      const horodatage = exporteLe.toISOString().replace(/[:.]/g, "-");
      const nom = `rapport-nis2-${ligne.regime.toLowerCase()}-${ligne.source_event_id}-${horodatage}.md`;
      await writeFile(join(options.dossierSortie, nom), contenu, "utf8");
      exportNis2.fichier = nom;
    }
    exports.push(exportNis2);
  }
  return exports;
}

/** Nombre de brouillons incomplets : la sortie brute du juge externe. */
export async function compteurBrouillonsIncomplets(): Promise<number> {
  const resultat = await query<{ count: string }>(CRITERE_BROUILLONS_NIS2);
  return Number(resultat.rows[0]?.count ?? -1);
}
