/**
 * Création d'organisation à partir d'un indice de revendication.
 *
 * Les indices étrangers (`connectwell.com`) n'existent pas au registre
 * français : sans cette porte, la revendication reste orpheline et l'analyste
 * n'a d'autre choix que d'écrire une organisation à la main, sans provenance.
 *
 * Deux règles verrouillent le service :
 *   * jamais de doublon — domaine normalisé ou nom normalisé déjà porté par une
 *     organisation existante, auquel cas on la rend et on ne toucher à rien ;
 *   * jamais de création silencieuse — le fait `org.created` porte la source,
 *     la preuve et le nom brut de l'indice.
 *
 * L'isolation est transactionnelle : le verrou advisory sur le domaine (ou le
 * nom) sérialise deux appels concurrents portant sur le même indice. Sans lui,
 * deux requêtes pouvaient toutes deux ne rien trouver puis insérer deux orgs.
 */
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { normalizeDomainValue } from "../match/domaine.js";
import { normalizeDomain, normalizeName } from "./promote.js";

export const createOrgFromHintSchema = z.object({
  nom: z.string().trim().min(1, "nom requis").max(300),
  domaine: z.string().trim().min(1).max(253).nullish(),
  ville: z.string().trim().min(1).max(120).nullish(),
  source: z.string().trim().min(1, "source requise").max(200),
  preuve: z.string().trim().min(1, "preuve requise").max(2000),
});

export type CreateOrgFromHintInput = z.infer<typeof createOrgFromHintSchema>;

export class InvalidHintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHintError";
  }
}

/**
 * Nom à stocker pour un indice : l'indice lui-même, normalisé.
 *
 * Les indices-domaines passent par la normalisation du moteur (scheme, port,
 * chemin, `www.`, point final). Les autres gardent leur forme de nom : on
 * abaisse la casse, on retire un `www.` initial et les points finaux, sans
 * transformer la ponctuation (c'est `normalizeName` qui s'en charge ensuite
 * pour les alias et le préfiltre).
 */
export function nomDepuisIndice(hint: string): string {
  const brut = hint.trim().toLowerCase();
  const domaine = normalizeDomainValue(brut);
  if (domaine) return domaine;
  return brut.replace(/^www\./, "").replace(/\.+$/, "").slice(0, 300);
}

export type OrgFromHint = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  city: string | null;
  domain: string | null;
  status: string;
};

export type CreateOrgFromHintResult = {
  org: OrgFromHint;
  created: boolean;
  /** Ce qui a fait reconnaître l'existant : domaine, nom, ou rien (création). */
  matchedBy: "domaine" | "nom" | null;
  /** Alias insérés lors de la création (0 si l'organisation existait). */
  aliases: number;
  /** Le journal n'interrompt jamais la création ; son état est rendu à l'appelant. */
  journal: { ok: boolean; ecrit: boolean; error?: string };
};

const ORG_COLUMNS = "id, name, slug, kind, city, domain, status";

const DOMAIN_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Jetons du préfiltre : sur-ensemble du nom normalisé, jamais un sous-ensemble. */
function nameTokens(nomNorm: string): string[] {
  const tokens = [...new Set(nomNorm.split(" ").filter((t) => t.length >= 2))];
  return tokens.length > 0 ? tokens : nomNorm ? [nomNorm] : [];
}

async function findExisting(
  client: PoolClient,
  domain: string | null,
  nomNorm: string,
): Promise<{ org: OrgFromHint; matchedBy: "domaine" | "nom" } | null> {
  if (domain) {
    const byDomain = await client.query<OrgFromHint>(
      `SELECT ${ORG_COLUMNS} FROM org WHERE lower(domain) = $1 LIMIT 1`,
      [domain],
    );
    if (byDomain.rows[0]) return { org: byDomain.rows[0], matchedBy: "domaine" };

    // Le chargeur de référentiel matérialise aussi les domaines en alias : un
    // domaine connu sous cette forme ne doit pas recréer l'organisation.
    const byAlias = await client.query<OrgFromHint>(
      `SELECT o.id, o.name, o.slug, o.kind, o.city, o.domain, o.status
         FROM org_alias a JOIN org o ON o.id = a.org_id
        WHERE lower(a.alias) = $1 AND a.status = 'active' AND a.valid_to IS NULL
        LIMIT 1`,
      [domain],
    );
    if (byAlias.rows[0]) return { org: byAlias.rows[0], matchedBy: "domaine" };
  }

  const patterns = nameTokens(nomNorm).map((token) => `%${token}%`);
  if (patterns.length > 0) {
    // `name_norm` est déaccentuée (migration 041) et indexée en trigramme.
    // Le préfiltre est large ; la décision se prend côté TypeScript avec la
    // MÊME normalisation que celle du nom fourni, pour ne rien inventer.
    const byName = await client.query<OrgFromHint>(
      `SELECT ${ORG_COLUMNS} FROM org
        WHERE name_norm = $1 OR name_norm ILIKE ANY($2::text[])
        LIMIT 500`,
      [nomNorm, patterns],
    );
    const exact = byName.rows.find((row) => normalizeName(row.name) === nomNorm);
    if (exact) return { org: exact, matchedBy: "nom" };
  }
  return null;
}

