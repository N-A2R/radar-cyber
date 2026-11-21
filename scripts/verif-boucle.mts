/**
 * Vérification de bout en bout des TROIS décisions de la file de revue :
 *
 *   1. accepter avec un orgId existant → événement attaché à cette org ;
 *   2. refuser                         → ligne classée `rejected`, aucun événement ;
 *   3. creer                           → organisation créée, événement attaché.
 *
 * Chaque décision porte sur une ligne en attente RÉELLE de la base 5433,
 * relève le compteur `/api/orgs/liees` avant/après, appelle
 * POST /api/review/:id/decision, vérifie l'effet en SQL, puis restaure la base
 * et revérifie les compteurs. Trois blocs OK/ÉCHEC et un résumé global.
 *
 * Choix documentés :
 * - le journal est append-only (migration 027) : ses faits sont conservés.
 *   Le compteur `examinees` reste donc relevé d'un sujet par décision ; les
 *   compteurs `semaine`, `total` et `enAttente` doivent, eux, revenir au départ.
 * - ce script ne démarre PAS l'API. Il reçoit son URL (--api / RADAR_API_URL,
 *   défaut http://127.0.0.1:18100) et exige un port >= 18100, pour ne jamais
 *   toucher au service systemd sur 8080. La base est imposée en 5433
 *   (RADAR_TEST_DB_URL ne peut pas la remplacer par la prod).
 * - le jeton d'authentification est créé pour l'occasion dans la base de test
 *   (session valable une heure, supprimée en fin de script), sauf --token /
 *   RADAR_TOKEN fourni.
 *
 * Rejouer :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *   PORT=18100 RADAR_COLLECT=0 apps/api/node_modules/.bin/tsx apps/api/src/server.ts &
 *   apps/api/node_modules/.bin/tsx scripts/verif-boucle.mts --api http://127.0.0.1:18100
 */
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

// pnpm cloisonne les dépendances : `pg` est installé dans apps/api, pas à la
// racine (même motif que scripts/quarantine-review.mts).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");
import type { QueryResultRow } from "pg";

type Row = Record<string, unknown>;
type Decision = "accepter" | "refuser" | "creer";

const DB_URL = process.env.RADAR_TEST_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";
const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const exact = args.indexOf(`--${name}`);
  if (exact >= 0) return args[exact + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const API_URL = (argValue("api") ?? process.env.RADAR_API_URL ?? "http://127.0.0.1:18100").replace(/\/+$/, "");
const RAISON = argValue("raison") ?? "décision de revue vérifiée par script";

const resultats: { bloc: string; label: string; ok: boolean }[] = [];
const ciblesChoisies: Record<string, number | string> = {};
let echecs = 0;

function etape(bloc: string, label: string, ok: boolean, detail?: string): boolean {
  resultats.push({ bloc, ok, label });
  if (!ok) echecs += 1;
  const suffixe = detail ? ` — ${detail}` : "";
  console.log(`[${bloc}] ${ok ? "OK" : "ÉCHEC"}  ${label}${suffixe}`);
  return ok;
}

function texteErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function verifierPorts(): void {
  if (/(^|:)5432(\/|$)/.test(DB_URL)) {
    throw new Error(`refus de toucher à la base de production : ${DB_URL}`);
  }
  if (!/:5433(\/|$)/.test(DB_URL)) {
    throw new Error(`base de test attendue sur le port 5433, reçu : ${DB_URL}`);
  }
  const url = new URL(API_URL);
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (!Number.isInteger(port) || port < 18100) {
    throw new Error(`port API ${port} interdit : utiliser un port >= 18100 (jamais 8080)`);
  }
}

async function query<T extends QueryResultRow>(client: InstanceType<typeof Client>, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await client.query<T>(sql, params);
  return r.rows;
}

type Reponse = { status: number; body: unknown; raw: string };

async function appel(path: string, init: RequestInit, token: string): Promise<Reponse> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // Une erreur HTML de Fastify reste lisible telle quelle dans le rapport.
  }
  return { status: res.status, body, raw };
}

type Compteur = { semaine: number; total: number; enAttente: number; examinees: number };

function releveCompteur(body: unknown): Compteur | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  // `total` = promotions depuis toujours ; `enAttente` = file de revue ;
  // `examinees` = sujets distincts du journal (append-only, non restaurable).
  if (["semaine", "total", "enAttente", "examinees"].some((k) => typeof o[k] !== "number")) return null;
  return {
    semaine: o.semaine as number,
    total: o.total as number,
    enAttente: o.enAttente as number,
    examinees: o.examinees as number,
  };
}

