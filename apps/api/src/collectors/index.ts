import { collector as certfr } from "./certfr.collector.js";
import { collector as kev } from "./kev.collector.js";
import { collector as ransomlook } from "./ransomlook.collector.js";
import { collector as epss } from "./epss.collector.js";
import { collector as nvd } from "./nvd.collector.js";
import { collector as ctlog } from "./ctlog.collector.js";
import { collector as poc } from "./poc.collector.js";
import type { Collector } from "@radar/shared";

export const collectors: Collector[] = [certfr, kev, ransomlook, epss, nvd, ctlog, poc];
