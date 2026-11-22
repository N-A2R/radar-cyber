/**
 * Public read-only view of actors observed on Nouvelle-Aquitaine forums.
 *
 * Aggregates and public actor labels only: no author, no victim, no raw post.
 */
import type { FastifyInstance } from "fastify";
import { readForumActorStats } from "../forums/actor-store.js";

export default async function (app: FastifyInstance) {
  app.get("/forum-actors", async () => {
    const stats = await readForumActorStats();
    return {
      actorsIdentified: stats.actorsIdentified,
      mentions: stats.mentions,
      byActor: stats.byActor,
    };
  });
}
