import { loadCandidateIndex, matchOrgInIndex } from "/home/jolt/radar-wt/LeakSites2/apps/api/src/quarantine/promote.js";
import { readFileSync } from "node:fs";
import { closePools } from "/home/jolt/radar-wt/LeakSites2/apps/api/src/db.js";
const posts = JSON.parse(readFileSync("/home/jolt/radar-wt/LeakSites2/.tmp/rl_posts_2026.json","utf8"));
const names = [...new Set(posts.map((p:any)=>p.post_title))].slice(0,20);
const t0 = Date.now();
for (const n of names) { const c = await loadCandidateIndex(n); matchOrgInIndex(n, c); }
console.log("names", names.length, "ms", Date.now()-t0, "avg", ((Date.now()-t0)/names.length).toFixed(1));
await closePools();
