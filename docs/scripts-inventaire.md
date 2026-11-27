# Inventaire des scripts

Mesure du 2026-11-27 sur `main` : **457 fichiers exécutables** dans `scripts/`
(`.mts`, `.ts`, `.js`, `.sh`, `.py`). Une recherche de références statiques dans
le dépôt (`package.json`, workflows, README, `docs/`, sources, tests, SQL et
scripts) laisse **101 candidats orphelins** : leur nom n'apparaît nulle part
en dehors d'eux-mêmes.

Ce sont des **candidats**, pas une liste de suppression. Un script peut être
appelé dynamiquement, par un opérateur, par un timer systemd ou par un outil
hors dépôt. Aucun fichier ne doit être supprimé sur la seule foi de ce comptage.

## Régénérer la liste

```bash
node -e '
const fs=require("fs"),path=require("path");
const walk=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name===".git"||e.name==="node_modules")continue;
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p,o);
  else if(/\.(mts|ts|tsx|js|mjs|json|md|yml|yaml|sh|py|sql)$/.test(e.name))o.push(p);
}return o};
const all=walk(".").map(f=>{try{return fs.readFileSync(f,"utf8")}catch{return""}}).join("\n");
const scripts=fs.readdirSync("scripts").filter(n=>/\.(mts|ts|js|sh|py)$/.test(n));
for(const n of scripts) if(all.split(n).length-1<=1) console.log(n);
'
```

## Doublons de vocabulaire

Le dépôt contient **155 scripts** préfixés `measure-*` ou `mesure-*`. Les deux
conventions coexistent sans registre unique. L'inventaire ci-dessus est le
premier filtre ; une consolidation doit passer par un catalogue explicite des
commandes utiles plutôt que par une suppression en masse.

## Décision recommandée

1. Garder les scripts appelés par `package.json`, la CI, les systemd timers et
   les documentation de mesure.
2. Marquer explicitement les scripts manuels encore utiles dans cette page.
3. Ne retirer que les candidats restants après une vérification d'appels
   dynamiques et un délai d'observation.
