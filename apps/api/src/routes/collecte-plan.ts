/**
 * Plan de collecte tel que le cycle le consomme.
 *
 * La réponse expose les sources retenues, leur rang, leur fréquence attendue,
 * leur état de santé et — pour celles qui sont écartées — le motif. C'est le
 * même objet que `chargerPlanCycle()` fournit au moteur : aucune seconde
 * règle de calcul côté route, aucun chiffre recalculé à l'affichage.
 */
import type { FastifyInstance } from "fastify";
import { chargerPlanCycle } from "../collectors/plan.js";
import { query } from "../db.js";
import { chargerCadencesValeur } from "../collectors/valeur-plan.js";

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/collecte/plan", async () => chargerPlanCycle(query, await chargerCadencesValeur()));
}
