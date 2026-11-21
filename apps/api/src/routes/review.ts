import { ApiError, badRequest, conflict, notFound } from "../errors.js";
/**
 * File de revue des rattachements non résolus.
 *
 * Les trois routes sont authentifiées : la file expose des revendications
 * TLP:RED et chaque décision porte son auteur. Elle réutilise la file de
 * quarantaine existante (`quarantine/review.ts`) et le moteur de promotion
 * (`quarantine/promote.ts`) — aucune deuxième règle de rattachement ici.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { etagOu304 } from "../etag.js";
import { evaluateEvent } from "../detect/engine.js";
import { domainFromHint } from "../match/domaine.js";
import { estSigle } from "../match/sigles.js";
import { consignerAvec } from "../journal/index.js";
import { createOrgFromHintTx, InvalidHintError, type CreateOrgFromHintResult } from "../quarantine/from-hint.js";
import { normalizeName, promoteOneTx, type PromoteOneResult } from "../quarantine/promote.js";
import { appendReview, applyReview, reviewQueue, type ReviewEntry } from "../quarantine/review.js";
import type { TriageBucket } from "../quarantine/triage.js";

const TITRE_MAX = 200;
const EXTRAIT_MAX = 240;

/**
 * Contexte minimum pour décider : le titre structuré par le collecteur quand
 * il existe, sinon la première ligne non vide du texte brut. L'extrait reste
 * une tranche brute de `raw_body`, sans mise en forme.
 */
function titreExtrait(rawBody: string | null, titreSource: string | null): string | null {
	const titre = (titreSource ?? "").trim();
	if (titre) return titre.slice(0, TITRE_MAX);
	const premiereLigne = (rawBody ?? "")
		.split(/\r?\n/)
		.map((ligne) => ligne.trim())
		.find((ligne) => ligne.length > 0);
	return premiereLigne ? premiereLigne.slice(0, TITRE_MAX) : null;
}

/** Une seule requête groupée : la file affiche au plus 200 lignes. */
async function contextesDes(ids: readonly number[]): Promise<Map<number, { titre: string | null; extrait: string | null }>> {
	if (ids.length === 0) return new Map();
	const r = await query<{ id: number; raw_body: string | null; titre_source: string | null }>(
		`SELECT id, left(raw_body, 500) AS raw_body,
		        COALESCE(NULLIF(btrim(extracted->>'title'), ''),
		                 NULLIF(btrim(extracted->>'titre_brut'), '')) AS titre_source
		   FROM quarantine_raw WHERE id = ANY($1::bigint[])`,
		[ids],
	);
	return new Map(r.rows.map((row) => [Number(row.id), {
		titre: titreExtrait(row.raw_body, row.titre_source),
		extrait: row.raw_body === null ? null : row.raw_body.slice(0, EXTRAIT_MAX),
	}]));
}

const QueueQuery = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	page: z.coerce.number().int().min(0).default(0),
	offset: z.coerce.number().int().min(0).optional(),
	cursor: z.coerce.number().int().positive().optional(),
	bucket: z.enum(["chaud", "tiede", "froid"]).optional(),
	q: z.string().trim().max(200).optional(),
});

const DecisionBody = z.object({
	decision: z.enum(["accepter", "refuser", "creer"]),
	orgId: z.number().int().positive().optional(),
	raison: z.string().trim().min(1).max(500),
}).strict().refine(
	(body) => body.decision !== "accepter" || body.orgId !== undefined,
	{ message: "orgId requis pour une acceptation", path: ["orgId"] },
).refine(
	(body) => body.decision !== "creer" || body.orgId === undefined,
	{ message: "orgId interdit pour une création", path: ["orgId"] },
);

