/**
 * Export DORA : 10 incidents de test, 10 dossiers EBA Annexe I pré-remplis.
 *
 * Vérifie le critère de sortie sur une base PostgreSQL réelle : les fichiers
 * `dora_AAAA-MM-JJ_ID.json`, leur validation contre le schéma de l'Annexe I,
 * l'horloge 4 h / 72 h et la requête SQL littérale du juge externe.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import Ajv from "ajv";
import { query } from "../src/db.js";
import {
  CRITERE_EXPORT_DORA,
  compteurExportDoraHorsHorloge,
  contenuDora,
  exporterDossiersDora,
  validerDossier,
  type DossierEba,
} from "../src/report/export-dora.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `dora${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE = `test:${TAG}:source-nationale`;
const PRIVES = ["VICTIME_DORA_MARKER", "RESUME_DORA_MARKER", "https://article.example/private"];
const NOM_FICHIER = /^dora_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]+\.json$/;
const QUATRE_HEURES = 4 * 60 * 60 * 1000;
const SOIXANTE_DOUZE_HEURES = 72 * 60 * 60 * 1000;

const schema = JSON.parse(
  readFileSync(new URL("../src/report/dora-eba-annexe-i.schema.json", import.meta.url), "utf8"),
) as { required: string[]; properties: Record<string, { type?: string }> };
const ajv = new Ajv({ allErrors: true, strict: false });
const valider = ajv.compile(schema);

type Ligne = {
  id: string;
  source_event_id: string;
  classified_at: Date;
  initial_at: Date;
  intermediate_at: Date;
  initial_deadline_at: Date;
  intermediate_deadline_at: Date;
  dossier: DossierEba;
  fichier: string;
  sha256: string | null;
};

const ids: string[] = [];
let dossier: string;

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'Source nationale de test', 'vuln', 'https://exemple.invalid/dora', 'national', false)`,
    [SOURCE],
  );
  for (let i = 0; i < 10; i += 1) {
    // Un classement explicite : c'est cette date qui ouvre l'horloge, pas la
    // date de publication de l'article ni la date d'arrivée dans le radar.
    const classification = new Date(Date.UTC(2026, 10, 20 + (i === 9 ? 1 : 0), 8, i, 0));
    const insere = await query<{ id: string }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
                          dept, at, valid_at, observed_at, source_id, source_url, evidence, classified_at)
       VALUES ($1, 'ransomware', 'confirmed_incident', $2, $3, $4, 'B2', '33',
               now(), $5, $6, $7, $8, '{"run_id":"1"}'::jsonb, $5)
       RETURNING id::text`,
      [
        `test:${TAG}:incident-${i}`,
        `VICTIME_DORA_MARKER ${i}`,
        `RESUME_DORA_MARKER ${i}`,
        i < 5 ? 4 : 3,
        classification.toISOString(),
        new Date(classification.getTime() - 30 * 60_000).toISOString(),
        SOURCE,
        `https://article.example/private/${i}`,
      ],
    );
    const id = insere.rows[0]?.id;
    if (!id) throw new Error("incident DORA de test non inséré");
    ids.push(id);
  }
  dossier = await mkdtemp(join(tmpdir(), "radar-dora-"));
});

after(async () => {
  if (ids.length > 0) {
    await query("DELETE FROM export_dora WHERE source_event_id = ANY($1::bigint[])", [ids]);
    await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [ids]);
  }
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  if (dossier) await rm(dossier, { recursive: true, force: true });
});

async function lignes(): Promise<Ligne[]> {
  const resultat = await query<Ligne>(
    `SELECT id::text, source_event_id::text, classified_at, initial_at, intermediate_at,
            initial_deadline_at, intermediate_deadline_at, dossier, fichier, sha256
       FROM export_dora WHERE source_event_id = ANY($1::bigint[])
      ORDER BY source_event_id::bigint`,
    [ids],
  );
  return resultat.rows;
}

test("dix incidents classés produisent dix lignes export_dora complètes", async () => {
  const resultat = await lignes();
  assert.equal(resultat.length, 10);
  assert.deepEqual(resultat.map((l) => l.source_event_id).sort(), [...ids].sort());
  for (const ligne of resultat) {
    assert.ok(ligne.classified_at instanceof Date, "classified_at renseigné");
    assert.ok(ligne.initial_at instanceof Date, "initial_at renseigné");
    assert.ok(ligne.intermediate_at instanceof Date, "intermediate_at renseigné");
    assert.match(ligne.fichier, NOM_FICHIER);
    assert.ok(ligne.dossier && typeof ligne.dossier === "object");
  }
});

test("le critère SQL du juge externe renvoie 0, littéralement", async () => {
  const brut = await query<{ count: string }>(CRITERE_EXPORT_DORA);
  assert.equal(brut.rows[0]?.count, "0");
  assert.equal(await compteurExportDoraHorsHorloge(), 0);
});

test("l'horloge des 4 h et des 72 h est respectée pour les dix incidents", async () => {
  for (const ligne of await lignes()) {
    const classement = ligne.classified_at.getTime();
    const initial = ligne.initial_at.getTime();
    const intermediaire = ligne.intermediate_at.getTime();
    assert.ok(initial >= classement && initial - classement <= QUATRE_HEURES, ligne.fichier);
    assert.ok(intermediaire >= initial && intermediaire - classement <= SOIXANTE_DOUZE_HEURES, ligne.fichier);
    assert.equal(ligne.initial_deadline_at.getTime() - classement, QUATRE_HEURES);
    assert.equal(ligne.intermediate_deadline_at.getTime() - classement, SOIXANTE_DOUZE_HEURES);
  }
});

test("dix fichiers dora_AAAA-MM-JJ_ID.json passent le schéma EBA Annexe I", async () => {
  const produits = [];
  for (const id of ids) {
    produits.push(...await exporterDossiersDora({ sourceEventId: id, dossierSortie: dossier }));
  }
  assert.equal(produits.length, 10);
  const presents = (await readdir(dossier)).filter((nom) => nom.endsWith(".json"));
  assert.equal(presents.length, 10);
  assert.deepEqual([...presents].sort(), produits.map((p) => p.fichier).sort());
  for (const produit of produits) {
    assert.match(produit.fichier, NOM_FICHIER);
    assert.equal(valider(produit.dossier), true, JSON.stringify(valider.errors));
    for (const cle of schema.required) {
      const valeur = produit.dossier[cle];
      if (schema.properties[cle]?.type === "string") {
        assert.equal(typeof valeur, "string", `${cle} renseigné`);
        assert.ok((valeur as string).trim().length > 0, `${cle} non vide`);
      } else {
        assert.notEqual(valeur, undefined, `${cle} renseigné`);
        assert.notEqual(valeur, null, `${cle} renseigné`);
      }
    }
    const octets = await readFile(join(dossier, produit.fichier));
    assert.equal(contenuDora(produit.dossier), octets.toString("utf8"));
    const empreinte = createHash("sha256").update(octets).digest("hex");
    assert.equal(produit.sha256, empreinte);
  }
});

test("aucun titre, résumé, URL ni contact personnel ne fuite dans les dossiers", async () => {
  for (const nom of (await readdir(dossier)).filter((f) => f.endsWith(".json"))) {
    const contenu = await readFile(join(dossier, nom), "utf8");
    for (const marqueur of PRIVES) {
      assert.equal(contenu.includes(marqueur), false, `${marqueur} absent de ${nom}`);
    }
    assert.equal(contenu.includes("Source nationale de test"), false);
    assert.equal(contenu.includes("portee locale"), false);
    assert.ok(contenu.includes("Portee regionale Nouvelle-Aquitaine"));
    assert.ok(contenu.includes("@exemple.invalid"), "contacts de rôle, non personnels");
  }
});

test("un dossier incomplet est refusé sans produire de fichier", async () => {
  const exemplaire = (await lignes())[0]?.dossier;
  assert.ok(exemplaire, "dossier de référence présent");
  const incomplet = { ...exemplaire };
  delete incomplet.affected_entity_lei;
  assert.throws(() => validerDossier(incomplet), /EBA Annexe I invalide/);
  const avant = (await readdir(dossier)).filter((nom) => nom.endsWith(".json")).length;
  assert.equal(avant, 10);
});
