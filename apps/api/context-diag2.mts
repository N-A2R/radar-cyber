import { closePools, query } from "./src/db.js";
import { loadOrgIndex } from "./src/quarantine/promote.js";
import { buildSimilarityIndex, organisationsProches } from "./src/quarantine/contexte.js";
const orgs = await loadOrgIndex();
for (let i=0;i<4;i++) { const t=performance.now(); const index=buildSimilarityIndex(orgs); console.log("build",i,(performance.now()-t).toFixed(1)); if(i===3){const h=(await query<{org_hint:string}>("select org_hint from quarantine_raw where kind=$1 limit 50",["claim"])).rows.map(r=>r.org_hint??""); for(let k=0;k<3;k++){const t2=performance.now(); for(const x of h) organisationsProches(x,index); console.log("proches",k,(performance.now()-t2).toFixed(1));}}}
await closePools();
