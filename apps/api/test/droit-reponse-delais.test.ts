/**
 * Droit de réponse : instruction et clôture dans un délai mesuré.
 *
 * Vérifie les deux garde-fous :
 *   - à l'insertion, aucune demande ne reste sans événement ; une demande
 *     déjà plus vieille que le délai est close immédiatement ;
 *   - au passage périodique, une demande restée en réception est ouverte à
 *     l'instruction, puis close au 29e jour avec un fait de journal.
 *
 * Le critère de sortie est exécuté tel quel, sans filtre d'organisation :
 * aucune demande de plus de 30 jours ouverte, aucune demande sans événement.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query, withTransaction } from "../src/db.js";
import {
  instruireDemandesDroitReponse,
  mesurerDelaisDroitReponse,
} from "../src/domain/rectification-delais.js";

const TAG = `drd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let orgId: number;
let sequence = 0;

type DemandeCreee = { id: number; reference: string };

/**
 * Insère une demande comme le fait le domaine : demande + événement dans la
 * même transaction. Quand `avecEvenement` est faux, le trigger différé de la
 * migration doit reconstituer l'histoire au COMMIT.
 */
async function insereDemande(options: {
  ageJours: number;
  avecEvenement?: boolean;
  statut?: "recu" | "en_instruction";
}): Promise<DemandeCreee> {
  sequence += 1;
  const reference = `DR-TEST-${TAG}-${String(sequence).padStart(3, "0")}`;
  const statut = options.statut ?? "recu";
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO droit_reponse
         (reference, org_id, organisation, email, motif, message,
          moyen_verification, ip_hash, statut, created_at)
       VALUES ($1,$2,$3,$4,'inexactitude',
               'Le fait publié ne concerne pas cette entité du groupe.',
               'nom','empreinte-test',$5, now() - ($6 || ' days')::interval)
       RETURNING id`,
      [reference, orgId, `Organisation ${TAG}`, `contact-${TAG}@example.fr`, statut, options.ageJours],
    );
    const id = Number(rows[0]!.id);
    if (options.avecEvenement !== false) {
      await client.query(
        `INSERT INTO droit_reponse_evenement (demande_id, statut, motif, acteur, payload, created_at)
         SELECT $1,'recu',NULL,'demandeur:test','{}'::jsonb, created_at
           FROM droit_reponse WHERE id=$1`,
        [id],
      );
    }
    return id;
  });
  return { id, reference };
}

/** Vieillit une demande après coup, en neutralisant l'immutabilité des faits. */
async function vieillir(id: number, jours: number): Promise<void> {
  await query("ALTER TABLE droit_reponse DISABLE TRIGGER droit_reponse_faits_immuables");
  try {
    await query(
      "UPDATE droit_reponse SET created_at = now() - ($2 || ' days')::interval WHERE id=$1",
      [id, jours],
    );
  } finally {
    await query("ALTER TABLE droit_reponse ENABLE TRIGGER droit_reponse_faits_immuables");
  }
}

async function evenements(id: number): Promise<{ statut: string; motif: string | null }[]> {
  const { rows } = await query<{ statut: string; motif: string | null }>(
    "SELECT statut, motif FROM droit_reponse_evenement WHERE demande_id=$1 ORDER BY id",
    [id],
  );
  return rows;
}

async function etat(id: number): Promise<{ statut: string; closed_at: string | null }> {
  const { rows } = await query<{ statut: string; closed_at: string | null }>(
    "SELECT statut, closed_at::text AS closed_at FROM droit_reponse WHERE id=$1",
    [id],
  );
  return rows[0]!;
}

/** Les deux requêtes du critère de sortie, mot pour mot. */
async function critere(): Promise<{ retard: number; sansEvenement: number }> {
  const retard = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM droit_reponse WHERE created_at<now()-interval '30 days' AND closed_at IS NULL",
  );
  const sansEvenement = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM droit_reponse d WHERE NOT EXISTS (SELECT 1 FROM droit_reponse_evenement e WHERE e.demande_id=d.id)",
  );
  return {
    retard: Number(retard.rows[0]?.n ?? 0),
    sansEvenement: Number(sansEvenement.rows[0]?.n ?? 0),
  };
}

before(async () => {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, domain, status)
     VALUES ($1,$2,'entreprise','informatique','Bordeaux','33',$3,'confirme')
     RETURNING id`,
    [`Organisation ${TAG}`, `org-${TAG}`, `${TAG}.example`],
  );
  orgId = Number(rows[0]!.id);
});

