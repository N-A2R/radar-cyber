import { ingestQuery, closePools } from "../apps/api/src/db.js";
import { readFileSync } from "node:fs";
const posts = JSON.parse(readFileSync(".tmp/rl_posts_2026.json", "utf8")) as {post_title:string}[];
const norm = (s:string)=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\b(sarl|sas|sa|eurl|sci|scp|association|assoc|groupe|group|inc|llc|ltd|france|fr)\b/g," ").replace(/\s+/g," ").trim();
const names = [...new Set(posts.map(p=>norm(p.post_title)).filter(n=>n.length>=5))].slice(0,1000);
const t0=Date.now();
const r = await ingestQuery<{id:number;name:string;dept:string|null}>("SELECT id,name,dept FROM org WHERE name_norm = ANY($1::text[]) AND dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')", [names]);
console.log("names",names.length,"matches",r.rows.length,"ms",Date.now()-t0, r.rows.slice(0,5));
await closePools();
