/**
 * Dossiers DORA pré-remplis au format EBA Annexe I.
 *
 * La migration 217 crée, dès qu'un `event` devient un incident confirmé, une
 * ligne `export_dora` avec ses trois horodatages (classification, dossier
 * initial, dossier intermédiaire) et son dossier JSON. Ce module ne ressaisit
 * aucun champ : il valide le dossier contre le schéma de l'Annexe I, vérifie
 * l'horloge 4 h / 72 h, écrit les fichiers `dora_AAAA-MM-JJ_ID.json` et
 * enregistre l'empreinte des octets livrés.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import { query } from "../db.js";

/** Critère du contrôle externe, exécuté tel quel. */
export const CRITERE_EXPORT_DORA =
  "SELECT count(*) FROM export_dora WHERE classified_at IS NULL OR initial_at>classified_at+interval '4 hours' OR intermediate_at>classified_at+interval '72 hours';";

const SCHEMA_URL = new URL("./dora-eba-annexe-i.schema.json", import.meta.url);
const QUATRE_HEURES = 4 * 60 * 60 * 1000;
const SOIXANTE_DOUZE_HEURES = 72 * 60 * 60 * 1000;

const schema = JSON.parse(readFileSync(SCHEMA_URL, "utf8")) as object;
const ajv = new Ajv({ allErrors: true, strict: false });
const validerDossierBrut: ValidateFunction = ajv.compile(schema);

export type DossierEba = Record<string, unknown>;

export type LigneExportDora = {
  id: string;
  source_event_id: string;
  classified_at: Date;
  initial_at: Date;
  intermediate_at: Date;
  dossier: DossierEba;
  fichier: string;
  sha256: string | null;
};

export type ExportDora = {
  id: string;
  sourceEventId: string;
  fichier: string;
  chemin?: string;
  sha256: string;
  dossier: DossierEba;
};

function date(valeur: unknown, champ: string): Date {
  const parsed = valeur instanceof Date ? valeur : new Date(String(valeur));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${champ} invalide : ${String(valeur)}`);
  return parsed;
}

/** Échoue fermé : un dossier incomplet ne doit jamais être publié. */
export function validerDossier(dossier: unknown): DossierEba {
  if (!validerDossierBrut(dossier)) {
    const erreurs = (validerDossierBrut.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalide"}`)
      .join(" ; ");
    throw new Error(`dossier EBA Annexe I invalide : ${erreurs}`);
  }
  return dossier as DossierEba;
}

/** L'horloge est contrôlée en plus du schéma : la base seule ne suffit pas. */
export function verifierHorloge(ligne: LigneExportDora): void {
  const classification = date(ligne.classified_at, "classified_at").getTime();
  const initial = date(ligne.initial_at, "initial_at").getTime();
  const intermediaire = date(ligne.intermediate_at, "intermediate_at").getTime();
  if (initial < classification || initial - classification > QUATRE_HEURES) {
    throw new Error(`horloge 4 h violée pour ${ligne.fichier}`);
  }
  if (intermediaire < initial || intermediaire - classification > SOIXANTE_DOUZE_HEURES) {
    throw new Error(`horloge 72 h violée pour ${ligne.fichier}`);
  }
}

/** Octets exacts du fichier : l'empreinte couvre le JSON tel que livré. */
export function contenuDora(dossier: DossierEba): string {
  return `${JSON.stringify(dossier, null, 2)}\n`;
}

export type OptionsExportDora = {
  /** Incident à exporter ; sans filtre, tous les dossiers disponibles. */
  sourceEventId?: string | number;
  /** Dossier de fichiers JSON ; omis, les dossiers restent en base. */
  dossierSortie?: string;
};

/**
 * Valide puis publie un dossier par incident. Sans `dossierSortie`, le
 * contrôle reste en base (utile pour le `--check` du juge externe).
 */
export async function exporterDossiersDora(options: OptionsExportDora = {}): Promise<ExportDora[]> {
  const lignes = await query<LigneExportDora>(
    `SELECT id::text, source_event_id::text, classified_at, initial_at, intermediate_at,
            dossier, fichier, sha256
       FROM export_dora
      WHERE ($1::bigint IS NULL OR source_event_id = $1)
      ORDER BY source_event_id::bigint`,
    [options.sourceEventId === undefined ? null : String(options.sourceEventId)],
  );

  if (options.dossierSortie) await mkdir(options.dossierSortie, { recursive: true });
  const exports: ExportDora[] = [];
  for (const ligne of lignes.rows) {
    validerDossier(ligne.dossier);
    verifierHorloge(ligne);
    const contenu = contenuDora(ligne.dossier);
    const sha256 = createHash("sha256").update(contenu, "utf8").digest("hex");
    const chemin = options.dossierSortie ? join(options.dossierSortie, ligne.fichier) : undefined;
    if (chemin) await writeFile(chemin, contenu, "utf8");
    if (ligne.sha256 !== sha256) {
      await query("UPDATE export_dora SET sha256 = $2 WHERE id = $1", [ligne.id, sha256]);
    }
    exports.push({
      id: ligne.id,
      sourceEventId: ligne.source_event_id,
      fichier: ligne.fichier,
      ...(chemin ? { chemin } : {}),
      sha256,
      dossier: ligne.dossier,
    });
  }
  return exports;
}

/** Nombre de lignes hors horloge : la sortie brute du juge externe. */
export async function compteurExportDoraHorsHorloge(): Promise<number> {
  const resultat = await query<{ count: string }>(CRITERE_EXPORT_DORA);
  return Number(resultat.rows[0]?.count ?? -1);
}
