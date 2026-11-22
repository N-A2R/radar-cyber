/**
 * Source primaire obligatoire — Nouvelle-Aquitaine.
 *
 * Roadmap 3 ans, contrainte juridique n°1 : « Aucune organisation nommée sans un
 * lien public vers la source qui l'affirme. Pas de source, pas de nom. »
 *
 * Ce module est pur : il associe une décision de publication à l'URL publique
 * de l'éditeur qui a affirmé l'incident. Les URL publiques sont nettoyées
 * (requête et fragment retirés : jetons et données personnelles éventuels) ;
 * aucun titre, nom de victime ou détail d'incident ne sort d'ici.
 */
import type { CorroborationEvent, CorroborationReport } from "./incident-corroboration.js";

/** URL publique utilisable comme preuve, ou null. */
export function publicSourceUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username !== "" || parsed.password !== "" || !parsed.hostname.includes(".")) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Une source publique par incident, choisie dans l'ordre lexicographique pour
 * être reproductible. La clé est l'identité journalisable de la décision :
 * empreinte de victime et première revendication.
 */
export function sourcesParIncident(
  events: readonly CorroborationEvent[],
  report: CorroborationReport,
): Map<string, string | null> {
  const byId = new Map(events.map((event) => [event.id, event]));
  const sources = new Map<string, string | null>();
  for (const cluster of report.clusters) {
    if (!cluster.naIncident || cluster.incidentEvents === 0) continue;
    const identifiant = `${cluster.victimHash}@${cluster.firstClaimAt}`;
    const urls = cluster.eventIds
      .map((id) => publicSourceUrl(byId.get(id)?.sourceUrl))
      .filter((url): url is string => url !== null)
      .sort();
    sources.set(identifiant, urls[0] ?? null);
  }
  return sources;
}
