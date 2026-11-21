/**
 * API publique des parseurs de sources.
 *
 * `detectItems()` (dans `generic.ts`) garde la sémantique historique utilisée
 * par le collecteur ; `parseSource()` l'enveloppe avec une étiquette de format,
 * des diagnostics et un état vide explicite. Les tests et les outils de mesure
 * n'ont ainsi qu'un point d'entrée, quel que soit le format du corps.
 */
import { detectItems, type DetectOptions, type DetectionDiagnostic, type DetectionResult, type DetectionStrategy } from "../generic.js";
import { sniffFormat, type RealFormat } from "./detect.js";

export type SourceFormat =
  | "rss-2" | "atom" | "rdf" | "json-ld" | "json"
  | "html" | "csv" | "texte" | "vide" | "inconnu";

export type SourceParse = {
  format: SourceFormat;
  strategy: DetectionStrategy;
  items: DetectionResult["items"];
  path: string | null;
  empty: boolean;
  ok: boolean;
  sniffed: RealFormat;
  diagnostics: DetectionDiagnostic[];
};

const FORMAT_BY_STRATEGY: Record<DetectionStrategy, SourceFormat> = {
  "rss-2": "rss-2",
  atom: "atom",
  "rss-atom": "rdf",
  "json-ld": "json-ld",
  "json-root-array": "json",
  "json-nested-array": "json",
  "embedded-json": "json",
  csv: "csv",
  "html-article": "html",
  "html-links": "html",
  "claim-cards": "html",
  "telegram-channel": "html",
  "telegram-contact": "html",
  "landing-notice": "html",
  none: "inconnu",
};

const FORMAT_BY_SNIFF: Record<RealFormat, SourceFormat> = {
  rss: "rss-2", atom: "atom", rdf: "rdf", json: "json", html: "html",
  csv: "csv", text: "texte", empty: "vide",
};

/** Format lisible, indépendamment du content-type annoncé par le serveur. */
export function formatOf(result: DetectionResult, body: string, contentType: string | null): SourceFormat {
  if (result.strategy !== "none") return FORMAT_BY_STRATEGY[result.strategy];
  return FORMAT_BY_SNIFF[sniffFormat(body ?? "", contentType)];
}

/**
 * Parse un corps de source, sans jamais lever d'exception pour un contenu
 * invalide. `ok=false` signale une erreur bloquante ; `empty=true` un état vide
 * constaté (corps vide ou aucun item), qui n'est pas forcément une erreur réseau.
 */
export function parseSource(
  body: string | null | undefined,
  contentType?: string | null,
  opts: DetectOptions = {},
): SourceParse {
  const text = body ?? "";
  const result = detectItems(text, contentType ?? null, opts);
  const diagnostics = result.diagnostics;
  return {
    format: formatOf(result, text, contentType ?? null),
    strategy: result.strategy,
    items: result.items,
    path: result.path,
    empty: result.empty,
    ok: !diagnostics.some((d) => d.severity === "error"),
    sniffed: sniffFormat(text, contentType ?? null),
    diagnostics,
  };
}
