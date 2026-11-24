/**
 * Chaînes d'affirmations répétées sans source primaire.
 *
 * Deux tests purs verrouillent la définition de « rumeur ». Deux tests SQL
 * prouvent que la migration crée la table et que le critère du chantier
 * s'exécute tel quel, sur une base de test jetable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import {
  estRumeur,
  projectClaimChains,
  summarizeClaimChains,
  type ClaimChainRow,
} from "../src/analyse/claim-chains.js";

const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");
const CRITERE = `SELECT count(*) FROM claim_chain WHERE repetitions>=3 AND primary_source_count=0 AND first_seen_at IS NOT NULL >=30;`;

function chaine(surcharge: Partial<ClaimChainRow> = {}): ClaimChainRow {
  return {
    claim_key: "empreinte-sha256",
    repetitions: 4,
    primary_source_count: 0,
    source_count: 3,
    group_count: 2,
    first_seen_at: "2026-10-01T00:00:00.000Z",
    last_seen_at: "2026-10-20T00:00:00.000Z",
    ...surcharge,
  };
}

test("trois affirmations anciennes sans source primaire font une rumeur", () => {
  assert.equal(estRumeur(chaine(), MAINTENANT), true);
  assert.equal(projectClaimChains([chaine()], MAINTENANT)[0]!.verdict, "rumeur");
});

test("une source primaire, une date manquante ou sept jours seulement écartent la rumeur", () => {
  assert.equal(estRumeur(chaine({ primary_source_count: 1 }), MAINTENANT), false);
  assert.equal(estRumeur(chaine({ first_seen_at: null }), MAINTENANT), false);
  assert.equal(estRumeur(chaine({ first_seen_at: "2026-11-20T00:00:00.000Z" }), MAINTENANT), false);
});

test("la projection ne publie que des empreintes, compteurs et dates", () => {
  const [projetee] = projectClaimChains([chaine()], MAINTENANT);
  assert.deepEqual(Object.keys(projetee!).sort(), [
    "ageDays", "claimKey", "firstSeenAt", "groupCount", "lastSeenAt",
    "primarySourceCount", "repetitions", "sourceCount", "verdict",
  ]);
  const resume = summarizeClaimChains([chaine(), chaine({ primary_source_count: 2, claim_key: "autre" })], MAINTENANT);
  assert.deepEqual(resume, {
    chains: 2, rumeurs: 1, etayees: 1, recentes: 0, nonDatees: 0, repetitionsTotales: 8,
  });
});

test("la migration crée la table et le critère s'exécute sur la base de test", async () => {
  const table = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM information_schema.tables
      WHERE table_schema='public' AND table_name='claim_chain'`);
  assert.equal(table.rows[0]!.count, "1");

  // La base de test contient déjà des revendications semées par la migration
  // 216 : le rafraîchissement de la 225 y remplace le jeu synthétique. Ici on
  // vérifie donc que le critère s'exécute, pas qu'un jeu précis est présent.
  const critere = await query<{ count: string }>(CRITERE);
  assert.equal(Number.isFinite(Number(critere.rows[0]!.count)), true);
});

test("le rafraîchissement regroupe trois affirmations sans document de première main", async () => {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const victime = `Entite Fictive Rumeur ${suffixe}`;
  const empreinte = `sha256-${suffixe}`;
  const date = "2026-09-20T00:00:00.000Z";

  try {
    for (const [i, source] of ["ransomlook", "ransomlook-echantillon", "ransomlook"].entries()) {
      await query(
        `INSERT INTO leak_claim (fingerprint, source, site_slug, group_name, victim, published_at)
         VALUES ($1,$2,'rumeur-test',$3,$4,$5)`,
        [`${empreinte}-${i}`, source, `groupe-${i}`, victime, date],
      );
    }
    await query("SELECT public.refresh_claim_chains()");

    const chaine = await query<{
      repetitions: number;
      primary_source_count: number;
      source_count: number;
      first_seen_at: Date;
    }>(
      `SELECT repetitions, primary_source_count, source_count, first_seen_at
         FROM claim_chain
        WHERE claim_key = encode(sha256(convert_to(lower(btrim($1)),'UTF8')),'hex')`,
      [victime],
    );
    assert.equal(chaine.rows.length, 1);
    assert.equal(chaine.rows[0]!.repetitions, 3);
    assert.equal(chaine.rows[0]!.primary_source_count, 0);
    assert.equal(chaine.rows[0]!.source_count, 2);
    assert.equal(new Date(chaine.rows[0]!.first_seen_at).toISOString(), date);

    const critere = await query<{ count: string }>(CRITERE);
    assert.ok(Number(critere.rows[0]!.count) >= 1, "la chaîne semée est détectée par le critère");
  } finally {
    await query("DELETE FROM leak_claim WHERE fingerprint LIKE $1", [`${empreinte}-%`]);
    await query("SELECT public.refresh_claim_chains()");
  }
});
