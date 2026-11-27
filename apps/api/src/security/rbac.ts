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
import { API_KEY_HEADER, resolveApiKey } from "../api-key.js";
import { forbidden, notFound, unauthorized } from "../errors.js";
import { enregistrerAcces, empreinteAudit, correlationId, type DecisionAcces } from "./access-log.js";
async function baseSansCompte(): Promise<boolean> {
  const r = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
  return (r.rows[0]?.n ?? 0) === 0;
}

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

/** Résolution unique de l'identité, avant toute décision d'accès (C1/M11). */
const IDENTITE_INSTALLEE = new WeakSet<FastifyInstance>();

export function installIdentityResolution(app: FastifyInstance): void {
  if (IDENTITE_INSTALLEE.has(app)) return;
  IDENTITE_INSTALLEE.add(app);
  app.addHook("onRequest", async (req) => {
    if (!(req.url ?? "").startsWith("/api/")) return;
    // Une session valide l'emporte sur une clé invalide (NET-14) : un client
    // portant les deux ne doit pas être refusé à cause d'une clé périmée.
    const session = await resolveUser(req);
    let apiKey = null;
    if (req.headers[API_KEY_HEADER] !== undefined) {
      try { apiKey = await resolveApiKey(req); }
      catch (erreur) { if (!session) throw erreur; }
    }
    if (apiKey) {
      req.apiKey = apiKey;
      req.user ??= apiKey.owner;
    } else if (session) {
      req.user = session;
    }
  });
}

