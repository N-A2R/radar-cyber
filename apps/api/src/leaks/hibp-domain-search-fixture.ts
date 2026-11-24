/**
 * Connecteur « HIBP domain search » en mode fixture enregistrée.
 *
 * Aucun abonnement, aucune clé d'API, aucun appel réseau : cinq réponses
 * JSON locales sont lues par un chargeur injecté, puis ramenées à des
 * statistiques de domaine. Le contrat de sortie est volontairement pauvre :
 * `domaine`, `source`, `occurrences`, `premiereVue`, `derniereVue`. Les champs
 * présents dans une réponse brute mais inutiles à la mesure (nom de fuite,
 * nombre de comptes, classes de données, tout identifiant de victime) sont
 * écartés par le schéma Zod avant toute écriture.
 *
 * Les données sont explicitement fictives : domaines `*.example`, source
 * `hibp-domain-search-fixture`, URL `example.invalid`. Aucune source nationale
 * réelle n'est présentée comme une donnée locale.
 */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ingestQuery } from "../db.js";

export const SOURCE_FIXTURE = "hibp-domain-search-fixture";

/** Les cinq fichiers enregistrés, dans l'ordre déterministe du snapshot. */
export const FIXTURES_HIBP_DOMAIN_SEARCH = [
  "01-domaines-01.json",
  "02-domaines-02.json",
  "03-domaines-03.json",
  "04-domaines-04.json",
  "05-domaines-05.json",
] as const;

const NOM_FIXTURE = /^\d{2}-[a-z0-9-]+\.json$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DOMAINE_DNS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MARQUEUR_SECRET = /(?:password|passwd|mdp|secret|mot[-_ ]?de[-_ ]?passe|hunter2|qwerty|azerty|123456)/i;

const NomFixture = z.string().regex(NOM_FIXTURE);

/** Un domaine DNS nu : jamais un courriel, jamais un mot de passe. */
const Domaine = z.string()
  .min(4)
  .max(253)
  .regex(DOMAINE_DNS)
  .refine(
    (valeur) => !valeur.includes("@") && !MARQUEUR_SECRET.test(valeur),
    "domaine refusé : courriel ou marqueur de secret",
  );

/**
 * Réponse brute : seuls `Domain` et `BreachDate` sont conservés. Les autres
 * clés, y compris toute donnée personnelle ajoutée par un futur fixture, sont
 * ignorées par Zod et ne peuvent atteindre la sortie.
 */
const ReponsesBrutesSchema = z.array(
  z.object({
    domaine: Domaine,
    status: z.literal(200),
    breaches: z.array(
      z.object({
        Domain: z.string().max(253),
        BreachDate: z.string().regex(DATE_ISO),
      }),
    ).min(1),
  }),
).min(1);

/** Contrat de sortie strict : cinq métadonnées, aucune donnée victime. */
export const StatistiqueDomaineSchema = z.object({
  domaine: Domaine,
  source: z.literal(SOURCE_FIXTURE),
  occurrences: z.number().int().positive(),
  premiereVue: z.string().regex(DATE_ISO),
  derniereVue: z.string().regex(DATE_ISO),
}).strict();

export type StatistiqueDomaine = z.infer<typeof StatistiqueDomaineSchema>;

/** Une réponse enregistrée devient une statistique par domaine interrogé. */
export function normaliserReponsesHibpDomain(
  brut: unknown,
  fixture: string,
): StatistiqueDomaine[] {
  const nom = NomFixture.parse(fixture);
  const entrees = ReponsesBrutesSchema.parse(brut);
  return entrees.map((entree) => {
    for (const breach of entree.breaches) {
      if (breach.Domain !== entree.domaine) {
        throw new Error(`domaine incohérent dans ${nom}`);
      }
    }
    const dates = entree.breaches.map((b) => b.BreachDate).sort();
    return StatistiqueDomaineSchema.parse({
      domaine: entree.domaine,
      source: SOURCE_FIXTURE,
      occurrences: entree.breaches.length,
      premiereVue: dates[0]!,
      derniereVue: dates[dates.length - 1]!,
    });
  });
}

/** Chargeur injecté : aucun `fetch`, aucun client HTTP dans ce module. */
export type ChargeurFixture = (nom: string) => Promise<unknown>;

export function chargeurLocal(dossier: URL): ChargeurFixture {
  return async (nom: string): Promise<unknown> => {
    const valide = NomFixture.parse(nom);
    return JSON.parse(await readFile(new URL(valide, dossier), "utf8")) as unknown;
  };
}

/** Collecte déterministe des cinq réponses, contrat vérifié. */
export async function collecterStatistiquesFixture(
  noms: readonly string[],
  charger: ChargeurFixture,
): Promise<StatistiqueDomaine[]> {
  const statistiques: StatistiqueDomaine[] = [];
  for (const nom of [...noms].sort((a, b) => a.localeCompare(b, "en"))) {
    statistiques.push(...normaliserReponsesHibpDomain(await charger(nom), nom));
  }
  return z.array(StatistiqueDomaineSchema).min(50).parse(statistiques);
}

/** Écrit les statistiques dans `stealer_domain_stat`, sans donnée personnelle. */
export async function enregistrerStatistiquesDomaines(
  statistiques: readonly StatistiqueDomaine[],
): Promise<number> {
  const lignes = z.array(StatistiqueDomaineSchema).parse(statistiques);
  if (lignes.length === 0) return 0;
  await ingestQuery(
    `INSERT INTO stealer_domain_stat (domaine, source, occurrences, premiere_vue, derniere_vue)
     SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::date[], $5::date[])
     ON CONFLICT (domaine, source) DO UPDATE SET
       occurrences = EXCLUDED.occurrences,
       premiere_vue = EXCLUDED.premiere_vue,
       derniere_vue = EXCLUDED.derniere_vue`,
    [
      lignes.map((l) => l.domaine),
      lignes.map((l) => l.source),
      lignes.map((l) => l.occurrences),
      lignes.map((l) => l.premiereVue),
      lignes.map((l) => l.derniereVue),
    ],
  );
  return lignes.length;
}
