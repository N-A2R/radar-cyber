/**
 * Lot d'indices de quarantaine de famille « domaine ».
 *
 * Le classement vient du module pur `match/famille-indice.ts` : on ne retient
 * que les lignes en attente dont l'indice est un domaine. Pour chacune, on
 * regarde — exactement comme le fait la création d'organisation — si une
 * organisation existe déjà par domaine, par alias de domaine ou par nom
 * normalisé (miroir en lecture seule de `findExisting` dans from-hint.ts).
 *
 *   tsx scripts/traiter-domaines.mts                                   # dry-run, rien n'est écrit en base
 *   tsx scripts/traiter-domaines.mts --appliquer http://127.0.0.1:8080 --max 20
 *   tsx scripts/traiter-domaines.mts --appliquer 8080                  # port nu = 127.0.0.1
 *
 * Le mode --appliquer passe TOUJOURS par POST /api/review/:id/decision
 * {decision:'creer'} : c'est la route qui porte la transaction, le journal et
 * l'évaluation d'alertes. L'API décide elle-même de créer ou de réutiliser une
 * organisation (champ `cree` de la réponse) — le script ne duplique pas cette
 * écriture. La base est imposée au port 5433 ; l'URL d'API doit être locale ou
 * porter le port 5433, sinon le script refuse de démarrer.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// db.ts lit DATABASE_URL au chargement du module : l'imposer avant l'import
// dynamique garantit qu'aucune base de production ne peut être atteinte.
const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;

const DOSSIER = fileURLToPath(new URL("../bench/results/", import.meta.url));
const RESULTAT = fileURLToPath(new URL("../bench/results/domaines-lot.json", import.meta.url));
const JOURNAL = fileURLToPath(new URL("../bench/results/domaines-lot.journal.jsonl", import.meta.url));
const FILTRE = "promoted=false AND kind='claim' AND status='pending' AND btrim(org_hint) <> ''";
const RAISON = "lot domaines : indice de famille domaine, organisation à créer ou réutiliser";

type Options = { appliquer: boolean; max: number; api: string | null };

type OrgTrouvee = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  city: string | null;
  domain: string | null;
  status: string;
  voie: "domaine" | "alias" | "nom";
};

type LigneRapport = {
  id: string;
  indice: string;
  domaine: string | null;
  organisation_existe: boolean;
  organisation_existante: OrgTrouvee | null;
  action_proposee: "creer" | "reutiliser";
  resultat?: Record<string, unknown>;
};

type Rapport = {
  genere_le: string;
  base: string;
  filtre: string;
  mode: "dry-run" | "applique";
  regle: string;
  total_attente: number;
  total_avec_indice: number;
  total_domaines: number;
  avec_organisation: number;
  sans_organisation: number;
  limite: number | null;
  lignes: LigneRapport[];
};

function usage(): string {
  return [
    "Usage : tsx scripts/traiter-domaines.mts [--appliquer URL_OU_PORT] [--max N]",
    "  défaut   : dry-run, aucun appel API, aucune écriture en base",
    "  --appliquer : POST /api/review/:id/decision {decision:'creer'}, une ligne à la fois",
    "  --max N  : plafond de lignes appliquées (défaut 20)",
    "  URL_OU_PORT : http://127.0.0.1:8080, 8080, … (loopback ou port 5433 uniquement)",
  ].join("\n");
}

function analyserArgs(argv: string[]): Options {
  let appliquer = false;
  let max = 20;
  let api: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--appliquer") {
      appliquer = true;
    } else if (arg === "--max") {
      const valeur = Number(argv[++i]);
      if (!Number.isInteger(valeur) || valeur < 1) throw new Error("--max doit être un entier >= 1");
      max = valeur;
    } else if (arg.startsWith("--max=")) {
      const valeur = Number(arg.slice("--max=".length));
      if (!Number.isInteger(valeur) || valeur < 1) throw new Error("--max doit être un entier >= 1");
      max = valeur;
    } else if (arg === "--url" || arg === "--api") {
      api = argv[++i] ?? null;
    } else if (arg.startsWith("--url=") || arg.startsWith("--api=")) {
      api = arg.slice(arg.indexOf("=") + 1);
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`option inconnue : ${arg}`);
    } else if (/^\d+$/.test(arg)) {
      api = `http://127.0.0.1:${arg}`;
    } else {
      api = arg;
    }
  }
  if (appliquer && !api) throw new Error("--appliquer nécessite l'URL (ou le port) de l'API");
  return { appliquer, max, api };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Refuse toute URL d'API qui n'est ni locale (loopback) ni sur le port 5433. */
