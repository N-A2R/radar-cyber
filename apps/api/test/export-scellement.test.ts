import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import { closePools, query } from "../src/db.js";
import {
	empreinteFichier,
	scellerExport,
	type OptionsScellement,
} from "../src/export/scellement.js";
import type { FournisseurJeton, JetonVerifie } from "../src/journal/rfc3161.js";

/** Le critère du juge externe, exécuté tel quel. */
const CRITERE_SQL =
  "SELECT count(*) FROM export_scellement WHERE exporte_le::date >= current_date-30 AND (token_rfc3161 IS NULL OR sha256_fichier IS NULL OR verify_ok IS NOT TRUE OR prestataire_anssi IS NULL);";

const MARQUE = `test-scellement-${Date.now()}`;
const GEN_TIME = "2026-11-23T12:00:00.000Z";

/** TSA injectée : aucun test ne dépend du réseau. */
const fournisseurTest: FournisseurJeton = async (racineSha256) => ({
	jeton: Buffer.from(`jeton-test:${racineSha256}`).toString("base64"),
	certificat: Buffer.from("certificat-test").toString("base64"),
	tsaUrl: "https://tsa.test.invalid/tsr",
	genTime: GEN_TIME,
	serial: "01",
	nonce: null,
});

const verificateurTest = (jeton: string, empreinte: Buffer): JetonVerifie => {
	const racine = Buffer.from(jeton, "base64").toString("utf8").replace("jeton-test:", "");
	const attendu = createHash("sha256").update(racine, "ascii").digest();
	if (!attendu.equals(empreinte)) throw new Error("jeton-test : empreinte non couverte");
	return { genTime: GEN_TIME, serial: "01", nonce: null, certificat: Buffer.from("certificat-test").toString("base64") };
};

function options(contenu: string, reference: string): OptionsScellement {
	return {
		reference: `${MARQUE}/${reference}`,
		format: "test-json",
		contenu,
		fournisseur: fournisseurTest,
		verificateur: verificateurTest,
		prestataireAnssi: "TSA de test — qualification non revendiquée",
	};
}

after(async () => {
	await closePools().catch(() => {});
});

describe("scellement RFC 3161 des exports publics", () => {
	it("l'empreinte couvre les octets exacts livrés", () => {
		assert.equal(empreinteFichier("abc"), createHash("sha256").update("abc").digest("hex"));
		assert.notEqual(empreinteFichier("abc"), empreinteFichier("abd"));
	});

	it("refuse un jeton qui ne couvre pas le contenu sans écrire de ligne", async () => {
		const avant = await query<{ n: string }>("SELECT count(*)::text AS n FROM export_scellement");
		await assert.rejects(
			scellerExport({
				...options("contenu non scellé", "faux-jeton"),
				verificateur: (jeton, empreinte) => {
					assert.ok(jeton.length > 0);
					// Un jeton valide pour un AUTRE contenu ne doit pas être accepté.
					return verificateurTest(
						Buffer.from(`jeton-test:${empreinteFichier("autre contenu")}`).toString("base64"),
						empreinte,
					);
				},
			}),
			/empreinte non couverte/,
		);
		const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM export_scellement");
		assert.equal(apres.rows[0]?.n, avant.rows[0]?.n);
	});

	it("30 exports consécutifs portent tous une date certaine complète", async () => {
		for (let i = 0; i < 30; i += 1) {
			const scellement = await scellerExport(options(`{"export":${i},"marque":"${MARQUE}"}`, `export-${i}`));
			assert.match(scellement.sha256Fichier, /^[0-9a-f]{64}$/);
			assert.equal(scellement.exporteLe, GEN_TIME);
			assert.ok(scellement.enTetes["X-Export-Rfc3161-Token"]?.length);
			assert.ok(scellement.enTetes["X-Export-Prestataire-Anssi"]?.length);
		}
		const comptage = await query<{ n: string; complets: string }>(`
      SELECT count(*)::text AS n,
             count(*) FILTER (WHERE token_rfc3161 IS NOT NULL AND sha256_fichier IS NOT NULL
               AND verify_ok IS TRUE AND prestataire_anssi IS NOT NULL)::text AS complets
        FROM export_scellement WHERE reference LIKE $1 || '%'
    `, [`${MARQUE}/export-`]);
		assert.equal(comptage.rows[0]?.n, "30");
		assert.equal(comptage.rows[0]?.complets, "30");

		const critere = await query<{ count: string }>(CRITERE_SQL);
		assert.equal(critere.rows[0]?.count, "0");
	});
});
