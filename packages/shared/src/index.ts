import { z } from "zod";

/** Familles d'événements du Radar. */
export const FAMILIES = [
  "ransomware",
  "vuln",
  "phishing",
  "malware",
  "cert",
  "cert_fr",
  "typosquat",
  "reputation",
  "cti",
  "presse",
  // Alignement du contrat sur la réalité du catalogue (arbitrage utilisateur,
  // chantier « socle + contrat »). Trois valeurs circulaient déjà sans lui :
  //  - `leaks` et `paste` : 8 sources actives les déclarent
  //    (db/sources-paste-leaks.sql : HIBP, DataBreaches, RansomLook…).
  //    generic.ts les laissait traverser vers `event.family` sans contrôle.
  //  - `presse_cyber` : posée par scripts/reclassify-press.mts et acceptée par
  //    le CHECK de db/migrate-019, mais absente d'ici — migrate-019 le
  //    signalait déjà comme une dette à reprendre.
  // Les garder distinctes plutôt que les fondre dans `ransomware`/`cti` :
  // une fuite indexée n'est pas une revendication, un paste n'est pas un avis.
  "leaks",
  "paste",
  "presse_cyber",
  // Veille de la presse locale départementale : un titre de la vie locale est
  // un signal ambiant par sa provenance, pas parce que son texte parle cyber.
  // Alimentée uniquement par les sources `presse_locale` dont le département
  // éditeur est connu ; elle ne qualifie jamais un incident (assertion
  // `ambient_signal`, jamais `confirmed_incident`/`third_party_claim`).
  "presse_locale",
] as const;

/** Nature de l'assertion — jamais fusionnée avec la confiance. */
export const ASSERTION_TYPES = [
  "confirmed_incident",
  "third_party_claim",
  "technical_indicator",
  "suggested_relation",
  "ambient_signal",
] as const;

export const GEO_TYPES = [
  "entity_location",
  "hosting_estimate",
  "claimed_origin",
  "unknown",
] as const;

export const EventSchema = z.object({
  dedupKey: z.string().min(8),
  family: z.enum(FAMILIES),
  assertionType: z.enum(ASSERTION_TYPES),
  title: z.string().min(3).max(400),
  summary: z.string().max(4000).optional(),
  observedAt: z.iso.datetime().optional(),
  severity: z.number().int().min(1).max(5).default(3),
  confidence: z.string().regex(/^[A-F][1-6]$/).optional(),
  sourceId: z.string(),
  sourceUrl: z.url().optional(),
  evidence: z.record(z.string(), z.unknown()).default({}),
  geoType: z.enum(GEO_TYPES).default("unknown"),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  orgHint: z.string().optional(),
});
export type NormalizedEvent = z.infer<typeof EventSchema>;

/** Ce qu'un collecteur reçoit du moteur. */
export interface CollectContext {
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  fetchText(url: string): Promise<string>;
  cursor: Record<string, unknown>;
  log(msg: string): void;
  now(): Date;
}

/** Ce qu'un collecteur doit exporter (fichier `*.collector.ts`). */
export interface Collector {
  id: string;
  family: (typeof FAMILIES)[number];
  /** Période de collecte en secondes. */
  intervalSec: number;
  run(ctx: CollectContext): Promise<{ events: NormalizedEvent[]; cursor?: Record<string, unknown> }>;
}

export const OrgRefSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  city: z.string().nullable(),
  dept: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});
export type OrgRef = z.infer<typeof OrgRefSchema>;