function verifierApiUrl(brut: string): string {
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    throw new Error(`URL d'API invalide : ${brut}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`protocole refusé pour l'API : ${url.protocol}`);
  }
  const hote = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const locale = LOOPBACK.has(hote) || hote.endsWith(".localhost");
  const port5433 = url.port === "5433";
  if (!locale && !port5433) {
    throw new Error(
      `refus : ${brut} n'est ni une API locale (loopback) ni une URL sur le port 5433`,
    );
  }
  return url.toString().replace(/\/+$/, "");
}

const { withClient, closePools } = await import("../apps/api/src/db.js");
const { classifierIndice } = await import("../apps/api/src/match/famille-indice.js");
const { domainFromHint } = await import("../apps/api/src/match/domaine.js");
const { normalizeDomain, normalizeName } = await import("../apps/api/src/quarantine/promote.js");

const COLONNES = "id, name, slug, kind, city, domain, status";

async function analyser(): Promise<Rapport> {
  return withClient(async (client) => {
    await client.query("BEGIN READ ONLY");
    try {
      const { rows: lignes } = await client.query<{ id: string; org_hint: string }>(
        `SELECT id::text AS id, org_hint
           FROM quarantine_raw
          WHERE ${FILTRE}
          ORDER BY quarantine_raw.id`,
      );
      const { rows: totaux } = await client.query<{ attente: number; avec_indice: number }>(
        `SELECT count(*)::int AS attente,
                count(*) FILTER (WHERE org_hint IS NOT NULL AND btrim(org_hint) <> '')::int AS avec_indice
           FROM quarantine_raw
          WHERE promoted = false AND kind = 'claim' AND status = 'pending'`,
      );

      // Miroir de findExisting (quarantine/from-hint.ts), avec la voie « alias »
      // distinguée pour le rapport. Mêmes normaliseurs : le verdict collé à
      // l'API est donc le même que celui de la route de décision.
      const trouver = async (domaine: string | null, nomNorm: string): Promise<OrgTrouvee | null> => {
        if (domaine) {
          const parDomaine = await client.query<Omit<OrgTrouvee, "voie">>(
            `SELECT ${COLONNES} FROM org WHERE lower(domain) = $1 LIMIT 1`,
            [domaine],
          );
          if (parDomaine.rows[0]) return { ...parDomaine.rows[0], voie: "domaine" };

          const parAlias = await client.query<Omit<OrgTrouvee, "voie">>(
            `SELECT o.id, o.name, o.slug, o.kind, o.city, o.domain, o.status
               FROM org_alias a JOIN org o ON o.id = a.org_id
              WHERE lower(a.alias) = $1 AND a.status = 'active' AND a.valid_to IS NULL
              LIMIT 1`,
            [domaine],
          );
          if (parAlias.rows[0]) return { ...parAlias.rows[0], voie: "alias" };
        }

        const jetons = [...new Set(nomNorm.split(" ").filter((j) => j.length >= 2))];
        const motifs = jetons.map((j) => `%${j}%`);
        if (motifs.length > 0) {
          const parNom = await client.query<Omit<OrgTrouvee, "voie">>(
            `SELECT ${COLONNES} FROM org
              WHERE name_norm = $1 OR name_norm ILIKE ANY($2::text[])
              LIMIT 500`,
            [nomNorm, motifs],
          );
          const exact = parNom.rows.find((org) => normalizeName(org.name) === nomNorm);
          if (exact) return { ...exact, voie: "nom" };
        }
        return null;
      };

      const rapportLignes: LigneRapport[] = [];
      for (const ligne of lignes) {
        if (classifierIndice(ligne.org_hint) !== "domaine") continue;
        const brut = domainFromHint(ligne.org_hint);
        const domaine = brut ? normalizeDomain(brut) : null;
        const nomNorm = normalizeName(ligne.org_hint.slice(0, 300));
        const org = await trouver(domaine, nomNorm);
        rapportLignes.push({
          id: ligne.id,
          indice: ligne.org_hint,
          domaine,
          organisation_existe: org !== null,
          organisation_existante: org,
          action_proposee: org ? "reutiliser" : "creer",
        });
      }

      return {
        genere_le: new Date().toISOString(),
        base: BASE_TEST,
        filtre: FILTRE,
        mode: "dry-run",
        regle: "famille-indice.ts:classifierIndice(indice) === 'domaine'",
        total_attente: totaux[0]?.attente ?? 0,
        total_avec_indice: totaux[0]?.avec_indice ?? 0,
        total_domaines: rapportLignes.length,
        avec_organisation: rapportLignes.filter((l) => l.organisation_existe).length,
        sans_organisation: rapportLignes.filter((l) => !l.organisation_existe).length,
        limite: null,
        lignes: rapportLignes,
      };
    } finally {
      await client.query("ROLLBACK");
    }
  });
}