async function releveViaApi(bloc: string, phase: string, token: string): Promise<Compteur> {
  const reponse = await appel("/api/orgs/liees", { method: "GET" }, token);
  const c = releveCompteur(reponse.body);
  if (reponse.status !== 200 || !c) {
    throw new Error(`${phase} : HTTP ${reponse.status} — ${reponse.raw.slice(0, 800)}`);
  }
  etape(bloc, phase, true,
    `semaine=${c.semaine} total=${c.total} enAttente=${c.enAttente} examinees=${c.examinees}`);
  return c;
}

function verifierCompteur(bloc: string, phase: string, c: Compteur, attendu: Partial<Compteur>): boolean {
  const problemes = Object.entries(attendu)
    .filter(([k, v]) => c[k as keyof Compteur] !== v)
    .map(([k, v]) => `${k}=${c[k as keyof Compteur]} attendu ${v}`);
  return etape(bloc, phase, problemes.length === 0,
    `semaine=${c.semaine} total=${c.total} enAttente=${c.enAttente} examinees=${c.examinees}` +
      (problemes.length > 0 ? ` ; ${problemes.join(" ; ")}` : ""));
}

/** Valeur SQL : pg gère les Date, mais pas les objets JSON brace à brace. */
function valeurSql(v: unknown): unknown {
  return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
}

type Scenario = {
  cle: Decision;
  cible: Row | null;
  etatInitial: Row | null;
  evenementsAvant: Map<number, Row>;
  orgId: number | null;
  orgName: string | null;
  eventId: number | null;
  cree: boolean | null;
  compteurAvant: Compteur | null;
  sujetDejaJournalise: boolean;
  debut: Date;
};

function nouveauScenario(cle: Decision): Scenario {
  return {
    cle, cible: null, etatInitial: null,
    evenementsAvant: new Map(), orgId: null, orgName: null, eventId: null,
    cree: null, compteurAvant: null, sujetDejaJournalise: false,
    debut: new Date(Date.now() - 5000),
  };
}

const client = new Client({ connectionString: DB_URL });
let connecte = false;
let tokenEmprunte: string | null = null;
let sessionCreee = false;

async function restaurerLigne(table: string, id: number, ligne: Row): Promise<number> {
  if (table !== "event" && table !== "quarantine_raw") throw new Error(`table non autorisée : ${table}`);
  const colonnes = Object.keys(ligne).filter((k) => k !== "id");
  const valeurs = colonnes.map((k) => valeurSql(ligne[k]));
  const affectations = colonnes.map((k, i) => `${k}=$${i + 1}`).join(", ");
  const r = await client.query(
    `UPDATE ${table} SET ${affectations} WHERE id=$${colonnes.length + 1}`,
    [...valeurs, id],
  );
  return r.rowCount ?? 0;
}

function ligneIdentique(apres: Row | null, avant: Row | null): boolean {
  if (!avant || !apres) return false;
  return Object.keys(avant).every((k) => JSON.stringify(apres[k]) === JSON.stringify(avant[k]));
}

async function preparer(s: Scenario, cible: Row): Promise<void> {
  s.cible = cible;
  ciblesChoisies[s.cle] = Number(cible.id);
  const initiaux = await query<Row>(client, "SELECT * FROM quarantine_raw WHERE id=$1", [cible.id]);
  s.etatInitial = initiaux[0] ?? null;
  if (!s.etatInitial) throw new Error(`état initial de la ligne ${cible.id} introuvable`);

  const dedupKey = `quarantine:${String(cible.content_hash)}`;
  const evenements = await query<Row>(client, "SELECT * FROM event WHERE dedup_key=$1", [dedupKey]);
  s.evenementsAvant = new Map(evenements.map((e) => [Number(e.id), e]));

  // Le journal de décision porte `quarantine:<id>` (pas le dedup_key par hash).
  const deja = await query<{ n: number }>(client,
    "SELECT count(*)::int AS n FROM journal WHERE kind='review.decided' AND subject=$1", [`quarantine:${cible.id}`]);
  s.sujetDejaJournalise = (deja[0]?.n ?? 0) > 0;

  etape(s.cle, "Ligne en attente choisie", true,
    `id=${cible.id} source=${String(cible.source)} indice=${String(cible.org_hint)} ` +
      `dedup=${dedupKey} événement(s) préexistant(s)=${s.evenementsAvant.size}`);
  s.compteurAvant = await releveViaApi(s.cle, "Compteur avant", tokenEmprunte!);
}

