import type { FastifyInstance } from "fastify";
import { answerQuestion } from "../search/answer-question.js";

/** English-language API for natural-language questions over the regional corpus. */
export default async function (app: FastifyInstance) {
  app.get("/search/ask", async (request, reply) => {
    const question = ((request.query as Record<string, string | undefined>).q ?? "").trim();
    if (question.length < 3) {
      return reply.code(400).send({
        error: { code: "INVALID_QUESTION", message: "q must contain at least 3 characters" },
      });
    }
    return answerQuestion(question);
  });
}
