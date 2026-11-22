/**
 * Connecteur de recherche de fuite de type DeHashed, en mode fixture.
 *
 * Aucun abonnement, aucune clé d'API et aucun appel réseau : les cinq réponses
 * sont fournies par un chargeur injecté (lecture de fichiers locaux en test).
 * Le contrat de sortie est validé par Zod : seules des métadonnées de fuite
 * sortent de l'adaptateur. Les champs personnels présents dans une réponse
 * brute (courriel, mot de passe, IP, identifiant de compte) sont ignorés par
 * le schéma d'entrée et ne peuvent donc atteindre ni le snapshot ni la base.
 *
 * Les données sont explicitement fictives : source `dehashed-fixture`,
 * domaines `*.example` et URL `example.invalid`. Aucune fuite nationale
 * réelle n'est présentée comme un jeu d'essai local.
 */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ingestQuery } from "../db.js";

export const SOURCE_FIXTURE = "dehashed-fixture";

/** Les cinq fixtures, dans l'ordre déterministe utilisé par le snapshot. */
export const FIXTURES_DEHASHED = [
  "01-service-alpha.json",
  "02-association-beta.json",
  "03-cooperative-gamma.json",
  "04-collectivite-delta.json",
  "05-fournisseur-epsilon.json",
] as const;

// Noms de fichiers déterministes : NN-slug.json (01- … 05-).
const NomFixture = z.string().regex(/^\d{2}-[a-z0-9-]+\.json$/);

/** Réponse brute : les clés inconnues (données personnelles) sont écartées. */
const ReponseBruteSchema = z.object({
  query: z.string().min(1).max(200),
  total: z.number().int().nonnegative(),
  entries: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(160),
    domain: z.string().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/).nullable(),
    breach_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    accounts: z.number().int().nonnegative().nullable(),
    source_url: z.string().url(),
  })).length(1),
});

/** Contrat de sortie : aucun champ de donnée personnelle n'est autorisé. */
export const ReferenceFixtureSchema = z.object({
  id: z.string().regex(/^dehashed-fixture:[a-z0-9-]+$/),
  source: z.literal(SOURCE_FIXTURE),
  name: z.string().min(1).max(160),
  domain: z.string().regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/).nullable(),
  breachDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  accounts: z.number().int().nonnegative().nullable(),
  sourceUrl: z.string().url(),
  evidence: z.object({
    fixture: NomFixture,
    mode: z.literal("fixture"),
  }).strict(),
}).strict();

export const ReponseNormaliseeSchema = z.object({
  fixture: NomFixture,
  source: z.literal(SOURCE_FIXTURE),
  query: z.string().min(1).max(200),
  total: z.number().int().nonnegative(),
  reference: ReferenceFixtureSchema,
}).strict();

export type ReferenceFixture = z.infer<typeof ReferenceFixtureSchema>;
export type ReponseNormalisee = z.infer<typeof ReponseNormaliseeSchema>;

/** Une réponse brute est ramenée à une seule référence de fuite publique. */
export function normaliserReponseDeHashed(brut: unknown, fixture: string): ReponseNormalisee {
  const nomFixture = NomFixture.parse(fixture);
  const reponse = ReponseBruteSchema.parse(brut);
  const entree = reponse.entries[0]!;
  return ReponseNormaliseeSchema.parse({
    fixture: nomFixture,
    source: SOURCE_FIXTURE,
    query: reponse.query,
    total: reponse.total,
    reference: {
      id: `${SOURCE_FIXTURE}:${entree.id}`,
      source: SOURCE_FIXTURE,
      name: entree.name,
      domain: entree.domain,
      breachDate: entree.breach_date,
      accounts: entree.accounts,
      sourceUrl: entree.source_url,
      evidence: { fixture: nomFixture, mode: "fixture" },
    },
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

/** Collecte déterministe des cinq réponses normalisées, contrat vérifié. */
export async function collecterReponsesFixture(
  noms: readonly string[],
  charger: ChargeurFixture,
): Promise<ReponseNormalisee[]> {
  const reponses: ReponseNormalisee[] = [];
  for (const nom of [...noms].sort((a, b) => a.localeCompare(b, "en"))) {
    reponses.push(normaliserReponseDeHashed(await charger(nom), nom));
  }
  return z.array(ReponseNormaliseeSchema).length(5).parse(reponses);
}

/** Écrit les références dans `fuite_reference`, sans donnée personnelle. */
export async function enregistrerReponsesFixture(reponses: readonly ReponseNormalisee[]): Promise<number> {
  const ref = z.array(ReponseNormaliseeSchema).parse(reponses).map((r) => r.reference);
  if (ref.length === 0) return 0;
  await ingestQuery(
    `INSERT INTO fuite_reference (id, source, name, domain, breach_date, accounts, source_url, evidence)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                          $5::date[], $6::bigint[], $7::text[], $8::jsonb[])
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, domain = EXCLUDED.domain,
       breach_date = EXCLUDED.breach_date, accounts = EXCLUDED.accounts,
       source_url = EXCLUDED.source_url, evidence = EXCLUDED.evidence,
       collected_at = now()`,
    [
      ref.map((r) => r.id),
      ref.map((r) => r.source),
      ref.map((r) => r.name),
      ref.map((r) => r.domain),
      ref.map((r) => r.breachDate),
      ref.map((r) => r.accounts),
      ref.map((r) => r.sourceUrl),
      ref.map((r) => JSON.stringify(r.evidence)),
    ],
  );
  return ref.length;
}
