/**
 * Passage automatique au statut « morte » après cinq échecs consécutifs.
 *
 * Le collecteur est un faux qui lève à chaque run : c'est le chemin réel
 * `executerCollecteur` (registre des collecteurs) qui est exercé, pas une
 * copie de sa logique. Isolation par sujets préfixés ; le journal étant
 * append-only, ses lignes ne se suppriment pas (base jetable en fin de suite).
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { CollectContext, Collector } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import { executerCollecteur } from "../src/collectors/index.js";
import { hashSessionToken } from "../src/auth.js";
import sourcesRoute from "../src/routes/sources.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `mortauto${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE_ID = `test-${TAG}`;
const RESET_ID = `test-${TAG}-reset`;
const ADMIN_EMAIL = `admin-${TAG}@source-test.local`;
const LECTEUR_EMAIL = `lecteur-${TAG}@source-test.local`;
const ADMIN_TOKEN = `tok-admin-${TAG}`;
const LECTEUR_TOKEN = `tok-lecteur-${TAG}`;
const ERREUR = "HTTP 404 — flux retiré (test)";

function contexte(): CollectContext {
  return {
    fetchJson: async () => { throw new Error("réseau interdit dans ce test"); },
    fetchText: async () => { throw new Error("réseau interdit dans ce test"); },
    cursor: {},
    log: () => {},
    now: () => new Date(),
  };
}

function collecteurQuiEchoue(id: string): Collector {
  return {
    id,
    family: "ransomware",
    intervalSec: 60,
    run: async () => { throw new Error(ERREUR); },
  };
}

function collecteurSain(id: string): Collector {
  return {
    id,
    family: "ransomware",
    intervalSec: 60,
    run: async () => ({ events: [] }),
  };
}

async function lireSource(id: string) {
  const r = await query<{
    statut: string;
    enabled: boolean;
    echecs_consecutifs: number;
    derniere_erreur: string | null;
  }>(
    "SELECT statut, enabled, echecs_consecutifs, derniere_erreur FROM source WHERE id = $1", [id],
  );
  const ligne = r.rows[0];
  assert.ok(ligne, `source de test ${id} présente`);
  return ligne;
}

before(async () => {
  for (const [id, suffixe] of [[SOURCE_ID, ""], [RESET_ID, "-reset"]] as const) {
    await query(
      "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'ransomware','https://exemple.test/source')",
      [id, `Sourcefab ${TAG}${suffixe}`],
    );
  }
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, evidence)
     VALUES ($1,'ransomware','confirmed_incident',$2,$3,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [`dedup-${TAG}`, `Événement conservé ${TAG}`, SOURCE_ID],
  );
  for (const [email, role] of [[ADMIN_EMAIL, "admin"], [LECTEUR_EMAIL, "lecteur"]] as const) {
    const r = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
      [email, role],
    );
    const token = role === "admin" ? ADMIN_TOKEN : LECTEUR_TOKEN;
    await query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [hashSessionToken(token), Number(r.rows[0]?.id)],
    );
  }
});

test("5 échecs simulés → statut morte, journal source.morte, données conservées", async () => {
  const avant = await query<{ n: number }>("SELECT count(*)::int AS n FROM source");
  const collecteur = collecteurQuiEchoue(SOURCE_ID);

  for (let i = 1; i <= 5; i++) {
    await assert.rejects(() => executerCollecteur(collecteur, contexte()), /HTTP 404/);
    const etat = await lireSource(SOURCE_ID);
    assert.equal(etat.echecs_consecutifs, i, `échec ${i}/5 compté`);
    if (i < 5) {
      assert.equal(etat.statut, "active", `échec ${i}/5 : la source n'est pas encore morte`);
    } else {
      assert.equal(etat.statut, "morte", "le 5e échec déclare la source morte");
      assert.equal(etat.enabled, false, "une source morte n'est plus collectée");
      assert.equal(etat.derniere_erreur, ERREUR);
    }
  }

  const apres = await query<{ n: number }>("SELECT count(*)::int AS n FROM source");
  assert.equal(apres.rows[0]?.n, avant.rows[0]?.n, "aucune source supprimée");
  const evenements = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM event WHERE source_id = $1", [SOURCE_ID],
  );
  assert.equal(evenements.rows[0]?.n, 1, "les événements de la source restent en place");

  const faits = await query<{ summary: string; actor: string; payload: Record<string, unknown> }>(
    "SELECT summary, actor, payload FROM journal WHERE kind = 'source.morte' AND subject = $1", [SOURCE_ID],
  );
  assert.equal(faits.rows.length, 1, "un seul fait source.morte est écrit");
  assert.equal(faits.rows[0]?.actor, `collecteur:${SOURCE_ID}`);
  assert.equal(faits.rows[0]?.payload.echecsConsecutifs, 5);
  assert.equal(faits.rows[0]?.payload.raison, ERREUR);
  assert.match(faits.rows[0]?.summary ?? "", /5 échecs consécutifs/);
});

test("un run réussi interrompt la série d'échecs", async () => {
  const collecteur = collecteurQuiEchoue(RESET_ID);
  for (let i = 0; i < 4; i++) {
    await assert.rejects(() => executerCollecteur(collecteur, contexte()), /HTTP 404/);
  }
  assert.equal((await lireSource(RESET_ID)).echecs_consecutifs, 4);

  await executerCollecteur(collecteurSain(RESET_ID), contexte());
  let etat = await lireSource(RESET_ID);
  assert.equal(etat.echecs_consecutifs, 0, "le run réussi remet le compteur à zéro");
  assert.equal(etat.statut, "active");

  for (let i = 0; i < 4; i++) {
    await assert.rejects(() => executerCollecteur(collecteur, contexte()), /HTTP 404/);
  }
  etat = await lireSource(RESET_ID);
  assert.equal(etat.echecs_consecutifs, 4);
  assert.equal(etat.statut, "active", "quatre échecs après un succès ne condamnent pas la source");
  const faits = await query(
    "SELECT id FROM journal WHERE kind = 'source.morte' AND subject = $1", [RESET_ID],
  );
  assert.equal(faits.rows.length, 0);
});

test("réactivation admin : source active, compteur remis à zéro, historique conservé", async () => {
  const app = Fastify();
  await app.register(sourcesRoute, { prefix: "/api" });
  await app.ready();
  try {
    const url = `/api/sources/${SOURCE_ID}/reactiver`;
    const sansJeton = await app.inject({ method: "POST", url });
    assert.equal(sansJeton.statusCode, 401);
    const lecteur = await app.inject({
      method: "POST", url, headers: { authorization: `Bearer ${LECTEUR_TOKEN}` },
    });
    assert.equal(lecteur.statusCode, 403);
    const introuvable = await app.inject({
      method: "POST", url: "/api/sources/source-inexistante-test/reactiver",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(introuvable.statusCode, 404);

    const res = await app.inject({
      method: "POST", url, headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      id: SOURCE_ID, statut: "active", enabled: true, echecsConsecutifs: 0, journalise: true,
    });
  } finally {
    await app.close();
  }

  const etat = await lireSource(SOURCE_ID);
  assert.equal(etat.statut, "active");
  assert.equal(etat.enabled, true);
  assert.equal(etat.echecs_consecutifs, 0);
  assert.equal(etat.derniere_erreur, null);

  const trace = await query<{ actor: string }>(
    `SELECT actor FROM journal
      WHERE kind = 'source.changed' AND subject = $1
        AND payload->>'transition' = 'reactivation'`, [SOURCE_ID],
  );
  assert.equal(trace.rows.length, 1, "la réactivation est tracée");
  assert.equal(trace.rows[0]?.actor, `humain:${ADMIN_EMAIL}`);
  const mort = await query(
    "SELECT id FROM journal WHERE kind = 'source.morte' AND subject = $1", [SOURCE_ID],
  );
  assert.equal(mort.rows.length, 1, "le fait source.morte reste dans le journal");
  const evenements = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM event WHERE source_id = $1", [SOURCE_ID],
  );
  assert.equal(evenements.rows[0]?.n, 1, "aucun événement supprimé");

  await assert.rejects(
    () => executerCollecteur(collecteurQuiEchoue(SOURCE_ID), contexte()), /HTTP 404/,
  );
  assert.equal((await lireSource(SOURCE_ID)).echecs_consecutifs, 1, "le comptage repart à 1");
});

after(async () => {
  await supprimerEvenementsArchivees("source_id = ANY($1)", [[SOURCE_ID, RESET_ID]]).catch(() => {});
  await query("DELETE FROM source WHERE id = ANY($1)", [[SOURCE_ID, RESET_ID]]).catch(() => {});
  await query("DELETE FROM app_session WHERE user_id IN (SELECT id FROM app_user WHERE email = ANY($1))", [[ADMIN_EMAIL, LECTEUR_EMAIL]]).catch(() => {});
  await query("DELETE FROM app_user WHERE email = ANY($1)", [[ADMIN_EMAIL, LECTEUR_EMAIL]]).catch(() => {});
  await closePools();
});
