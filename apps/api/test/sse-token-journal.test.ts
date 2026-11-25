/**
 * Le jeton accepté par `/api/stream?token=` est un secret de session : il ne
 * doit apparaître dans aucun log, y compris quand il est passé en premier
 * paramètre, en majuscules, dans le fragment ou dans un message d'erreur.
 * Les sérialiseurs sont ceux qu'utilise `server.ts` (aucune recopie locale).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import Fastify from "fastify";
import {
  serialiseurErreurAcces,
  serialiseurRequeteAcces,
} from "../src/middleware/auth.js";
import { installErrorHandler } from "../src/errors.js";

const SECRET = "tok-sse-ne-jamais-journaliser-42";

function journalCapte(): { flux: Writable; lignes: string[] } {
  const lignes: string[] = [];
  const flux = new Writable({
    write(morceau, _encodage, termine) {
      lignes.push(morceau.toString());
      termine();
    },
  });
  return { flux, lignes };
}

test("les journaux d'accès ne contiennent jamais le jeton SSE", async () => {
  const { flux, lignes } = journalCapte();
  const app = Fastify({
    logger: { level: "info", stream: flux, serializers: { req: serialiseurRequeteAcces } },
  });
  app.get("/api/stream", async () => ({ ok: true }));

  const urls = [
    `/api/stream?token=${SECRET}&sinceId=12`,
    `/api/stream?sinceId=12&token=${SECRET}`,
    `/api/stream?TOKEN=${SECRET}`,
    `/api/stream?%74oken=${SECRET}#fragment`,
  ];
  for (const url of urls) {
    const res = await app.inject({ url });
    assert.equal(res.statusCode, 200, res.body);
  }
  await app.close();

  const journal = lignes.join("");
  assert.ok(journal.length > 0, "aucun log d'accès capturé");
  assert.ok(!journal.includes(SECRET), `jeton retrouvé dans le journal : ${journal}`);
  assert.match(journal, /token=<redacted>/);
  assert.match(journal, /sinceId=12/, "les autres paramètres restent journalisés");
});

test("un message d'erreur contenant l'URL SSE est redigé avant journalisation", async () => {
  const { flux, lignes } = journalCapte();
  const app = Fastify({
    logger: { level: "error", stream: flux, serializers: { err: serialiseurErreurAcces } },
  });
  installErrorHandler(app);
  app.get("/api/stream/erreur", async () => {
    throw new Error(`échec /api/stream?token=${SECRET}`);
  });

  const res = await app.inject({ url: "/api/stream/erreur" });
  assert.equal(res.statusCode, 500);
  await app.close();

  const journal = lignes.join("");
  assert.ok(journal.length > 0, "aucun log d'erreur capturé");
  assert.ok(!journal.includes(SECRET), `jeton retrouvé dans le journal d'erreurs : ${journal}`);
  assert.match(journal, /token=<redacted>/);
});
