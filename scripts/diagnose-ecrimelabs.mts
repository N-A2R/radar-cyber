const URL = "https://feeds.ecrimelabs.net/data/metasploit-cve";

function detectIndicatorType(line: string): string | null {
  let value = line.trim();
  if (!value || value.startsWith("#")) return null;
  value = value.replace(/^(?:async|sync)\s+/i, "").trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ip";
  if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
  if (/^https?:\/\//.test(value)) return "url";
  if (/^cve-\d{4}-\d+$/i.test(value)) return "cve";
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(value)) return "domain";
  return null;
}

const res = await fetch(URL);
const body = await res.text();
const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const sample = lines.slice(0, 200);
const recognized = sample.filter((l) => detectIndicatorType(l) !== null).length;
const proportion = sample.length ? recognized / sample.length : 0;

const looksLikeBlocklistOld = (url: string) => /\.(txt|csv|json|zip)(\?|$)/i.test(url) || /blocklist|blacklist|hostfile|feed-osint/i.test(url);
const oldAsIndicator = false || (true && looksLikeBlocklistOld(URL)); // kind narrative, format json
const newAsIndicator = false || (true && proportion > 0.3);

let changed = 0;
const changedLines: string[] = [];
for (const l of lines) {
  const isInd = detectIndicatorType(l) !== null;
  const beforeCamp = oldAsIndicator ? (isInd ? "indicator" : "skipped") : "narrative";
  const afterCamp = newAsIndicator ? (isInd ? "indicator" : "skipped") : "narrative";
  if (beforeCamp !== afterCamp) {
    changed++;
    if (changedLines.length < 10) changedLines.push(`${beforeCamp} -> ${afterCamp}: ${l}`);
  }
}

console.log(`sample=${sample.length}`);
console.log(`recognized=${recognized}`);
console.log(`proportion=${proportion.toFixed(3)}`);
console.log(`old_as_indicator=${oldAsIndicator}`);
console.log(`new_as_indicator=${newAsIndicator}`);
console.log(`changed=${changed}`);
console.log("first_10_changed:");
for (const c of changedLines) console.log(c);