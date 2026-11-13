/**
 * Inscription : le bug corrigé ici est que `/auth/register` lisait `req.user`
 * sans `preHandler`, donc la garde admin était inerte — après le premier compte,
 * plus personne ne pouvait s'inscrire, admin compris.
 *
 * Isolation : ce fichier ne supprime aucun compte existant (d'autres tests en
 * créent en parallèle dans la même base jetable). Il crée ses propres fixtures
 * avec un suffixe unique et les retire à la fin.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";

const SUFFIX = `${Date.now()}-${process.pid}`;
const ADMIN_EMAIL = `admin-${SUFFIX}@authtest.local`;
const NEW_EMAIL = `new-${SUFFIX}@authtest.local`;

async function freshApp() {
	const app = Fastify();
	await app.register(authRoute, { prefix: "/api" });
	await app.ready();
	return app;
}

test("base sans aucun compte : l'inscription crée le premier admin (bootstrap)", async (t) => {
	const { rows } = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user");
	if ((rows[0]?.n ?? 0) > 0) {
		t.skip("base déjà peuplée par un autre fichier de test — bootstrap non couvert ici");
		return;
	}

	const app = await freshApp();
	try {
		const res = await app.inject({
			method: "POST",
			url: "/api/auth/register",
			payload: { email: `bootstrap-${SUFFIX}@authtest.local`, password: "secret" },
		});
		assert.equal(res.statusCode, 201);
		assert.equal(res.json().role, "admin", "le premier compte doit être admin");
	} finally {
		await app.close();
	}
});

test("avec un compte existant : sans jeton refusé, avec jeton admin accepté", async () => {
	const { rows: inserted } = await query<{ id: number }>(
		"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
		[ADMIN_EMAIL],
	);
	const adminId = inserted[0]!.id;
	const token = `tok-${SUFFIX}`;
	await query(
		"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
		[token, adminId],
	);

	const app = await freshApp();
	try {
		const sansJeton = await app.inject({
			method: "POST",
			url: "/api/auth/register",
			payload: { email: NEW_EMAIL, password: "secret" },
		});
		assert.ok(
			sansJeton.statusCode === 401 || sansJeton.statusCode === 403,
			`attendu 401/403 sans jeton, reçu ${sansJeton.statusCode}`,
		);

		const avecAdmin = await app.inject({
			method: "POST",
			url: "/api/auth/register",
			headers: { authorization: `Bearer ${token}` },
			payload: { email: NEW_EMAIL, password: "secret" },
		});
		assert.equal(avecAdmin.statusCode, 201, "un admin doit pouvoir créer un compte");
		assert.equal(avecAdmin.json().role, "lecteur", "le rôle demandé par défaut reste lecteur");
	} finally {
		await app.close();
	}
});

after(async () => {
	await query("DELETE FROM app_user WHERE email = ANY($1)", [[ADMIN_EMAIL, NEW_EMAIL]]).catch(() => {});
	await closePools();
});