/**
 * Jeton d'appel : un jeton fourni est utilisé tel quel ; sinon on crée une
 * session éphémère dans la base de test, révoquée dans tous les cas. Aucune
 * décision n'est écrite directement en base : tout passe par l'API.
 */
async function obtenirJeton(): Promise<{ jeton: string; nettoyer: () => Promise<void> }> {
  const fourni = process.env.RADAR_SESSION_TOKEN ?? process.env.RADAR_TOKEN;
  if (fourni) return { jeton: fourni, nettoyer: async () => {} };

  const { hashSessionToken } = await import("../apps/api/src/auth.js");
  const suffixe = randomBytes(6).toString("hex");
  const email = `lot-domaines-${suffixe}@radar.local`;
  const jeton = `lot-${suffixe}-${randomBytes(16).toString("hex")}`;
  const hash = hashSessionToken(jeton);
  await withClient(async (client) => {
    const utilisateur = await client.query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role, display_name) VALUES ($1,'x','analyste',$2) RETURNING id",
      [email, "lot domaines"],
    );
    await client.query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2,now() + interval '1 hour')",
      [hash, utilisateur.rows[0]!.id],
    );
  });
  return {
    jeton,
    nettoyer: async () => {
      await withClient(async (client) => {
        await client.query("DELETE FROM app_session WHERE token = $1", [hash]);
        await client.query("DELETE FROM app_user WHERE email = $1", [email]);
      });
    },
  };
}

async function appliquer(rapport: Rapport, options: Options, apiBase: string): Promise<void> {
  const { jeton, nettoyer } = await obtenirJeton();
  rapport.mode = "applique";
  rapport.limite = options.max;
  mkdirSync(DOSSIER, { recursive: true });
  try {
    const cibles = rapport.lignes.slice(0, options.max);
    for (const [rang, ligne] of cibles.entries()) {
      const debut = new Date().toISOString();
      let resultat: Record<string, unknown>;
      let arret = false;
      try {
        const reponse = await fetch(`${apiBase}/api/review/${ligne.id}/decision`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${jeton}`,
          },
          body: JSON.stringify({ decision: "creer", raison: RAISON }),
        });
        const corps: unknown = await reponse.json().catch(() => null);
        resultat = {
          statut_http: reponse.status,
          ok: reponse.ok,
          ...(corps && typeof corps === "object" ? { reponse: corps } : { corps: corps ?? null }),
        };
        if (reponse.status === 401 || reponse.status === 403) {
          resultat.erreur = "authentification refusée par l'API";
          arret = true;
        }
      } catch (erreur) {
        resultat = { erreur: erreur instanceof Error ? erreur.message : String(erreur) };
      }
      ligne.resultat = resultat;
      appendFileSync(
        JOURNAL,
        `${JSON.stringify({
          a: debut,
          rang: rang + 1,
          id: ligne.id,
          indice: ligne.indice,
          action_proposee: ligne.action_proposee,
          ...resultat,
        })}\n`,
        "utf8",
      );
      const statut = "statut_http" in resultat ? String(resultat.statut_http) : "erreur";
      let detailCreation = "";
      if (
        "reponse" in resultat &&
        resultat.reponse &&
        typeof resultat.reponse === "object" &&
        "cree" in resultat.reponse
      ) {
        detailCreation = ` (cree=${String(resultat.reponse.cree)})`;
      }
      console.log(`[${rang + 1}/${cibles.length}] ${ligne.id} ${ligne.indice} -> ${statut}${detailCreation}`);
      if (arret) {
        console.error("Arrêt : jeton refusé par l'API. Aucune autre ligne traitée.");
        break;
      }
    }
  } finally {
    await nettoyer().catch((erreur: unknown) => {
      console.error(`Nettoyage de la session éphémère impossible : ${String(erreur)}`);
    });
  }
}

async function main(): Promise<void> {
  const options = analyserArgs(process.argv.slice(2));
  const apiBase = options.appliquer ? verifierApiUrl(options.api!) : null;
  const rapport = await analyser();

  if (apiBase) await appliquer(rapport, options, apiBase);

  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(RESULTAT, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");

  console.log(`en attente : ${rapport.total_attente} (dont ${rapport.total_avec_indice} avec indice)`);
  console.log(`indices « domaine » : ${rapport.total_domaines}`);
  console.log(`  organisation existante : ${rapport.avec_organisation} (réutilisation)`);
  console.log(`  aucune organisation    : ${rapport.sans_organisation} (création)`);
  console.log(`${apiBase ? "journal" : "rapport"} : ${apiBase ? JOURNAL : RESULTAT}`);
  if (!apiBase) console.log("Dry-run : aucune ligne modifiée, aucun appel API.");
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
