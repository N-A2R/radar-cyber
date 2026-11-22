/**
 * Frozen v1 contract and compatibility check. The snapshot is the published
 * promise; any divergence from it must be republished before release.
 */
import type { Operation } from "./catalog.js";
import { contractDigest, operationKey, operationSignature } from "./stability.js";

export type FrozenOperation = { method: string; path: string; signature: string };

export type FrozenContract = {
  version: string;
  frozenAt: string;
  digest: string;
  operations: FrozenOperation[];
};

export type CompatibilityReport = {
  version: string;
  stable: boolean;
  frozen: number;
  live: number;
  added: string[];
  breaking: string[];
  digest: string;
  digestMatches: boolean;
};

export function buildContract(
  operations: readonly Operation[],
  version: string,
  frozenAt: string,
): FrozenContract {
  const entries = operations
    .map((op) => ({ method: op.method, path: op.path, signature: operationSignature(op) }))
    .sort((a, b) => operationKey(a).localeCompare(operationKey(b)));
  return { version, frozenAt, digest: contractDigest(operations), operations: entries };
}

export function checkCompatibility(
  contract: FrozenContract,
  operations: readonly Operation[],
): CompatibilityReport {
  const live = new Map(operations.map((op) => [operationKey(op), op]));
  const frozen = new Map(
    contract.operations.map((op) => [operationKey(op), op.signature]),
  );
  const breaking: string[] = [];
  for (const [key, signature] of frozen) {
    const op = live.get(key);
    if (!op) breaking.push(`removed: ${key}`);
    else if (operationSignature(op) !== signature) breaking.push(`changed: ${key}`);
  }
  const added = operations
    .filter((op) => !frozen.has(operationKey(op)))
    .map(operationKey);
  const digest = contractDigest(operations);
  return {
    version: contract.version,
    stable: breaking.length === 0,
    frozen: contract.operations.length,
    live: operations.length,
    added,
    breaking,
    digest,
    digestMatches: digest === contract.digest,
  };
}
