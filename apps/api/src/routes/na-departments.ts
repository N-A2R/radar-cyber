/**
 * GET /api/coverage/na-departments — event counts per Nouvelle-Aquitaine
 * department and the list of departments still at zero. Aggregate counters
 * only: no event body, no organization name, no personal data.
 */
import type { FastifyInstance } from "fastify";
import { measureNaDepartments } from "../technical/na-departments.js";

export default async function naDepartmentsRoute(app: FastifyInstance) {
  app.get("/coverage/na-departments", async () => await measureNaDepartments());
}
