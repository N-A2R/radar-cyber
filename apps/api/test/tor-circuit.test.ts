// Rotation de circuit Tor et backoff par cause : tests unitaires, hors réseau.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  TOR_BACKOFF_DELAYS,
  classifyTorCause,
  noteTorFailure,
  resetTorBackoff,
  resetTorState,
  rotatedTorSocks,
  torBackoffRemainingMs,
  torFailureCount,
} from "../src/collectors/tor/tor-circuit.js";

const ENV = { RADAR_TOR_SOCKS: "socks5h://127.0.0.1:9050" };

beforeEach(() => resetTorState());

test("rotatedTorSocks garde le point de sortie et ajoute une isolation par source", () => {
  const a = rotatedTorSocks("onion:ccw:alpha", ENV)!;
  const b = rotatedTorSocks("onion:ccw:beta", ENV)!;
  const ua = new URL(a);
  const ub = new URL(b);
  assert.equal(ua.hostname, "127.0.0.1");
  assert.equal(ua.port, "9050");
  assert.ok(ua.username.startsWith("r"));
  assert.equal(ua.password.length, 20);
  assert.notEqual(ua.username, ub.username);
});

test("un échec circuit change le circuit de la source et applique un court backoff", () => {
  const before = rotatedTorSocks("onion:ccw:alpha", ENV)!;
  const delay = noteTorFailure(
    "onion:ccw:alpha",
    new Error("Socks5 proxy rejected connection - HostUnreachable"),
  );
  assert.equal(delay, TOR_BACKOFF_DELAYS.circuit[0]);
  assert.equal(torFailureCount("onion:ccw:alpha"), 1);
  assert.notEqual(rotatedTorSocks("onion:ccw:alpha", ENV), before);
  assert.ok(torBackoffRemainingMs("onion:ccw:alpha") > 0);
});

test("les causes bloquée et contenu invalide ont des paliers distincts", () => {
  assert.equal(classifyTorCause({ permanent: true, message: "403" }), "blocked");
  assert.equal(classifyTorCause(new Error("délai dépassé via Tor")), "timeout");
  assert.equal(classifyTorCause(new Error("contenu invalide")), "invalid_content");
  assert.ok(TOR_BACKOFF_DELAYS.blocked[0]! > TOR_BACKOFF_DELAYS.timeout[0]!);
  assert.ok(TOR_BACKOFF_DELAYS.circuit[0]! < TOR_BACKOFF_DELAYS.invalid_content[0]!);
  const blocked = noteTorFailure("onion:ccw:blocked", { permanent: true, message: "403" });
  assert.equal(blocked, TOR_BACKOFF_DELAYS.blocked[0]);
});

test("un succès remet le circuit et le backoff à zéro", () => {
  noteTorFailure("onion:ccw:alpha", new Error("timeout"));
  assert.ok(torBackoffRemainingMs("onion:ccw:alpha") > 0);
  resetTorBackoff("onion:ccw:alpha");
  assert.equal(torBackoffRemainingMs("onion:ccw:alpha"), 0);
  assert.equal(torFailureCount("onion:ccw:alpha"), 0);
});

test("sans RADAR_TOR_SOCKS ni liste, aucune URL de circuit n'est fabriquée", () => {
  assert.equal(rotatedTorSocks("onion:ccw:alpha", {}), null);
});
