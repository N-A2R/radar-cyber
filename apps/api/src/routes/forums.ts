/**
 * Public read-only view of the public-forum watcher.
 *
 * The response contains aggregate counts and source metadata only: no author,
 * no victim detail and no raw message body is exposed.
 */
import type { FastifyInstance } from "fastify";
import { readForumStats } from "../forums/collect.js";
import { FORUM_SOURCES } from "../forums/sources.js";

export default async function (app: FastifyInstance) {
  app.get("/forums", async () => {
    const stats = await readForumStats();
    return {
      followedForums: stats.followedForums,
      relevantMessages: stats.relevantMessages,
      sources: FORUM_SOURCES.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        license: source.license,
        scope: source.scope.kind,
      })),
    };
  });
}
