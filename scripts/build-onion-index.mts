/**
 * Rebuilds the .onion index from versioned evidence and prints the figure.
 *
 * Usage: pnpm onion:index
 * The command is offline, deterministic and completes in milliseconds.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadOnionIndex } from "../apps/api/src/onion/index.js";

const index = loadOnionIndex();
const output = fileURLToPath(new URL("../bench/results/onion-index.json", import.meta.url));
writeFileSync(output, `${JSON.stringify(index, null, 2)}\n`);

console.log(
  `onion index: ${index.liveAndProductiveSites} live and productive sites ` +
    `(${index.sourceCount} sources, ${index.siteCount} sites; ` +
    `${index.liveSites} live, ${index.productiveSites} productive; ` +
    `evidence ${index.evidenceFile} at ${index.evidenceAt})`,
);