/** Les règles les plus spécifiques doivent précéder leurs variantes paramétrées. */
export const POLITIQUE_ACCES: RegleAcces[] = [
  // --- Socle et santé -------------------------------------------------------
  { methode: "GET", route: "/api/health", niveau: "public" },
  { methode: "GET", route: "/api/docs", niveau: "public", motif: "documentation OpenAPI" },
  { methode: "GET", route: "/api/docs/json", niveau: "public", motif: "spécification OpenAPI" },
  { methode: "GET", route: "/api/docs/yaml", niveau: "public", motif: "spécification OpenAPI YAML" },
  { methode: "GET", route: "/api/docs/static/*", niveau: "public", motif: "ressources Swagger UI" },
  { methode: "GET", route: "/api/openapi.json", niveau: "public", motif: "spécification OpenAPI" },
  { methode: "GET", route: "/api/auth/me", niveau: "lecteur" },
  { methode: "GET", route: "/api/dossier", niveau: "lecteur" },
  { methode: "POST", route: "/api/auth/login", niveau: "public", motif: "authentification" },
  { methode: "POST", route: "/api/auth/logout", niveau: "lecteur" },
  { methode: "POST", route: "/api/auth/register", niveau: "admin", bootstrap: true },

  // --- Lectures de l'observatoire (jeton facultatif) ------------------------
  { methode: "GET", route: "/api/events", niveau: "public" },
  { methode: "GET", route: "/api/history", niveau: "public" },
  { methode: "GET", route: "/api/health/detail", niveau: "public" },
  { methode: "GET", route: "/api/health/sources", niveau: "public" },
  { methode: "GET", route: "/api/health/causes", niveau: "public" },
  { methode: "GET", route: "/api/today", niveau: "public" },
  { methode: "GET", route: "/api/today/departements", niveau: "public" },
  { methode: "GET", route: "/api/couverture", niveau: "public" },
  { methode: "GET", route: "/api/technical/coverage", niveau: "public" },
  { methode: "GET", route: "/api/coverage/na-departments", niveau: "public" },
  { methode: "GET", route: "/api/leaks/by-domain", niveau: "public" },
  { methode: "GET", route: "/api/warc/proofs", niveau: "public" },
  { methode: "GET", route: "/api/resale/listings", niveau: "public" },
  { methode: "GET", route: "/api/public-data-containers", niveau: "public", motif: "compteurs de dépôts et buckets publics, sans donnée personnelle" },
  { methode: "GET", route: "/api/corpus/stats", niveau: "public" },
  { methode: "GET", route: "/api/actor-attributions", niveau: "public" },
  { methode: "GET", route: "/api/attributions", niveau: "public", motif: "attributions des revendications : groupe, code Admiralty et preuve, sans victime" },
  { methode: "GET", route: "/api/attributions/historique", niveau: "public", motif: "journal des changements d attribution, sans donnee personnelle" },
  { methode: "PATCH", route: "/api/attributions/:claimId", niveau: "analyste", motif: "contestation d attribution par un role applicatif" },
  { methode: "GET", route: "/api/confidence/distribution", niveau: "public" },
  { methode: "GET", route: "/api/confidence/events/:eventId", niveau: "public" },
  { methode: "GET", route: "/api/confidence/attachments/:eventId/:orgId", niveau: "public" },
  { methode: "GET", route: "/api/collecte/metrics", niveau: "public" },
  { methode: "GET", route: "/api/collecte/plan", niveau: "public" },
  { methode: "GET", route: "/api/flows", niveau: "public" },
  { methode: "GET", route: "/api/stats", niveau: "public" },
  { methode: "GET", route: "/api/stats/departements", niveau: "public" },
  { methode: "GET", route: "/api/sources", niveau: "public" },
  { methode: "GET", route: "/api/sources/dashboard", niveau: "public" },
  { methode: "GET", route: "/api/sources/verification", niveau: "public" },
  { methode: "GET", route: "/api/insurance/methodology", niveau: "public", motif: "méthodologie publique du score d'assurance" },
  { methode: "GET", route: "/api/insurance/organisations/:id", niveau: "public", motif: "score d'assurance : agrégats numériques d'une organisation NA, sans donnée de victime" },
  { methode: "GET", route: "/api/directory", niveau: "public" },
  { methode: "GET", route: "/api/public-mandates", niveau: "public" },
  { methode: "GET", route: "/api/cyber-contracts", niveau: "public", motif: "marchés publics cyber : lecture publique, sans donnée personnelle" },
  { methode: "GET", route: "/api/graph", niveau: "public" },
  { methode: "GET", route: "/api/graph/temporal", niveau: "public", motif: "observatoire : lecture du graphe temporel" },
  { methode: "GET", route: "/api/graph/as-of", niveau: "public", motif: "observatoire : graphe interrogeable à toute date, sans donnée personnelle" },
  { methode: "GET", route: "/api/stream", niveau: "public", motif: "flux SSE des alertes en direct, sans donnée personnelle" },
  { methode: "GET", route: "/api/map/timeline/buckets", niveau: "public", motif: "map timeline : comptages agrégés" },
  { methode: "GET", route: "/api/map/timeline/events", niveau: "public", motif: "map timeline : points géolocalisés publics" },
  { methode: "GET", route: "/api/live-map", niveau: "public", motif: "3D map: ongoing attacks, no personal data" },
  { methode: "GET", route: "/api/live-map/stream", niveau: "public", motif: "3D map: attack feed, no personal data" },
  { methode: "GET", route: "/api/search", niveau: "public" },
  { methode: "GET", route: "/api/search/ask", niveau: "public" },
  { methode: "GET", route: "/api/search/ask-fr", niveau: "public", motif: "réponses françaises ancrées : identifiants d'événements, URL de source et run de collecte" },
  { methode: "GET", route: "/api/na/overview", niveau: "public" },
  { methode: "GET", route: "/api/na/events", niveau: "public" },
  { methode: "GET", route: "/api/na/hosting-outage", niveau: "public", motif: "simulation agrégée : noms et identifiants d'organisations jamais exposés" },
  { methode: "GET", route: "/api/enrich/indicator/:id", niveau: "public" },
  { methode: "GET", route: "/api/enrich/domain/:value", niveau: "public" },
  { methode: "GET", route: "/api/enrich/events/:id", niveau: "public" },
  { methode: "GET", route: "/api/enrich/jobs", niveau: "analyste", motif: "file des enrichissements en échec : indicateurs techniques uniquement" },
  { methode: "POST", route: "/api/enrich/jobs/:id/replay", niveau: "admin", motif: "rejeu explicite et borné d'un enrichissement" },
  { methode: "GET", route: "/api/alerts", niveau: "public" },
  { methode: "GET", route: "/api/alerts/stats", niveau: "public" },
  { methode: "GET", route: "/api/alerts/rss.xml", niveau: "public", motif: "public privacy-safe RSS feed" },
  { methode: "GET", route: "/api/quarantine", niveau: "lecteur", motif: "faits de quarantaine : métadonnées de victimes, lecture authentifiée" },
  { methode: "GET", route: "/api/quarantine/:id/raw", niveau: "analyste", motif: "corps brut de quarantaine : niveau 4, lecture authentifiée" },
  { methode: "GET", route: "/api/quarantine/stats", niveau: "lecteur", motif: "statistiques de quarantaine : lecture authentifiée" },
  { methode: "GET", route: "/api/quarantine/queue", niveau: "analyste" },
  { methode: "GET", route: "/api/review-assistant/suggest", niveau: "analyste", motif: "suggestion de revue : aucune donnée de victime" },
  { methode: "GET", route: "/api/onion-index", niveau: "public" },
  { methode: "GET", route: "/api/custody", niveau: "public", motif: "chaîne de custody : métadonnées de source et journal, sans donnée personnelle" },
  { methode: "GET", route: "/api/affected", niveau: "public", motif: "assistant : faits structurés avec preuves, sans donnée personnelle" },
  { methode: "GET", route: "/api/export/misp", niveau: "public", motif: "flux MISP des faits TLP:CLEAR, sans donnée personnelle" },
  { methode: "GET", route: "/api/na/provider-spof", niveau: "public" },
  { methode: "GET", route: "/api/na/providers", niveau: "public" },
  { methode: "GET", route: "/api/na/prestataires-qualifies", niveau: "public", motif: "fiches ANSSI : référence de décision, dates et extrait daté publiés, source nationale" },
  { methode: "GET", route: "/api/attack-path", niveau: "public", motif: "plus court chemin d'attaque entre deux organisations" },
  { methode: "GET", route: "/api/early-warning/global-to-regional", niveau: "public" },
  { methode: "GET", route: "/api/siret/establishments/count", niveau: "public", motif: "compteur public : établissements SIRET rattachés aux sièges" },
  { methode: "GET", route: "/api/orgs", niveau: "public" },
  { methode: "GET", route: "/api/c2/hosted", niveau: "public", motif: "C2 présumés hébergés en Nouvelle-Aquitaine : agrégats et identifiants, sans donnée de victime" },
  { methode: "GET", route: "/api/dns/passive", niveau: "public", motif: "compteurs journaliers de résolutions DNS passives sur le périmètre NA" },
  { methode: "GET", route: "/api/contagion/exposures", niveau: "public", motif: "expositions régionales à 30 jours, sans libellé de victime" },
  { methode: "GET", route: "/api/reconnaissance", niveau: "public", motif: "empreinte agrégée de la phase de reconnaissance, sans hôte, IP ni nom d'organisation" },
  { methode: "GET", route: "/api/scan/campaigns", niveau: "public", motif: "campagnes de scan passif reconstruites depuis des rapports publics, sans texte de victime" },
  { methode: "GET", route: "/api/risk/organisations", niveau: "public", motif: "courbe ROC, AUC et agrégats numériques du modèle de risque" },
  { methode: "GET", route: "/api/risk/organisations/:id", niveau: "public", motif: "score numérique d'une organisation NA, sans donnée de victime" },
  { methode: "GET", route: "/api/attestations-negatives", niveau: "public", motif: "registre public des absences signées, vérifiable sans secret" },
  { methode: "GET", route: "/api/certificat-ignorance", niveau: "public", motif: "champs explicitement inconnus du radar par organisation, sans donnée personnelle" },
  { methode: "GET", route: "/api/registre-traitements/export.csv", niveau: "public", motif: "registre des traitements : identifiants et noms de sources publiques, sans donnée personnelle" },
  { methode: "GET", route: "/api/violations-rgpd/export.csv", niveau: "public", motif: "registre des violations suspectées : identifiants publics, dates et statut, aucune donnée personnelle" },

  // --- Lectures authentifiées ----------------------------------------------
  { methode: "GET", route: "/api/alerts/:id", niveau: "lecteur" },
  { methode: "GET", route: "/api/ransomware-groups", niveau: "lecteur", motif: "groupes et victimes nommées de Nouvelle-Aquitaine : lecture authentifiée" },
  { methode: "GET", route: "/api/exposition/new-services", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/liees", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/liees/historique", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/:id", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/:id/rectifications", niveau: "lecteur" },
  { methode: "GET", route: "/api/orgs/:id/report.pdf", niveau: "lecteur", motif: "rapport PDF agrégé, sans donnée personnelle" },

  // --- Listes de veille -----------------------------------------------------
  // L'observatoire déclare ce qu'il surveille ; la lecture des listes est
  // ouverte aux comptes, leur écriture engage la veille et reste analyste.
  { methode: "GET", route: "/api/watchlists", niveau: "lecteur" },
  // --- Suivi interne des violations RGPD (SEC-06) ---------------------------
  { methode: "GET", route: "/api/violations-rgpd", niveau: "analyste", motif: "registre opérationnel : aucune donnée de victime" },
  { methode: "GET", route: "/api/violations-rgpd/stats", niveau: "analyste", motif: "compteurs d'échéance et de qualification" },
  { methode: "GET", route: "/api/violations-rgpd/:id", niveau: "analyste", motif: "dossier de violation : métadonnées publiques" },
  { methode: "POST", route: "/api/violations-rgpd/:id/qualification", niveau: "analyste", motif: "qualification d'une violation suspectée" },
  { methode: "POST", route: "/api/violations-rgpd/:id/notification", niveau: "analyste", motif: "déclaration de notification à l'autorité" },
  { methode: "POST", route: "/api/violations-rgpd/:id/cloture", niveau: "admin", motif: "clôture : décision administrative" },
  { methode: "GET", route: "/api/watchlists/:slug", niveau: "lecteur" },
  { methode: "POST", route: "/api/watchlists", niveau: "analyste" },
  { methode: "PUT", route: "/api/watchlists/:slug", niveau: "analyste" },
  { methode: "POST", route: "/api/watchlists/:slug/items", niveau: "analyste" },
  { methode: "DELETE", route: "/api/watchlists/:slug/items/:itemId", niveau: "analyste" },
  { methode: "DELETE", route: "/api/watchlists/:slug", niveau: "analyste" },

  // --- Travail d'analyse ----------------------------------------------------
  { methode: "GET", route: "/api/review/queue", niveau: "analyste" },
  { methode: "GET", route: "/api/review/stats", niveau: "analyste" },
  { methode: "GET", route: "/api/journal/review", niveau: "analyste" },
  { methode: "GET", route: "/api/journal/review/export.csv", niveau: "admin", motif: "export de la revue: décisions et preuves internes" },
  { methode: "POST", route: "/api/review/:id/rejouer-alertes", niveau: "analyste", motif: "rejeu borné des alertes après promotion" },
  { methode: "GET", route: "/api/audit/acces", niveau: "admin", motif: "journal des accès: administration uniquement" },
  { methode: "POST", route: "/api/review/refuser-sans-indice", niveau: "admin", motif: "refus groupé : décision administrative" },
  { methode: "POST", route: "/api/review/:id/decision", niveau: "analyste" },
  { methode: "POST", route: "/api/quarantine/review", niveau: "analyste" },
  { methode: "POST", route: "/api/quarantine/:id/promote", niveau: "analyste" },
  { methode: "POST", route: "/api/orgs/from-hint", niveau: "analyste" },
  { methode: "POST", route: "/api/alerts/:id/ack", niveau: "analyste" },
  { methode: "POST", route: "/api/alerts/:id/resolve", niveau: "analyste" },
  { methode: "POST", route: "/api/sources/:id/morte", niveau: "admin" },
  { methode: "POST", route: "/api/sources/:id/reactiver", niveau: "admin" },
  { methode: "POST", route: "/api/sources/:id/collecte", niveau: "admin", motif: "relance manuelle d'une collecte" },
  { methode: "POST", route: "/api/thehive/cases", niveau: "admin", motif: "case creation in an external tool" },
  { methode: "POST", route: "/api/keys", niveau: "lecteur" },
  { methode: "GET", route: "/api/keys", niveau: "lecteur" },
  { methode: "DELETE", route: "/api/keys/:id", niveau: "lecteur" },
  { methode: "POST", route: "/api/ingest", niveau: "admin", motif: "ingestion machine à machine" },


  // --- Droit de réponse -----------------------------------------------------
  { methode: "POST", route: "/api/rectifications", niveau: "public", motif: "demande publique, publication décidée ensuite" },
  { methode: "GET", route: "/api/rectifications", niveau: "analyste" },
  { methode: "GET", route: "/api/rectifications/:id", niveau: "analyste" },
  { methode: "POST", route: "/api/rectifications/:id/decision", niveau: "admin", motif: "publication : décision administrative" },
];