async function poster(s: Scenario, corps: object): Promise<{ status: number; body: Row | null; raw: string }> {
  const chemin = `/api/review/${s.cible!.id}/decision`;
  const reponse = await appel(chemin, { method: "POST", body: JSON.stringify(corps) }, tokenEmprunte!);
  const body = (reponse.body !== null && typeof reponse.body === "object" && !Array.isArray(reponse.body))
    ? reponse.body as Row : null;
  etape(s.cle, "POST /api/review/:id/decision", reponse.status === 200,
    `${chemin} → HTTP ${reponse.status}${reponse.status === 200 ? "" : ` — ${reponse.raw.slice(0, 500)}`}`);
  if (reponse.status !== 200) throw new Error(`décision ${s.cle} refusée : HTTP ${reponse.status}`);
  return { status: reponse.status, body, raw: reponse.raw };
}

async function verifierApresDecision(s: Scenario, deltaTotal: number): Promise<void> {
  const c = await releveViaApi(s.cle, "Compteur après décision", tokenEmprunte!);
  verifierCompteur(s.cle, "Compteur cohérent avec la décision", c, {
    total: s.compteurAvant!.total + deltaTotal,
    enAttente: s.compteurAvant!.enAttente - 1,
    examinees: s.compteurAvant!.examinees + (s.sujetDejaJournalise ? 0 : 1),
  });
}

async function traceDecision(s: Scenario): Promise<Row | null> {
  const traces = await query<Row>(client,
    `SELECT id, kind, summary, payload FROM journal
      WHERE kind='review.decided' AND subject=$1 AND recorded_at >= $2
      ORDER BY id DESC LIMIT 10`,
    [`quarantine:${s.cible!.id}`, s.debut]);
  const attendu = s.cle === "refuser" ? "refuser" : s.cle;
  return traces.find((t) => {
    const p = t.payload as Row | null;
    if (p?.decision === attendu) return true;
    if (s.cle === "refuser") return p?.action === "reject";
    return p?.action === "promote" && String(t.summary).startsWith(attendu);
  }) ?? null;
}

async function verifierTrace(s: Scenario): Promise<void> {
  const trace = await traceDecision(s);
  etape(s.cle, "Décision journalisée", Boolean(trace),
    trace
      ? `journal id=${String(trace.id)} kind=${String(trace.kind)} — ${String(trace.summary)}`
      : `aucune trace ${s.cle} depuis ${s.debut.toISOString()}`);
}

async function verifierPromotion(s: Scenario, orgIdAttendu: number): Promise<void> {
  const etat = await query<Row>(client,
    "SELECT status, promoted FROM quarantine_raw WHERE id=$1", [s.cible!.id]);
  etape(s.cle, "Ligne promotionnée", etat[0]?.status === "promoted" && etat[0]?.promoted === true,
    `status=${String(etat[0]?.status)} promoted=${String(etat[0]?.promoted)}`);

  const evenement = await query<Row>(client,
    "SELECT id, org_id, dedup_key FROM event WHERE id=$1", [s.eventId ?? -1]);
  etape(s.cle, "Événement attaché à l'organisation", evenement[0]?.org_id === orgIdAttendu,
    `event=${String(s.eventId)} org_id=${String(evenement[0]?.org_id)} attendu=${orgIdAttendu}`);
}

async function scenarioAccepter(s: Scenario, org: Row): Promise<void> {
  s.orgId = Number(org.id);
  s.orgName = String(org.name);
  const reponse = await poster(s, { decision: "accepter", orgId: s.orgId, raison: RAISON });
  s.eventId = typeof reponse.body?.eventId === "number" ? reponse.body.eventId : null;
  etape(s.cle, "Organisation existante utilisée", reponse.body?.orgId === s.orgId,
    `orgId=${s.orgId} (${s.orgName}) réponse=${JSON.stringify(reponse.body).slice(0, 400)}`);
  await verifierApresDecision(s, 1);
  await verifierPromotion(s, s.orgId);
  await verifierTrace(s);
}

