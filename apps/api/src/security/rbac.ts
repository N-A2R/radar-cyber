/**
 * Contrôle d'accès déclaratif, route par route.
 *
 * La matrice ci-dessous est la seule source de vérité : toute route `/api/*`
 * doit y figurer explicitement. Une route absente est refusée (404), jamais
 * « publique par défaut ». Le test `securite-couverture.test.ts` vérifie que
 * chaque route enregistrée dans l'API possède une règle — l'ajout d'une route
 * sans décision d'accès ne passe donc pas la suite.
 *
 * Hiérarchie : lecteur < analyste < admin. `public` n'exige aucun jeton.
 * L'inscription du premier compte est une exception nominative (`bootstrap`) :
 * sur une base vide, il n'existe encore personne pour tenir le rôle admin.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { consigner } from "../journal/index.js";
import { query } from "../db.js";
import { roleSuffit, resolveUser, type Role } from "../middleware/auth.js";
import { forbidden, notFound, unauthorized } from "../errors.js";
import { enregistrerAcces, empreinteAudit, correlationId, type DecisionAcces } from "./access-log.js";

export type NiveauAcces = "public" | Role;

export type RegleAcces = {
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route Fastify avec préfixe, par exemple `/api/orgs/:id`. */
  route: string;
  niveau: NiveauAcces;
  /** Raison lisible, reportée dans le journal des accès. */
  motif?: string;
  /** Premiers comptes seulement : voir le commentaire d'en-tête. */
  bootstrap?: boolean;
};

