/**
 * Transitions d'état des sources.
 *
 * Le cas qui compte est celui du milieu : une source qui répond, qui lit, et qui
 * ne rend rien. Elle n'est ni en panne ni productive, et le tableau de bord la
 * montrait comme « ok ». Le journal doit dire qu'elle s'est assoupie — et surtout
 * ne pas le dire quand elle alterne simplement entre un article utile et deux
 * passages vides.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { constaterTransition, etatDuRun, etatPrecedent, transition } from "../src/collectors/reveil.js";

const TAG = `rev${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

/**
 * Une source par cas. Le journal est append-only *pour de vrai* — un DELETE de
 * test y échoue par trigger, et c'est exactement ce qu'on veut : on isole donc
 * par sujet plutôt que par nettoyage.
 */
const ENDORMI = `${TAG}-endormi`;
const STABLE = `${TAG}-stable`;
const REVEIL = `${TAG}-reveil`;
const SOURCES = [ENDORMI, STABLE, REVEIL];

before(async () => {
	for (const id of SOURCES) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, enabled)
			 VALUES ($1,$2,'cti','https://exemple.invalid/r','narrative',true)`,
			[id, `Source de test (${id})`],
		);
	}
});

after(async () => {
	await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [SOURCES]);
	await query("DELETE FROM source WHERE id = ANY($1)", [SOURCES]);
	await closePools();
});

test("état d'un run : erreur prime, puis production, puis silence", () => {
	assert.equal(etatDuRun("error", 5), "en-erreur", "un run en erreur ne produit rien, même s'il annonce des items");
	assert.equal(etatDuRun("ok", 3), "productive");
	assert.equal(etatDuRun("ok", 0), "muette");
});

test("une panne n'est effacée que par un run réussi", () => {
	assert.equal(etatPrecedent([{ statut: "error", itemsNew: 0 }]), "en-erreur");
	// Le run le plus récent est productif : ce n'est plus une panne.
	assert.equal(
		etatPrecedent([
			{ statut: "ok", itemsNew: 0 },
			{ statut: "ok", itemsNew: 2 },
			{ statut: "error", itemsNew: 0 },
		]),
		"productive",
	);
	assert.equal(etatPrecedent([]), null, "jamais tentée = pas d'état, donc pas de condamnation");
});

test("les quatre transitions, et rien d'autre", () => {
	assert.equal(transition("muette", "productive"), "reveil");
	assert.equal(transition("productive", "muette"), "assoupissement");
	assert.equal(transition("productive", "en-erreur"), "panne");
	assert.equal(transition("en-erreur", "productive"), "reparation");
	assert.equal(transition("muette", "en-erreur"), "panne");
	assert.equal(transition("en-erreur", "muette"), "reparation");
	assert.equal(transition("productive", "productive"), null);
	assert.equal(transition(null, "muette"), null, "un premier run n'est pas un changement");
});

test("l'assoupissement est consigné comme un fait, une fois", async () => {
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now() - interval '2 hours', 'ok', 12, 3, 9)`,
		[ENDORMI],
	);

	const changement = await constaterTransition(ENDORMI, "ok", 0);
	assert.equal(changement, "assoupissement");

	const faits = await query<{ kind: string; payload: Record<string, unknown> }>(
		"SELECT kind, payload FROM journal WHERE subject = $1",
		[ENDORMI],
	);
	assert.equal(faits.rowCount, 1);
	assert.equal(faits.rows[0]?.kind, "source.changed");
	assert.equal((faits.rows[0]?.payload as { transition: string }).transition, "assoupissement");
});

test("un état stable ne produit aucun fait", async () => {
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now() - interval '1 hour', 'ok', 8, 0, 8)`,
		[STABLE],
	);

	assert.equal(await constaterTransition(STABLE, "ok", 0), null);
	const faits = await query("SELECT 1 FROM journal WHERE subject = $1", [STABLE]);
	assert.equal(faits.rowCount, 0, "le silence qui dure n'est pas un événement : il n'inonde pas le journal");
});

test("le réveil est consigné", async () => {
	await query(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped)
		 VALUES ($1, now() - interval '1 hour', 'ok', 5, 0, 5)`,
		[REVEIL],
	);

	assert.equal(await constaterTransition(REVEIL, "ok", 2), "reveil");
	const faits = await query<{ summary: string }>("SELECT summary FROM journal WHERE subject = $1", [REVEIL]);
	assert.equal(faits.rowCount, 1);
	assert.match(String(faits.rows[0]?.summary), /se remet à produire/);
});
