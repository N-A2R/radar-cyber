/**
 * Vérification de bout en bout de la boucle complète de revue :
 *
 *   indice étranger en attente → création d'organisation → décision
 *   → événement attaché → compteur /orgs/liees qui monte.
 *
 * Choix documenté : ce script ne démarre PAS l'API. Il reçoit son URL
 * (--api / RADAR_API_URL, défaut http://127.0.0.1:18100) et exige un port
 * >= 18100, pour ne jamais toucher au service systemd sur 8080. La base est
 * imposée en 5433 (RADAR_TEST_DB_URL ne peut pas la remplacer par la prod).
 *
 * Le jeton d'authentification est, par défaut, créé pour l'occasion dans la
 * base de test (session valable une heure, supprimée en fin de script). On
 * peut aussi passer --token / RADAR_TOKEN pour réutiliser un jeton existant.
 *
 * Rejouer (après fusion des branches wave/revue-1 et du compteur) :
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

const DB_URL = process.env.RADAR_TEST_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";
const args = process.argv.slice(2);

function argValue(name: string): string | undefined {
  const exact = args.indexOf(`--${name}`);
  if (exact >= 0) return args[exact + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const API_URL = (argValue("api") ?? process.env.RADAR_API_URL ?? "http://127.0.0.1:18100").replace(/\/+$/, "");
const RAISON = argValue("raison") ?? "Vérification de bout en bout : indice étranger créé puis rattaché";

const resultats: { label: string; ok: boolean }[] = [];
let echecs = 0;

function etape(label: string, ok: boolean, detail?: string): boolean {
  resultats.push({ label, ok });
  if (!ok) echecs += 1;
  const suffixe = detail ? ` — ${detail}` : "";
  console.log(`${ok ? "OK" : "ÉCHEC"}  ${label}${suffixe}`);
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

function extraitCompteur(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  // `semaine` est la définition livrée : distinct org_id d'événements sur 7 j.
  for (const cle of ["semaine", "liees"]) {
    if (typeof o[cle] === "number" && Number.isFinite(o[cle])) return o[cle];
  }
  return null;
}

const client = new Client({ connectionString: DB_URL });
let connecte = false;
let tokenEmprunte: string | null = null;
let sessionCreee = false;
let cible: Row | null = null;
let etatInitial: Row | null = null;
let evenementsAvant = new Map<number, number | null>();
let orgId: number | null = null;
let orgName: string | null = null;
let eventId: number | null = null;
let cree: boolean | null = null;
let dejaPromu = false;

const debut = new Date();
const supprimes: Record<string, number | string> = {};

async function nettoie(): Promise<void> {
  if (!connecte) return;
  const problemes: string[] = [];
  try {
    await client.query("BEGIN");

    if (eventId !== null) {
      if (evenementsAvant.has(eventId)) {
        const avant = evenementsAvant.get(eventId) ?? null;
        const u = await client.query("UPDATE event SET org_id=$2 WHERE id=$1", [eventId, avant]);
        supprimes["evenement_org_id_restaure"] = u.rowCount ?? 0;
      } else {
        const alertes = await client.query(
          "DELETE FROM alert WHERE event_id=$1 AND created_at >= $2", [eventId, debut],
        );
        const evenement = await client.query("DELETE FROM event WHERE id=$1", [eventId]);
        supprimes["alertes_supprimees"] = alertes.rowCount ?? 0;
        supprimes["evenements_supprimes"] = evenement.rowCount ?? 0;
      }
    }

    if (orgId !== null && cree === true) {
      const avant = await query<{ asset: string; alias: string; histoire: string }>(client,
        `SELECT
           (SELECT count(*)::text FROM asset WHERE org_id=$1) AS asset,
           (SELECT count(*)::text FROM org_alias WHERE org_id=$1) AS alias,
           (SELECT count(*)::text FROM org_history WHERE org_id=$1) AS histoire`, [orgId]);
      const organ = await query<{ name: string }>(client, "SELECT name FROM org WHERE id=$1", [orgId]);
      const n = await client.query("DELETE FROM org WHERE id=$1", [orgId]);
      supprimes["organisation_supprimee"] = n.rowCount ?? 0;
      supprimes["organisation_nom"] = organ[0]?.name ?? orgName ?? "?";
      supprimes["assets_supprimes"] = Number(avant[0]?.asset ?? 0);
      supprimes["alias_supprimes"] = Number(avant[0]?.alias ?? 0);
      supprimes["historique_supprime"] = Number(avant[0]?.histoire ?? 0);
    } else if (orgId !== null) {
      supprimes["organisation_conservee"] = "déjà existante (cree=false)";
    }

    if (etatInitial && cible) {
      const colonnes = Object.keys(etatInitial).filter((k) => k !== "id");
      const affectations = colonnes.map((k, i) => `${k}=$${i + 1}`).join(", ");
      const valeurs = colonnes.map((k) => (
        k === "extracted" ? JSON.stringify(etatInitial![k]) : etatInitial![k]
      ));
      const u = await client.query(
        `UPDATE quarantine_raw SET ${affectations} WHERE id=$${colonnes.length + 1}`,
        [...valeurs, cible.id],
      );
      supprimes["quarantaine_restauree"] = u.rowCount ?? 0;
    }

    if (sessionCreee && tokenEmprunte) {
      const s = await client.query("DELETE FROM app_session WHERE token=$1", [hashToken(tokenEmprunte)]);
      supprimes["session_supprimee"] = s.rowCount ?? 0;
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Le rollback est lui aussi signalé par l'erreur principale.
    }
    console.error(`!!!! NETTOYAGE ÉCHOUÉ — intervention manuelle requise : ${texteErreur(err)}`);
    etape("Nettoyage", false, `échec BRUYANT, transaction annulée : ${texteErreur(err)}`);
    return;
  }

  // Le nettoyage n'est dit OK qu'après relecture de l'état initial.
  try {
    if (cible && etatInitial) {
      const apres = await query<{ status: string; promoted: boolean; extracted: unknown }>(client,
        "SELECT status, promoted, extracted FROM quarantine_raw WHERE id=$1", [cible.id]);
      const initiator = etatInitial as { status: string; promoted: boolean; extracted: unknown };
      const extractedOk = JSON.stringify(apres[0]?.extracted) === JSON.stringify(initiator.extracted);
      if (apres[0]?.status !== initiator.status || apres[0]?.promoted !== initiator.promoted || !extractedOk) {
        problemes.push(`quarantaine ${cible.id} pas revenue à l'état initial : ${JSON.stringify(apres[0])}`);
      }
    }
    if (orgId !== null && cree === true) {
      const reste = await query<{ n: number }>(client, "SELECT count(*)::int AS n FROM org WHERE id=$1", [orgId]);
      if ((reste[0]?.n ?? 0) !== 0) problemes.push(`organisation ${orgId} encore présente`);
    }
    if (eventId !== null && !evenementsAvant.has(eventId)) {
      const reste = await query<{ n: number }>(client, "SELECT count(*)::int AS n FROM event WHERE id=$1", [eventId]);
      if ((reste[0]?.n ?? 0) !== 0) problemes.push(`événement ${eventId} encore présent`);
    }
  } catch (err) {
    problemes.push(texteErreur(err));
  }

  if (problemes.length > 0) {
    console.error(`!!!! NETTOYAGE INCOMPLET — ${problemes.join(" ; ")}`);
    etape("Nettoyage", false, problemes.join(" ; "));
    return;
  }

  const detail = Object.entries(supprimes).map(([k, v]) => `${k}=${v}`).join(", ");
  etape("Nettoyage", true, `${detail || "rien à supprimer"}; journal conservé (table append-only)`);
}

async function main(): Promise<void> {
  verifierPorts();
  await client.connect();
  connecte = true;
  etape("Connexion base de test 5433", true, DB_URL);

  const lignes = await query<Row>(client,
    `SELECT q.id, q.source, q.org_hint, q.content_hash, q.libre
       FROM (
         SELECT q.*, NOT EXISTS (
           SELECT 1 FROM org o
            WHERE lower(o.domain)=lower(q.org_hint) OR lower(o.name)=lower(q.org_hint)
         ) AS libre
         FROM quarantine_raw q
       ) q
      WHERE q.kind='claim' AND q.status='pending' AND q.promoted=false
        AND (q.org_hint ILIKE '%.com' OR q.org_hint ILIKE '%.edu')
      ORDER BY q.libre DESC, q.id DESC
      LIMIT 1`);
  if (!lignes[0]) throw new Error("aucune quarantaine en attente avec un indice .com/.edu");
  cible = lignes[0];
  etape("Cible choisie", true,
    `id=${cible.id} source=${String(cible.source)} indice=${String(cible.org_hint)} libre=${Boolean(cible.libre)}`);

  const initiaux = await query<Row>(client, "SELECT * FROM quarantine_raw WHERE id=$1", [cible.id]);
  etatInitial = initiaux[0] ?? null;
  if (!etatInitial) throw new Error("état initial de la ligne introuvable");

  const dedupKey = `quarantine:${String(cible.content_hash)}`;
  const evenements = await query<{ id: number; org_id: number | null }>(client,
    "SELECT id, org_id FROM event WHERE dedup_key=$1", [dedupKey]);
  evenementsAvant = new Map(evenements.map((e) => [Number(e.id), e.org_id]));

  const fourni = argValue("token") ?? process.env.RADAR_TOKEN;
  if (fourni) {
    tokenEmprunte = fourni;
    etape("Jeton d'authentification", true, "jeton fourni (non créé par le script)");
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
    etape("Jeton d'authentification", true, "session éphémère créée en base de test (supprimée en fin)");
  }

  const avant = await appel("/api/orgs/liees", { method: "GET" }, tokenEmprunte!);
  const semaineAvant = extraitCompteur(avant.body);
  if (avant.status !== 200 || semaineAvant === null) {
    throw new Error(`compteur avant : HTTP ${avant.status} — ${avant.raw.slice(0, 800)}`);
  }
  etape("Compteur /orgs/liees avant", true, `semaine=${semaineAvant}`);

  const corps = JSON.stringify({ decision: "creer", raison: RAISON });
  const essais: string[] = [];
  let reponse: Reponse | null = null;
  let cheminRetenu = "";
  for (const chemin of [`/api/review/${cible.id}`, `/api/review/${cible.id}/decision`]) {
    const r = await appel(chemin, { method: "POST", body: corps }, tokenEmprunte!);
    essais.push(`${chemin} → HTTP ${r.status} — ${r.raw.slice(0, 800)}`);
    if (r.status === 200) {
      reponse = r;
      cheminRetenu = chemin;
      break;
    }
    // On ne tente la route historique qu'en cas d'absence de route (404).
    if (r.status !== 404) break;
  }
  if (!reponse) {
    throw new Error(`endpoint indisponible, erreurs exactes : ${essais.join(" | ")}`);
  }
  etape("Décision POST /review/:id", true, `${cheminRetenu} → HTTP 200`);

  const body = reponse.body as Record<string, unknown>;
  orgId = typeof body.orgId === "number" ? body.orgId : null;
  orgName = typeof body.orgName === "string" ? body.orgName : null;
  eventId = typeof body.eventId === "number" ? body.eventId : null;
  cree = body.cree === true;
  const reply = JSON.stringify(body);
  etape("Création d'organisation", cree === true && orgId !== null, reply.slice(0, 600));
  if (orgId === null || eventId === null) {
    throw new Error(`réponse inexploitable (orgId/eventId absents) : ${reply.slice(0, 800)}`);
  }

  const apres = await appel("/api/orgs/liees", { method: "GET" }, tokenEmprunte!);
  const semaineApres = extraitCompteur(apres.body);
  if (apres.status !== 200 || semaineApres === null) {
    throw new Error(`compteur après : HTTP ${apres.status} — ${apres.raw.slice(0, 800)}`);
  }
  etape("Compteur /orgs/liees après", semaineApres === semaineAvant + 1,
    `semaine ${semaineAvant} → ${semaineApres} (attendu ${semaineAvant + 1})`);

  const evenement = await query<{ id: number; org_id: number | null; dedup_key: string }>(client,
    "SELECT id, org_id, dedup_key FROM event WHERE id=$1", [eventId]);
  etape("Événement attaché à l'organisation", evenement[0]?.org_id === orgId,
    `event=${eventId} org_id=${String(evenement[0]?.org_id)} attendu=${orgId}`);

  const traces = await query<{ id: number; kind: string; summary: string; payload: unknown }>(client,
    `SELECT id, kind, summary, payload FROM journal
      WHERE subject=$1 OR (payload->>'quarantineId')::bigint=$2
      ORDER BY id DESC LIMIT 20`, [`quarantine:${cible.id}`, cible.id]);
  const decision = traces.find((t) => {
    const p = t.payload as Record<string, unknown> | null;
    return p?.decision === "creer" || p?.action === "create" || String(t.summary).includes("creer");
  });
  etape("Décision journalisée", Boolean(decision),
    decision ? `journal id=${decision.id} kind=${decision.kind} — ${decision.summary}` : `${traces.length} trace(s), aucune décision creer`);

  const etat = await query<{ status: string; promoted: boolean }>(client,
    "SELECT status, promoted FROM quarantine_raw WHERE id=$1", [cible.id]);
  dejaPromu = etat[0]?.promoted === true;
  etape("Ligne promotionnée", dejaPromu, `status=${String(etat[0]?.status)} promoted=${dejaPromu}`);
}

try {
  await main();
} catch (err) {
  etape("Arrêt sur erreur", false, texteErreur(err));
} finally {
  await nettoie();
  if (connecte) {
    try {
      await client.end();
    } catch {
      // Rien à signaler : le nettoyage transactionnel est déjà terminé.
    }
  }
  const ok = resultats.filter((r) => r.ok).length;
  console.log(`RÉSUMÉ  ${ok} OK / ${echecs} ÉCHEC — ${resultats.length} étapes`);
  console.log(`RÉSUMÉ  cible=${(cible as Row | null)?.id ?? "aucune"} org=${orgId ?? "aucune"} event=${eventId ?? "aucun"} cree=${String(cree)}`);
  process.exitCode = echecs > 0 ? 1 : 0;
}