function compiler(route: string): RegExp {
  const source = route
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) return "[^/]+";
      if (part === "*") return ".*";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${source}$`);
}

const REGLES_COMPILEES = POLITIQUE_ACCES.map((regle) => ({ regle, motifRoute: compiler(regle.route) }));

/** Première règle correspondante. HEAD suit le régime de GET (Fastify
 *  enregistre automatiquement les routes HEAD). `null` = non déclarée. */
export function reglePour(methode: string, route: string): RegleAcces | null {
  const methodeEffective = methode === "HEAD" ? "GET" : methode;
  // /api/v1/... est un alias de /api/... : une seule matrice pour les deux.
  let routeEffective = route.startsWith("/api/v1/")
    ? `/api${route.slice("/api/v1".length)}`
    : route;
  if (routeEffective.length > 1) routeEffective = routeEffective.replace(/\/$/, "");
  for (const { regle, motifRoute } of REGLES_COMPILEES) {
    if (regle.methode === methodeEffective && motifRoute.test(routeEffective)) return regle;
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

const CONTROLE_INSTALLE = new WeakSet<FastifyInstance>();


/** Écrit la décision d'accès dans le journal des accès (SSE compris). */
async function tracerDecision(req: FastifyRequest, etat: EtatAcces, statut: number): Promise<void> {
  const userAgent = req.headers["user-agent"];
  await enregistrerAcces({
    methode: req.method,
    route: etat.route,
    statut,
    decision: etat.decision,
    motif: etat.motif,
    niveauRequis: etat.niveau,
    role: etat.utilisateur?.role ?? null,
    userId: etat.utilisateur?.id ?? null,
    // Une adresse e-mail n'a rien à faire dans un journal append-only (CMP-01).
    acteur: etat.utilisateur ? `compte:${empreinteAudit(etat.utilisateur.email).slice(0, 12)}` : "anonyme",
    ipHash: empreinteAudit(req.ip),
    ip: req.ip,
    userAgent: typeof userAgent === "string" ? userAgent : null,
    userAgentHash: typeof userAgent === "string" ? empreinteAudit(userAgent) : null,
    correlationId: etat.correlationId,
    dureeMs: Date.now() - etat.debut,
  });
}

/**
 * Les réponses SSE appellent `reply.hijack()` : les hooks `onSend` ne voient
 * jamais leur réponse. Le flux doit donc tracer son ouverture explicitement,
 * avec le même format que les autres accès (E7).
 */
export async function auditerFluxSse(req: FastifyRequest): Promise<void> {
  const etat = etats.get(req);
  const user = req.user;
  const route = routeEffective(req);
  await tracerDecision(req, {
    debut: etat?.debut ?? Date.now(),
    route,
    niveau: etat?.niveau ?? reglePour(req.method, route)?.niveau ?? "public",
    decision: "autorise",
    motif: "flux SSE (réponse hijackée, audit explicite)",
    utilisateur: user ? { id: user.id, email: user.email, role: user.role } : null,
    correlationId: etat?.correlationId ?? correlationId(req),
  }, 200);
}
export function installAccessControl(app: FastifyInstance): void {
  if (CONTROLE_INSTALLE.has(app)) return;
  CONTROLE_INSTALLE.add(app);
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

    // L'identité a déjà été résolue par `installIdentityResolution` : un
    // second SELECT par requête était purement évitable (M11).
    const user = req.user ?? await resolveUser(req).catch(() => null);
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
    await tracerDecision(req, etat, reply.statusCode);

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