/** Les règles les plus spécifiques doivent précéder leurs variantes paramétrées. */
export const POLITIQUE_ACCES: RegleAcces[] = [
  // --- Socle et santé -------------------------------------------------------
  { methode: "GET", route: "/api/health", niveau: "public" },
  { methode: "GET", route: "/api/auth/me", niveau: "lecteur" },
  { methode: "GET", route: "/api/dossier", niveau: "lecteur" },
  { methode: "POST", route: "/api/auth/login", niveau: "public", motif: "authentification" },
  { methode: "POST", route: "/api/auth/logout", niveau: "lecteur" },
  { methode: "POST", route: "/api/auth/register", niveau: "admin", bootstrap: true },

  // --- Lectures de l'observatoire (jeton facultatif) ------------------------
  { methode: "GET", route: "/api/events", niveau: "public" },
  { methode: "GET", route: "/api/history", niveau: "public" },
  { methode: "GET", route: "/api/health/detail", niveau: "public" },
  { methode: "GET", route: "/api/health/causes", niveau: "public" },
  { methode: "GET", route: "/api/today", niveau: "public" },
  { methode: "GET", route: "/api/today/departements", niveau: "public" },
  { methode: "GET", route: "/api/couverture", niveau: "public" },
  { methode: "GET", route: "/api/leaks/by-domain", niveau: "public" },
  { methode: "GET", route: "/api/resale/listings", niveau: "public" },
  { methode: "GET", route: "/api/public-data-containers", niveau: "public", motif: "compteurs de dépôts et buckets publics, sans donnée personnelle" },
  { methode: "GET", route: "/api/corpus/stats", niveau: "public" },
  { methode: "GET", route: "/api/confidence/distribution", niveau: "public" },
  { methode: "GET", route: "/api/confidence/events/:eventId", niveau: "public" },
  { methode: "GET", route: "/api/confidence/attachments/:eventId/:orgId", niveau: "public" },
  { methode: "GET", route: "/api/collecte/metrics", niveau: "public" },
  { methode: "GET", route: "/api/collecte/plan", niveau: "public" },
  { methode: "GET", route: "/api/flows", niveau: "public" },
  { methode: "GET", route: "/api/stats", niveau: "public" },
  { methode: "GET", route: "/api/stats/departements", niveau: "public" },
  { methode: "GET", route: "/api/sources", niveau: "public" },
  { methode: "GET", route: "/api/directory", niveau: "public" },
  { methode: "GET", route: "/api/public-mandates", niveau: "public" },
  { methode: "GET", route: "/api/cyber-contracts", niveau: "public", motif: "marchés publics cyber : lecture publique, sans donnée personnelle" },
  { methode: "GET", route: "/api/graph", niveau: "public" },
  { methode: "GET", route: "/api/graph/temporal", niveau: "public", motif: "observatoire : lecture du graphe temporel" },
  { methode: "GET", route: "/api/stream", niveau: "public" },
  { methode: "GET", route: "/api/search", niveau: "public" },
  { methode: "GET", route: "/api/search/ask", niveau: "public" },
  { methode: "GET", route: "/api/na/overview", niveau: "public" },
  { methode: "GET", route: "/api/na/events", niveau: "public" },
  { methode: "GET", route: "/api/enrich/indicator/:id", niveau: "public" },
  { methode: "GET", route: "/api/enrich/domain/:value", niveau: "public" },
  { methode: "GET", route: "/api/enrich/events/:id", niveau: "public" },
  { methode: "GET", route: "/api/alerts", niveau: "public" },
  { methode: "GET", route: "/api/alerts/stats", niveau: "public" },
  { methode: "GET", route: "/api/quarantine", niveau: "public" },
  { methode: "GET", route: "/api/quarantine/stats", niveau: "public" },
  { methode: "GET", route: "/api/quarantine/queue", niveau: "analyste" },
  { methode: "GET", route: "/api/onion-index", niveau: "public" },
  { methode: "GET", route: "/api/custody", niveau: "public", motif: "chaîne de custody : métadonnées de source et journal, sans donnée personnelle" },
  { methode: "GET", route: "/api/affected", niveau: "public", motif: "assistant : faits structurés avec preuves, sans donnée personnelle" },
  { methode: "GET", route: "/api/orgs", niveau: "public" },

  // --- Lectures authentifiées ----------------------------------------------
  { methode: "GET", route: "/api/alerts/:id", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/liees", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/liees/historique", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/:id", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/:id/rectifications", niveau: "lecteur" },

  // --- Travail d'analyse ----------------------------------------------------
  { methode: "GET", route: "/api/review/queue", niveau: "analyste" },
  { methode: "GET", route: "/api/review/stats", niveau: "analyste" },
  { methode: "POST", route: "/api/review/refuser-sans-indice", niveau: "admin", motif: "refus groupé : décision administrative" },
  { methode: "POST", route: "/api/review/:id/decision", niveau: "analyste" },
  { methode: "POST", route: "/api/quarantine/review", niveau: "analyste" },
  { methode: "POST", route: "/api/quarantine/:id/promote", niveau: "analyste" },
  { methode: "POST", route: "/api/orgs/from-hint", niveau: "analyste" },
  { methode: "POST", route: "/api/alerts/:id/ack", niveau: "analyste" },
  { methode: "POST", route: "/api/alerts/:id/resolve", niveau: "analyste" },
  { methode: "GET", route: "/api/journal/review/export.csv", niveau: "admin" },
  { methode: "GET", route: "/api/journal/review", niveau: "analyste" },
  { methode: "GET", route: "/api/audit/acces", niveau: "admin" },

  // --- Administration et ingestion ----------------------------------------
  { methode: "POST", route: "/api/ingest", niveau: "admin", motif: "ingestion machine à machine" },
  { methode: "POST", route: "/api/sources/:id/morte", niveau: "admin" },
  { methode: "POST", route: "/api/sources/:id/reactiver", niveau: "admin" },

  // --- Droit de réponse -----------------------------------------------------
  { methode: "POST", route: "/api/rectifications", niveau: "public", motif: "demande publique, publication décidée ensuite" },
  { methode: "GET", route: "/api/rectifications", niveau: "analyste" },
  { methode: "GET", route: "/api/rectifications/:id", niveau: "analyste" },
  { methode: "POST", route: "/api/rectifications/:id/decision", niveau: "admin", motif: "publication : décision administrative" },
];

