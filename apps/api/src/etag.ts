/**
 * ETag des lectures JSON : empreinte SHA-256 du corps sérialisé, entre
 * guillemets comme l'exige RFC 9110. `tookMs` est une mesure de latence, pas
 * un fait métier : l'exclure du hash rend l'ETag stable d'un appel à l'autre
 * alors que le corps affiche un temps différent (file de revue, annuaire).
 */
import { createHash } from "node:crypto";
import type { FastifyReply } from "fastify";

export function etagDuCorps(corps: unknown): string {
	const json = JSON.stringify(corps, (cle, valeur) => (cle === "tookMs" ? undefined : valeur));
	return `"${createHash("sha256").update(json ?? "").digest("base64url")}"`;
}

function correspond(entete: string | string[] | undefined, etag: string): boolean {
	if (!entete) return false;
	return (Array.isArray(entete) ? entete.join(", ") : entete)
		.split(",")
		.some((candidat) => {
			const valeur = candidat.trim().replace(/^W\//i, "");
			return valeur === etag || valeur === "*";
		});
}

/** Pose l'ETag ; vrai si un 304 a été envoyé à la place du corps. */
export function etagOu304(reply: FastifyReply, corps: unknown): boolean {
	const etag = etagDuCorps(corps);
	reply.header("ETag", etag);
	if (!correspond(reply.request.headers["if-none-match"], etag)) return false;
	reply.code(304).send();
	return true;
}
