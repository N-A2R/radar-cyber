/**
 * Validation du corps des routes POST : un même contrat de réponse 400 pour
 * toutes les écritures de l'API.
 *
 * La validation reste dans le handler (après les preHandler de limitation de
 * débit et d'authentification) : un corps invalide ne doit pas court-circuiter
 * le limiteur de débit.
 */
import type { FastifyReply } from "fastify";
import type { z } from "zod";

/** Résultat d'un `safeParse` : les données validées ou les issues détaillées. */
export type ParsedBody<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/** Un corps absent est traité comme un objet vide. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParsedBody<T> {
  return schema.safeParse(body ?? {});
}

export function invalidBody(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "invalid input",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}
