/**
 * Process-wide honeypot state, shared by the decoy listener and the read-only
 * API route. The network snapshot is optional: without the versioned fixture,
 * provenance falls back to `unknown` rather than making a network call.
 */
import { readFileSync } from "node:fs";
import {
	createNetworkClassifier,
	createScanStore,
	type NetworkClassifier,
	type NetworkDataset,
} from "./model.js";

const FIXTURE = new URL("../../../bench/fixtures/honeypot-networks.json", import.meta.url);

function loadDataset(): NetworkDataset {
	try {
		return JSON.parse(readFileSync(FIXTURE, "utf8")) as NetworkDataset;
	} catch {
		return { generatedAt: "none", sources: [] };
	}
}

export const networkDataset = loadDataset();
export const networkClassifier: NetworkClassifier = createNetworkClassifier(networkDataset);
export const honeypotStore = createScanStore();
