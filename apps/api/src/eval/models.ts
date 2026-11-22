/**
 * Adapters exposing the production's local models to the benchmark engine.
 * Both models are pure: no network call, no paid service, no database access.
 */
import {
  evaluatePertinence,
  loadRelevanceConfig,
  type RelevanceConfig,
} from "../collectors/pertinence.js";
import { detectFalseEvent } from "../detect/false-events.js";
import type { BinaryModel } from "./binary-bench.js";

export interface RelevanceCaseInput {
  title: string;
}

export interface FalseEventCaseInput {
  id: number;
  title: string;
  orgId: number | null;
  regional: boolean;
}

function configVersion(config: RelevanceConfig): string {
  return `keywords=${config.keywords.length},exclusions=${config.exclusions.length},threshold=${config.minScore}`;
}

/** The admission gate used by the collectors on narrative sources. */
export function relevanceGateModel(
  config: RelevanceConfig = loadRelevanceConfig(),
): BinaryModel<RelevanceCaseInput> {
  return {
    name: "relevance-gate",
    version: configVersion(config),
    predict: ({ title }) => evaluatePertinence({ title }, { config }).relevant,
  };
}

/**
 * The false-event gate used by the detection engine. A retained event is a
 * positive prediction; an NA anchor keeps an event even without cyber text.
 */
export function falseEventGateModel(
  config: RelevanceConfig = loadRelevanceConfig(),
): BinaryModel<FalseEventCaseInput> {
  return {
    name: "false-event-gate",
    version: configVersion(config),
    predict: ({ id, title, orgId, regional }) => {
      const verdict = detectFalseEvent({
        id,
        title,
        org_id: orgId,
        regional,
      });
      return !verdict.isFalse;
    },
  };
}