function compiler(route: string): RegExp {
  const source = route
    .split("/")
    .map((part) => (part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}$`);
}

const REGLES_COMPILEES = POLITIQUE_ACCES.map((regle) => ({ regle, motifRoute: compiler(regle.route) }));

/** Première règle correspondante. HEAD suit le régime de GET (Fastify
 *  enregistre automatiquement les routes HEAD). `null` = non déclarée. */
export function reglePour(methode: string, route: string): RegleAcces | null {
  const methodeEffective = methode === "HEAD" ? "GET" : methode;
  for (const { regle, motifRoute } of REGLES_COMPILEES) {
    if (regle.methode === methodeEffective && motifRoute.test(route)) return regle;
  }
  return null;
}

export function accesAutorise(role: string | undefined, niveau: NiveauAcces): boolean {
  if (niveau === "public") return true;
  return role !== undefined && roleSuffit(role, niveau);
}

type EtatAcces = {
  debut: number;
  route: string;
  niveau: string;
  decision: DecisionAcces;
  motif: string | null;
  utilisateur: { id: number; email: string; role: string } | null;
  correlationId: string;
};

const etats = new WeakMap<FastifyRequest, EtatAcces>();

/** Route effective (template `:id`), sans query string. */
export function routeEffective(req: FastifyRequest): string {
  return (req.routeOptions?.url ?? req.url).split("?")[0] ?? "";
}

async function baseSansCompte(): Promise<boolean> {
  const r = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
  return (r.rows[0]?.n ?? 0) === 0;
}

export function installAccessControl(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    const brut = routeEffective(req);
    if (!brut.startsWith("/api/")) return;
    // Les prévolutions CORS sont gérées par @fastify/cors, pas par la matrice.
    if (req.method === "OPTIONS") return;

    const correlation = correlationId(req);
    reply.header("X-Request-Id", correlation);
    const etat: EtatAcces = {
      debut: Date.now(),
      route: brut,
      niveau: "non-declaree",
      decision: "autorise",
      motif: null,
      utilisateur: null,
      correlationId: correlation,
    };
    etats.set(req, etat);

    const regle = reglePour(req.method, brut);
    if (!regle) {
      etat.decision = "refuse";
      etat.motif = "route API non déclarée dans la matrice d'accès";
      throw notFound(etat.motif);
    }
    etat.niveau = regle.niveau;

    // `resolveUser` ne touche la base que si des identifiants sont fournis :
    // les lectures publiques sans jeton restent gratuites.
    const user = await resolveUser(req).catch(() => null);
    if (user) {
      req.user = user;
      etat.utilisateur = { id: user.id, email: user.email, role: user.role };
    }

    if (accesAutorise(user?.role, regle.niveau)) return;
    if (regle.bootstrap && (await baseSansCompte().catch(() => false))) return;

    etat.decision = "refuse";
    etat.motif = user ? `rôle ${user.role} insuffisant ; ${regle.niveau} requis` : "jeton absent";
    throw user ? forbidden(etat.motif) : unauthorized(etat.motif);
  });

  // `onSend` est attendu par Fastify : l'audit est visible dès que la
  // réponse parvient au client (contrairement à `onResponse`).
  app.addHook("onSend", async (req, reply, payload) => {
    const etat = etats.get(req);
    if (!etat) return payload;
    // Un 429 posé par le limiteur de débit, une 500 ou un refus applicatif
    // sont des accès refusés au sens de l'audit, même si la matrice a dit oui.
    if (reply.statusCode >= 400) {
      etat.decision = "refuse";
      etat.motif ??= reply.statusCode === 429 ? "limite de débit atteinte" : `réponse HTTP ${reply.statusCode}`;
    }
    const userAgent = req.headers["user-agent"];
    await enregistrerAcces({
      methode: req.method,
      route: etat.route,
      statut: reply.statusCode,
      decision: etat.decision,
      motif: etat.motif,
      niveauRequis: etat.niveau,
      role: etat.utilisateur?.role ?? null,
      userId: etat.utilisateur?.id ?? null,
      acteur: etat.utilisateur ? `humain:${etat.utilisateur.email}` : "anonyme",
      ipHash: empreinteAudit(req.ip),
      userAgentHash: typeof userAgent === "string" ? empreinteAudit(userAgent) : null,
      correlationId: etat.correlationId,
      dureeMs: Date.now() - etat.debut,
    });

    // Les refus sont aussi des faits de sécurité : ils entrent dans le journal
    // de vérité, qui reste consultable même après la rétention du journal
    // des accès. Les succès n'y vont pas (volume, et aucun fait à auditer).
    if (etat.decision === "refuse") {
      await consigner({
        kind: "acces.refus",
        subject: `acces:${etat.correlationId}`,
        summary: `${req.method} ${etat.route} → ${reply.statusCode} : ${etat.motif ?? "refus"}`,
        // Le journal de vérité ne garde pas l'e-mail en clair : l'identité
        // reste corrélable via le compte, sans devenir une donnée de plus.
        actor: etat.utilisateur ? `compte:${empreinteAudit(etat.utilisateur.email).slice(0, 12)}` : "anonyme",
        payload: {
          statut: reply.statusCode, niveauRequis: etat.niveau, role: etat.utilisateur?.role ?? null,
          route: etat.route, methode: req.method, correlationId: etat.correlationId,
        },
      });
    }
    return payload;
  });
}
