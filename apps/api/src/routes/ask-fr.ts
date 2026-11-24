import type { FastifyInstance } from "fastify";
import { answerAnchored } from "../search/anchored-answer.js";

/** API française : chaque affirmation rendue porte son identifiant d'événement et sa preuve. */
export default async function (app: FastifyInstance) {
  app.get("/search/ask-fr", async (request, reply) => {
    const question = ((request.query as Record<string, string | undefined>).q ?? "").trim();
    if (question.length < 3) {
      return reply.code(400).send({
        error: { code: "QUESTION_INVALIDE", message: "q doit contenir au moins 3 caractères" },
      });
    }
    return answerAnchored(question);
  });
}