async function scenarioRefuser(s: Scenario): Promise<void> {
  const reponse = await poster(s, { decision: "refuser", raison: RAISON });
  etape(s.cle, "Aucun événement créé", reponse.body?.status === "rejected" && reponse.body?.eventId === undefined,
    JSON.stringify(reponse.body).slice(0, 400));
  await verifierApresDecision(s, 0);
  const etat = await query<Row>(client,
    "SELECT status, promoted FROM quarantine_raw WHERE id=$1", [s.cible!.id]);
  etape(s.cle, "Ligne refusée en SQL", etat[0]?.status === "rejected" && etat[0]?.promoted === false,
    `status=${String(etat[0]?.status)} promoted=${String(etat[0]?.promoted)}`);
  const evenements = await query<{ n: number }>(client,
    "SELECT count(*)::int AS n FROM event WHERE dedup_key=$1", [`quarantine:${String(s.cible!.content_hash)}`]);
  etape(s.cle, "Aucun événement pour la ligne refusée",
    (evenements[0]?.n ?? 0) === s.evenementsAvant.size,
    `${evenements[0]?.n ?? 0} événement(s), ${s.evenementsAvant.size} avant décision`);
  await verifierTrace(s);
}

async function scenarioCreer(s: Scenario): Promise<void> {
  const reponse = await poster(s, { decision: "creer", raison: RAISON });
  s.orgId = typeof reponse.body?.orgId === "number" ? reponse.body.orgId : null;
  s.orgName = typeof reponse.body?.orgName === "string" ? reponse.body.orgName : null;
  s.eventId = typeof reponse.body?.eventId === "number" ? reponse.body.eventId : null;
  s.cree = reponse.body?.cree === true;
  etape(s.cle, "Création d'organisation", s.cree === true && s.orgId !== null,
    JSON.stringify(reponse.body).slice(0, 600));
  if (s.orgId === null || s.eventId === null) {
    throw new Error(`réponse inexploitable (orgId/eventId absents) : ${reponse.raw.slice(0, 800)}`);
  }
  await verifierApresDecision(s, 1);
  await verifierPromotion(s, s.orgId);
  const organ = await query<{ name: string }>(client, "SELECT name FROM org WHERE id=$1", [s.orgId]);
  etape(s.cle, "Organisation créée présente en SQL", organ[0]?.name === s.orgName,
    `org=${s.orgId} nom=${String(organ[0]?.name)} attendu=${String(s.orgName)}`);
  await verifierTrace(s);
}

