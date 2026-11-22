/**
 * GET /api/reconnaissance — reconnaissance-phase footprint of Nouvelle-Aquitaine
 * organizations.
 *
 * The response carries aggregate counters plus one row per detected
 * organization (identifier, department, signal, evidence count). No hostname,
 * IP address, organization name or victim data is exposed.
 */
import type { FastifyInstance } from "fastify";
import { measureReconnaissance } from "../reconnaissance/measure.js";

export default async function reconnaissanceRoute(app: FastifyInstance) {
  app.get("/reconnaissance", async () => {
    const measurement = await measureReconnaissance();
    return {
      scope: measurement.scope,
      basis: measurement.basis,
      count: measurement.count,
      candidates: measurement.candidates,
      falsePositives: measurement.falsePositives,
      falsePositiveRate: measurement.falsePositiveRate,
      signals: measurement.signals,
      candidateSignals: measurement.candidateSignals,
      observations: measurement.observations,
      detections: measurement.detections,
      measuredAt: measurement.measuredAt,
    };
  });
}
