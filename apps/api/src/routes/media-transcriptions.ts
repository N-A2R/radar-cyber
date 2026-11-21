import type { FastifyInstance } from "fastify";
import { countTranscriptions } from "../media/store.js";

/** Public, read-only summary of the audio/video watch. No transcript text. */
export default async function (app: FastifyInstance) {
  app.get("/media/transcriptions", async () => {
    const counts = await countTranscriptions();
    return {
      total: counts.total,
      relevant: counts.relevant,
      relevantRate: counts.total === 0 ? null : counts.relevant / counts.total,
      byDepartment: counts.byDept,
      byType: counts.byType,
    };
  });
}