async function nettoieScenario(s: Scenario): Promise<void> {
  if (!connecte || !s.cible || !s.etatInitial) return;
  const supprimes: Record<string, number | string> = {};
  try {
    await client.query("BEGIN");

    if (s.eventId !== null) {
      const avant = s.evenementsAvant.get(s.eventId);
      if (avant) {
        supprimes["evenement_restaure"] = await restaurerLigne("event", s.eventId, avant);
      } else {
        const alertes = await client.query(
          "DELETE FROM alert WHERE event_id=$1 AND created_at >= $2", [s.eventId, s.debut],
        );
        const evenement = await client.query("DELETE FROM event WHERE id=$1", [s.eventId]);
        supprimes["alertes_supprimees"] = alertes.rowCount ?? 0;
        supprimes["evenements_supprimes"] = evenement.rowCount ?? 0;
      }
    }

    if (s.orgId !== null && s.cree === true) {
      const comptes = await query<{ asset: string; alias: string; histoire: string }>(client,
        `SELECT
           (SELECT count(*)::text FROM asset WHERE org_id=$1) AS asset,
           (SELECT count(*)::text FROM org_alias WHERE org_id=$1) AS alias,
           (SELECT count(*)::text FROM org_history WHERE org_id=$1) AS histoire`, [s.orgId]);
      const organ = await query<{ name: string }>(client, "SELECT name FROM org WHERE id=$1", [s.orgId]);
      const n = await client.query("DELETE FROM org WHERE id=$1", [s.orgId]);
      supprimes["organisation_supprimee"] = n.rowCount ?? 0;
      supprimes["organisation_nom"] = organ[0]?.name ?? s.orgName ?? "?";
      supprimes["assets_supprimes"] = Number(comptes[0]?.asset ?? 0);
      supprimes["alias_supprimes"] = Number(comptes[0]?.alias ?? 0);
      supprimes["historique_supprime"] = Number(comptes[0]?.histoire ?? 0);
    }

    supprimes["quarantaine_restauree"] =
      await restaurerLigne("quarantine_raw", Number(s.cible.id), s.etatInitial);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Le rollback est lui aussi signalé par l'erreur principale.
    }
    console.error(`!!!! NETTOYAGE ÉCHOUÉ — intervention manuelle requise : ${texteErreur(err)}`);
    etape(s.cle, "Nettoyage", false, `échec BRUYANT, transaction annulée : ${texteErreur(err)}`);
    return;
  }

  const problemes: string[] = [];
  try {
    const apres = await query<Row>(client, "SELECT * FROM quarantine_raw WHERE id=$1", [s.cible.id]);
    if (!ligneIdentique(apres[0] ?? null, s.etatInitial)) {
      problemes.push(`quarantaine ${s.cible.id} pas revenue à l'état initial`);
    }
    if (s.eventId !== null) {
      const avant = s.evenementsAvant.get(s.eventId);
      if (avant) {
        const eventApres = await query<Row>(client, "SELECT * FROM event WHERE id=$1", [s.eventId]);
        if (!ligneIdentique(eventApres[0] ?? null, avant)) problemes.push(`événement ${s.eventId} pas restauré`);
      } else {
        const reste = await query<{ n: number }>(client, "SELECT count(*)::int AS n FROM event WHERE id=$1", [s.eventId]);
        if ((reste[0]?.n ?? 0) !== 0) problemes.push(`événement ${s.eventId} encore présent`);
      }
    }
    if (s.orgId !== null && s.cree === true) {
      const reste = await query<{ n: number }>(client, "SELECT count(*)::int AS n FROM org WHERE id=$1", [s.orgId]);
      if ((reste[0]?.n ?? 0) !== 0) problemes.push(`organisation ${s.orgId} encore présente`);
    }
  } catch (err) {
    problemes.push(texteErreur(err));
  }

  if (s.compteurAvant) {
    try {
      const c = await releveViaApi(s.cle, "Compteur après nettoyage", tokenEmprunte!);
      verifierCompteur(s.cle, "Retour au départ", c, {
        total: s.compteurAvant.total,
        enAttente: s.compteurAvant.enAttente,
        // Le journal est append-only : l'inscription du sujet reste, elle est
        // attendue et vérifiée, mais elle n'est pas un retour au départ.
        examinees: s.compteurAvant.examinees + (s.sujetDejaJournalise ? 0 : 1),
      });
      if (c.semaine !== s.compteurAvant.semaine) {
        problemes.push(`semaine=${c.semaine} ≠ départ ${s.compteurAvant.semaine}`);
      }
    } catch (err) {
      problemes.push(`compteur après nettoyage : ${texteErreur(err)}`);
    }
  }

  if (problemes.length > 0) {
    console.error(`!!!! NETTOYAGE INCOMPLET — ${problemes.join(" ; ")}`);
    etape(s.cle, "Nettoyage", false, problemes.join(" ; "));
    return;
  }

  const detail = Object.entries(supprimes).map(([k, v]) => `${k}=${v}`).join(", ");
  etape(s.cle, "Nettoyage", true,
    `${detail || "rien à supprimer"}; semaine/total/enAttente revenus au départ; journal conservé (append-only)`);
}