after(async () => {
  await query(
    "DELETE FROM droit_reponse_evenement WHERE demande_id IN (SELECT id FROM droit_reponse WHERE org_id=$1)",
    [orgId],
  );
  await query("DELETE FROM droit_reponse WHERE org_id=$1", [orgId]);
  await query("DELETE FROM org WHERE id=$1", [orgId]);
  await closePools();
});

test("insertion déjà en retard : clôture et histoire écrites dans la même transaction", async () => {
  const { id, reference } = await insereDemande({ ageJours: 35, avecEvenement: false });
  const etatApres = await etat(id);
  assert.equal(etatApres.statut, "refusee");
  assert.ok(etatApres.closed_at, "closed_at est renseigné à l'insertion");

  const hist = await evenements(id);
  assert.deepEqual(hist.map((e) => e.statut), ["recu", "refusee"]);
  assert.match(hist[1]!.motif ?? "", /délai d'instruction d'un mois dépassé/i);

  const { rows: journal } = await query<{ kind: string; payload: Record<string, unknown> }>(
    "SELECT kind, payload FROM journal WHERE subject=$1 ORDER BY id",
    [`droit-reponse:${reference}`],
  );
  const decision = journal.find((j) => j.kind === "droit_reponse.decision");
  assert.ok(decision, "la clôture automatique est journalisée");
  assert.equal(decision.payload.motifCloture, "delai_depasse");
});

test("insertion récente sans événement : réception reconstituée, demande ouverte", async () => {
  const { id } = await insereDemande({ ageJours: 2, avecEvenement: false });
  const etatApres = await etat(id);
  assert.equal(etatApres.statut, "recu");
  assert.equal(etatApres.closed_at, null);

  const hist = await evenements(id);
  assert.deepEqual(hist.map((e) => e.statut), ["recu"]);
  assert.match(hist[0]!.motif ?? "", /reconstitué/i);
});

test("une demande en réception passe à l'instruction, puis est close au-delà du délai", async () => {
  const { id } = await insereDemande({ ageJours: 2, avecEvenement: true });
  assert.equal((await etat(id)).statut, "recu");

  await vieillir(id, 35);
  const passage = await instruireDemandesDroitReponse();
  assert.ok(passage.instruites >= 1, "la demande est ouverte à l'instruction");
  assert.ok(passage.closes >= 1, "la demande est close");

  const etatApres = await etat(id);
  assert.equal(etatApres.statut, "refusee");
  assert.ok(etatApres.closed_at);
  assert.deepEqual((await evenements(id)).map((e) => e.statut), ["recu", "en_instruction", "refusee"]);
});

test("une demande récente reste ouverte après le passage", async () => {
  const { id } = await insereDemande({ ageJours: 2, avecEvenement: true });
  await instruireDemandesDroitReponse();
  const etatApres = await etat(id);
  assert.equal(etatApres.closed_at, null);
  assert.deepEqual((await evenements(id)).map((e) => e.statut), ["recu", "en_instruction"]);
});

test("critère de sortie : aucune demande > 30 jours ouverte, aucune sans événement", async () => {
  const avant = await critere();
  assert.deepEqual(avant, { retard: 0, sansEvenement: 0 });

  // Rejouer le passage ne doit rien casser et ne doit plus rien trouver.
  const second = await instruireDemandesDroitReponse();
  assert.deepEqual(
    { reconstituees: second.reconstituees, instruites: second.instruites, closes: second.closes },
    { reconstituees: 0, instruites: 0, closes: 0 },
  );
  assert.deepEqual(await critere(), { retard: 0, sansEvenement: 0 });
});

test("mesure : les retards et les histoires manquantes sont à zéro", async () => {
  const mesure = await mesurerDelaisDroitReponse();
  assert.equal(mesure.enRetard, 0);
  assert.equal(mesure.sansEvenement, 0);
  assert.ok(mesure.total >= 4);
  assert.ok(mesure.closes >= 2);
  // Les clôtures rétroactives (import d'une demande déjà ancienne) peuvent
  // dépasser le délai : la mesure le dit, elle ne le masque pas.
  assert.ok(mesure.closesSousDelai <= mesure.closes);
});
