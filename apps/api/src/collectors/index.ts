import { collector as certfr } from "./certfr.collector.js";
import { collector as kev } from "./kev.collector.js";
import { collector as ransomlook } from "./ransomlook.collector.js";
import { collector as epss } from "./epss.collector.js";
import { collector as nvd } from "./nvd.collector.js";
import { collector as ctlog } from "./ctlog.collector.js";
import { collector as poc } from "./poc.collector.js";
import type { Collector } from "@radar/shared";

// L'insertion des événements de flux — et son `ON CONFLICT (fingerprint) DO NOTHING`
// (migration 045) — vit dans generic.ts : ce fichier ne fait que lister les
// collecteurs dédiés, appelés depuis server.ts.
export const collectors: Collector[] = [certfr, kev, ransomlook, epss, nvd, ctlog, poc];