async function nettoieSession(): Promise<void> {
  if (!connecte || !sessionCreee || !tokenEmprunte) return;
  try {
    await client.query("BEGIN");
    const s = await client.query("DELETE FROM app_session WHERE token=$1", [hashToken(tokenEmprunte)]);
    await client.query("COMMIT");
    etape("session", "Jeton éphémère supprimé", true, `lignes=${s.rowCount ?? 0}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // L'erreur principale est déjà signalée.
    }
    etape("session", "Jeton éphémère supprimé", false, texteErreur(err));
  }
}

async function main(): Promise<void> {
  verifierPorts();
  await client.connect();
  connecte = true;
  etape("base", "Connexion base de test 5433", true, DB_URL);

  // La cible `creer` est la plus contrainte : indice .com absent du registre
  // (domaine ET nom). Elle est réservée en premier pour garantir trois lignes
  // distinctes, avec trois content_hash distincts (donc trois dedup_key).
  const pourCreer = await query<Row>(client,
    `SELECT q.id, q.source, q.org_hint, q.content_hash
       FROM (
         SELECT q.*, NOT EXISTS (
           SELECT 1 FROM org o
            WHERE lower(o.domain)=lower(q.org_hint) OR lower(o.name)=lower(q.org_hint)
         ) AS libre
         FROM quarantine_raw q
       ) q
      WHERE q.kind='claim' AND q.status='pending' AND q.promoted=false
        AND q.org_hint ILIKE '%.com' AND q.libre = true
      ORDER BY q.id DESC
      LIMIT 1`);
  if (!pourCreer[0]) throw new Error("aucune quarantaine en attente avec un indice .com absent du registre (domaine et nom)");
  const cibleCreer = pourCreer[0];

  const autres = await query<Row>(client,
    `SELECT id, source, org_hint, content_hash FROM quarantine_raw
      WHERE kind='claim' AND status='pending' AND promoted=false
        AND btrim(coalesce(org_hint, '')) <> ''
        AND id <> $1 AND content_hash <> $2
      ORDER BY id DESC
      LIMIT 2`, [cibleCreer.id, cibleCreer.content_hash]);
  if (autres.length < 2) throw new Error("moins de deux autres lignes en attente avec un indice pour accepter/refuser");
  const cibleAccepter = autres[0];
  const cibleRefuser = autres[1];

  const organ = await query<Row>(client,
    "SELECT id, name FROM org WHERE btrim(name) <> '' ORDER BY id LIMIT 1");
  if (!organ[0]) throw new Error("aucune organisation existante pour la décision accepter");

  const fourni = argValue("token") ?? process.env.RADAR_TOKEN;
  if (fourni) {
    tokenEmprunte = fourni;
    etape("auth", "Jeton d'authentification", true, "jeton fourni (non créé par le script)");
  } else {
    tokenEmprunte = randomBytes(32).toString("hex");
    const admin = await query<{ id: number }>(client,
      "SELECT id FROM app_user WHERE role='admin' ORDER BY id LIMIT 1");
    if (!admin[0]) throw new Error("aucun admin dans la base de test pour créer un jeton");
    await client.query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2,$3)",
      [hashToken(tokenEmprunte), admin[0].id, new Date(Date.now() + 3600_000).toISOString()],
    );
    sessionCreee = true;
    etape("auth", "Jeton d'authentification", true, "session éphémère créée en base de test (supprimée en fin)");
  }

  const blocs: { cle: Decision; titre: string; cible: Row; action: (s: Scenario) => Promise<void> }[] = [
    { cle: "accepter", titre: "accepter avec un orgId existant", cible: cibleAccepter, action: (s) => scenarioAccepter(s, organ[0]) },
    { cle: "refuser", titre: "refuser", cible: cibleRefuser, action: (s) => scenarioRefuser(s) },
    { cle: "creer", titre: "creer", cible: cibleCreer, action: (s) => scenarioCreer(s) },
  ];

  for (const [i, bloc] of blocs.entries()) {
    console.log(`\n=== BLOC ${i + 1}/3 — ${bloc.titre} (ligne ${bloc.cible.id}) ===`);
    const s = nouveauScenario(bloc.cle);
    try {
      await preparer(s, bloc.cible);
      await bloc.action(s);
    } catch (err) {
      etape(s.cle, "Arrêt sur erreur", false, texteErreur(err));
    } finally {
      await nettoieScenario(s);
    }
    const ok = resultats.filter((r) => r.bloc === s.cle).every((r) => r.ok);
    console.log(`=== BLOC ${i + 1}/3 — ${bloc.titre} : ${ok ? "OK" : "ÉCHEC"} ===\n`);
  }
}

try {
  await main();
} catch (err) {
  etape("global", "Arrêt sur erreur", false, texteErreur(err));
} finally {
  await nettoieSession();
  if (connecte) {
    try {
      await client.end();
    } catch {
      // Rien à signaler : le nettoyage transactionnel est déjà terminé.
    }
  }
  const ok = resultats.filter((r) => r.ok).length;
  const blocsOk = (["accepter", "refuser", "creer"] as const)
    .filter((cle) => resultats.some((r) => r.bloc === cle) && resultats.filter((r) => r.bloc === cle).every((r) => r.ok)).length;
  console.log(`RÉSUMÉ  ${blocsOk}/3 blocs OK — ${ok} OK / ${echecs} ÉCHEC — ${resultats.length} étapes`);
  console.log(`RÉSUMÉ  cibles : accepter=${ciblesChoisies.accepter ?? "-"} refuser=${ciblesChoisies.refuser ?? "-"} creer=${ciblesChoisies.creer ?? "-"}`);
  console.log("RÉSUMÉ  journal append-only conservé : examinees reste relevé d'un sujet par décision");
  process.exitCode = echecs > 0 || blocsOk !== 3 ? 1 : 0;
}