function slugFor(domain: string | null, nomNorm: string): string {
  const base = domain ? domain.replace(/\./g, "-") : nomNorm.replace(/\s+/g, "-");
  const clean = base.replace(/[^a-z0-9-]/g, "").slice(0, 80).replace(/^-+|-+$/g, "");
  return `hint-${clean || "organisation"}-${randomBytes(4).toString("hex")}`;
}

/**
 * Crée l'organisation, ou rend l'existante sans la modifier, dans la
 * transaction de l'appelant. Promotion ou journal peuvent ainsi échouer sans
 * laisser une organisation orpheline.
 */
export async function createOrgFromHintTx(
  client: PoolClient,
  raw: unknown,
): Promise<CreateOrgFromHintResult> {
  const parsed = createOrgFromHintSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new InvalidHintError(first ? `${first.path.join(".") || "entrée"} : ${first.message}` : "entrée invalide");
  }
  const input = parsed.data;
  // Le nom stocké est l'indice normalisé : « www.x.com » donne « x.com », et
  // non « www x com ». L'indice brut reste consigné tel quel dans le journal.
  const nom = nomDepuisIndice(input.nom);
  const nomNorm = normalizeName(nom);
  if (!nom || !nomNorm) throw new InvalidHintError("nom invalide");

  const domain = input.domaine ? normalizeDomain(input.domaine) : null;
  if (domain && !DOMAIN_RE.test(domain)) throw new InvalidHintError("domaine invalide");

  const found = await findExisting(client, domain, nomNorm);
  if (found) return { ...found, created: false, aliases: 0, journal: { ok: true, ecrit: false } };

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    domain ? `domaine:${domain}` : `nom:${nomNorm}`,
  ]);
  // Le verrou posé, on revérifie : un appel concurrent a pu créer entre-temps.
  const afterLock = await findExisting(client, domain, nomNorm);
  if (afterLock) return { ...afterLock, created: false, aliases: 0, journal: { ok: true, ecrit: false } };

  const slug = slugFor(domain, nomNorm);
  const inserted = await client.query<OrgFromHint>(
    `INSERT INTO org (name, slug, kind, city, domain, status, entity_source)
     VALUES ($1, $2, 'entreprise', $3, $4, 'a_confirmer', $5)
     RETURNING ${ORG_COLUMNS}`,
    [nom, slug, input.ville?.trim() ?? null, domain, `hint:${input.source}`],
  );
  const org = inserted.rows[0]!;

  // Alias de rattachement : nom entier déaccentué (jamais la ville seule,
  // migrate-016) et domaine nu. Ce sont les deux formes que portent les
  // revendications.
  const aliases: { alias: string; source: string }[] = [
    { alias: nomNorm, source: "name-full" },
    ...(domain ? [{ alias: domain, source: "domain" }] : []),
  ];
  let count = 0;
  for (const alias of aliases) {
    const r = await client.query(
      `INSERT INTO org_alias (org_id, alias, source) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, alias) DO NOTHING`,
      [org.id, alias.alias, alias.source],
    );
    count += r.rowCount ?? 0;
  }
  const result: Omit<CreateOrgFromHintResult, "journal"> = {
    org, created: true, matchedBy: null, aliases: count,
  };

  // Un appel qui rend une organisation existante n'écrit rien : sinon chaque
  // revue du même indice ajouterait un fait « création » au journal.
  const ecrit = await consignerAvec(
    (sql, params) => client.query(sql, params as unknown[]),
    {
      kind: "org.created",
      subject: `org:${result.org.slug}`,
      summary: `organisation créée depuis l'indice « ${input.nom} » (source ${input.source})`,
      actor: "humain:revue@radar.local",
      payload: {
        source: input.source,
        preuve: input.preuve,
        nomBrut: input.nom,
        domaine: domain,
        ville: input.ville ?? null,
        orgId: result.org.id,
        slug: result.org.slug,
      },
    },
  );
  return {
    ...result,
    journal: { ok: ecrit.ok, ecrit: true, ...(ecrit.error ? { error: ecrit.error } : {}) },
  };
}

/** Crée l'organisation dans sa propre transaction (appel historique). */
export async function createOrgFromHint(raw: unknown): Promise<CreateOrgFromHintResult> {
  return withTransaction((client) => createOrgFromHintTx(client, raw));
}