function zodBadRequest(error: z.ZodError): never {
	throw badRequest("invalid input",
		error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
}

/** Refus massif : une seule raison, un seul lot journalisé. */
const RefuserSansIndiceBody = z.object({
	raison: z.string().trim().min(1).max(500),
}).strict();

/**
 * Traduit l'indice de quarantaine en entrée du service de création.
 * Sans domaine ni jeton alphabétique exploitable, on ne fabrique pas une
 * organisation : la décision est refusée avant toute écriture.
 */
function inputDepuisIndice(
	orgHint: string | null,
	quarantineId: number,
	acteur: string,
	raison: string,
): { nom: string; domaine: string | null; source: string; preuve: string } | null {
	const hint = (orgHint ?? "").trim();
	if (!hint) return null;
	const domaine = domainFromHint(hint);
	const nom = hint.slice(0, 300);
	if (!domaine && !estSigle(nom)) {
		const jetons = normalizeName(nom).split(" ").filter((jeton) => jeton.length >= 2 && /[a-z]/.test(jeton));
		if (jetons.length === 0) return null;
	}
	return {
		nom,
		domaine,
		source: `quarantine:${quarantineId}`.slice(0, 200),
		preuve: `décision creer par ${acteur} — ${raison}`.slice(0, 2000),
	};
}

export default async function (app: FastifyInstance) {
	const ecritureRateLimit = rateLimit({ max: 20, windowMs: 60_000 });
	/** Revendications en attente avec indice, candidats et règle de refus. */
	app.get("/review/queue", { preHandler: requireAuth() }, async (req, reply) => {
		const parsed = QueueQuery.safeParse(req.query ?? {});
		if (!parsed.success) zodBadRequest(parsed.error);
		const { limit, page, offset, cursor, bucket, q } = parsed.data;
		const result = await reviewQueue({
			status: "pending",
			onlyPendingWithHint: true,
			enriched: true,
			limit,
			page,
			offset,
			cursor,
			bucket: bucket as TriageBucket | undefined,
			q: q ?? null,
		});
		const contextes = await contextesDes(result.rows.map((row) => row.id));
		const corps = {
			rows: result.rows.map((row) => ({
				id: row.id,
				source: row.source,
				sourceUrl: row.sourceUrl,
				groupe: row.groupe,
				orgHint: row.orgHint,
				claimedAt: row.claimedAt,
				receivedAt: row.receivedAt,
				tlp: row.tlp,
				triage: row.triage,
				candidates: row.candidates ?? [],
				rejectRule: row.rejectRule ?? null,
				city: row.city ?? null,
				dept: row.dept ?? null,
				review: row.review,
				titre: contextes.get(row.id)?.titre ?? null,
				extrait: contextes.get(row.id)?.extrait ?? null,
			})),
			total: result.total,
			page: result.page,
			limit: result.limit,
			window: result.window,
			nextCursor: result.nextCursor,
			counts: result.counts,
			tookMs: result.tookMs,
		};
		if (etagOu304(reply, corps)) return;
		return corps;
	});

	/** Comptes lus en base : file, décisions humaines et promotions. */
	app.get("/review/stats", { preHandler: requireAuth() }, async (_req, reply) => {
		const [pending, acceptees, refusees, promues] = await Promise.all([
			query<{ n: number }>(
				`SELECT count(*)::int AS n FROM quarantine_raw
				  WHERE kind='claim' AND status='pending' AND promoted=false
				    AND org_hint IS NOT NULL AND btrim(org_hint) <> ''`,
			),
			query<{ n: number }>(
				`SELECT count(DISTINCT subject)::int AS n FROM journal
				  WHERE kind='review.decided'
				    AND (payload->>'decision'='accepter' OR payload->>'action'='promote')`,
			),
			query<{ n: number }>(
				`SELECT count(DISTINCT subject)::int AS n FROM journal
				  WHERE kind='review.decided'
				    AND (payload->>'decision'='refuser' OR payload->>'action'='reject')`,
			),
			query<{ n: number }>("SELECT count(*)::int AS n FROM quarantine_raw WHERE promoted=true"),
		]);
		const corps = {
			pending: pending.rows[0]?.n ?? 0,
			acceptees: acceptees.rows[0]?.n ?? 0,
			refusees: refusees.rows[0]?.n ?? 0,
			promues: promues.rows[0]?.n ?? 0,
		};
		if (etagOu304(reply, corps)) return;
		return corps;
	});

	/**
	 * Refus en masse des revendications en attente sans indice exploitable.
	 * Une seule transaction : toutes les lignes passent en `rejected`, et un
	 * unique fait de journal porte la raison, l'auteur et les identifiants.
	 * Si le journal refuse l'écriture, la transaction entière est annulée —
	 * on ne classe jamais 145 lignes sans trace.
	 */
	app.post(
		"/review/refuser-sans-indice",
		{ preHandler: [ecritureRateLimit, requireRole("admin")] },
		async (req, reply) => {
			const parsed = RefuserSansIndiceBody.safeParse(req.body ?? {});
			if (!parsed.success) zodBadRequest(parsed.error);
			const { raison } = parsed.data;
			const acteur = req.user!.email;
			const entry: ReviewEntry = {
				at: new Date().toISOString(), by: acteur, action: "reject", reason: raison,
			};

			const ids = await withTransaction(async (client) => {
				const updated = await client.query<{ id: number }>(
					`UPDATE quarantine_raw
					    SET status = 'rejected',
					        extracted = jsonb_set(
					          COALESCE(extracted, '{}'::jsonb),
					          '{_review}',
					          COALESCE(extracted->'_review', '[]'::jsonb) || $1::jsonb
					        )
					  WHERE kind = 'claim' AND status = 'pending' AND promoted = false
					    AND (org_hint IS NULL OR btrim(org_hint) = '')
					  RETURNING id`,
					[JSON.stringify([entry])],
				);
				const traites = updated.rows.map((row) => Number(row.id)).sort((a, b) => a - b);
				if (traites.length === 0) return traites;
				const trace = await consignerAvec(
					(sql, params) => client.query(sql, params as unknown[]),
					{
						kind: "review.decided",
						subject: "review.batch:refuser-sans-indice",
						summary: `refuser-sans-indice par ${acteur} — ${raison} (${traites.length} ligne(s))`,
						actor: `humain:${acteur}`,
						payload: {
							decision: "refuser",
							action: "reject",
							reason: raison,
							statutApplique: "rejected",
							traites: traites.length,
							quarantineIds: traites,
						},
					},
				);
				if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
				return traites;
			});

			return { traites: ids.length, journalConsignes: ids.length > 0 ? 1 : 0 };
		},
	);

	/**
	 * Décision sur une ligne : accepter attache l'organisation choisie, creer
	 * crée (ou réutilise) l'organisation portée par l'indice, refuser classe la
	 * ligne. Chaque décision écrit le motif et l'auteur dans le journal et dans
	 * l'historique de la ligne.
	 */
	app.post<{ Params: { id: string } }>(
		"/review/:id/decision",
		{ preHandler: [ecritureRateLimit, requireAuth()] },
		async (req, reply) => {
			const id = Number(req.params.id);
			if (!Number.isInteger(id) || id <= 0) {
				throw badRequest("invalid id");
			}
			const parsed = DecisionBody.safeParse(req.body ?? {});
			if (!parsed.success) zodBadRequest(parsed.error);
			const { decision, raison } = parsed.data;
			const orgId = parsed.data.orgId;
			const actor = req.user!.email;

			const current = await query<{ status: string; promoted: boolean; org_hint: string | null }>(
				"SELECT status, promoted, org_hint FROM quarantine_raw WHERE id=$1", [id],
			);
			if (!current.rows[0]) throw notFound();
			if (current.rows[0].promoted || current.rows[0].status !== "pending") {
				throw conflict("already decided");
			}

			if (decision === "accepter") {
				const org = await query<{ name: string }>("SELECT name FROM org WHERE id=$1", [orgId]);
				if (!org.rows[0]) throw notFound("organisation introuvable");
				const entry: ReviewEntry = {
					at: new Date().toISOString(), by: actor, action: "promote", reason: raison,
				};
				const promoted = await withTransaction(async (client) => {
					const result = await promoteOneTx(client, id, actor, {
						orgId: orgId!, orgName: org.rows[0].name,
					});
					if (!result.found || result.alreadyPromoted) return null;
					await appendReview(id, entry, client);
					const trace = await consignerAvec(
						(sql, params) => client.query(sql, params as unknown[]),
						{
							kind: "review.decided",
							subject: `quarantine:${id}`,
							summary: `accepter par ${actor} — ${raison}`,
							actor: `humain:${actor}`,
							payload: {
								decision: "accepter",
								action: "promote",
								reason: raison,
								orgId,
								orgName: org.rows[0].name,
								statutApplique: "promoted",
								eventId: result.eventId,
								quarantineId: id,
							},
						},
					);
					if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
					return result;
				});
				if (!promoted) throw conflict("already decided");
				const alerts = promoted.inserted && promoted.eventId !== null
					? await evaluateEvent(promoted.eventId, { force: true })
					: 0;
				return {
					id, decision, orgId, orgName: org.rows[0].name,
					status: "promoted", eventId: promoted.eventId, alerts,
					reason: raison, by: actor,
				};
			}

			if (decision === "creer") {
				const input = inputDepuisIndice(current.rows[0].org_hint, id, actor, raison);
				if (!input) throw badRequest("indice inexploitable");
				const entry: ReviewEntry = {
					at: new Date().toISOString(), by: actor, action: "promote", reason: raison,
				};
				let decided: { result: PromoteOneResult; creation: CreateOrgFromHintResult } | null;
				try {
					// Création, rattachement, trace et décision : un seul commit,
					// ou rien du tout si une écriture échoue.
					decided = await withTransaction(async (client) => {
						const creation = await createOrgFromHintTx(client, input);
						const org = creation.org;
						const result = await promoteOneTx(client, id, actor, {
							orgId: org.id, orgName: org.name,
						});
						if (!result.found || result.alreadyPromoted) return null;
						await appendReview(id, entry, client);
						const trace = await consignerAvec(
							(sql, params) => client.query(sql, params as unknown[]),
							{
								kind: "review.decided",
								subject: `quarantine:${id}`,
								summary: `creer par ${actor} — ${raison}`,
								actor: `humain:${actor}`,
								payload: {
									decision: "creer",
									action: "promote",
									reason: raison,
									orgId: org.id,
									orgName: org.name,
									cree: creation.created,
									matchedBy: creation.matchedBy,
									statutApplique: "promoted",
									eventId: result.eventId,
									quarantineId: id,
								},
							},
						);
						if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
						return { result, creation };
					});
				} catch (error) {
					if (error instanceof InvalidHintError) {
						throw badRequest("indice inexploitable", error.message);
					}
					throw error;
				}
				if (!decided) throw conflict("already decided");
				const { result: promoted, creation } = decided;
				const org = creation.org;
				const alerts = promoted.inserted && promoted.eventId !== null
					? await evaluateEvent(promoted.eventId, { force: true })
					: 0;
				return {
					ok: true, id, decision, orgId: org.id, orgName: org.name,
					eventId: promoted.eventId, cree: creation.created,
					status: "promoted", reason: raison, by: actor, alerts,
				};
			}

			const outcome = await applyReview([id], "reject", raison, actor);
			if (outcome.changed === 0) throw conflict("already decided");
			if (outcome.journalErreurs > 0) {
				throw new ApiError(500, "journal indisponible", { details: outcome });
			}
			return {
				id, decision, status: "rejected", reason: raison, by: actor,
				journalConsignes: outcome.journalConsignes,
				journalLacunes: outcome.journalLacunes,
			};
		},
	);
}
