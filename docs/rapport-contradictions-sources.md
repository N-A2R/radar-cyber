# Contradictions entre sources — mesure du 22 novembre 2026

## Objectif et chiffre obtenu

**1 contradiction détectée** sur les événements réels de Nouvelle-Aquitaine.

La mesure porte sur l'état réel lu en base au moment de l'exécution :
**1 678 185 organisations**, **312 sources**, **26 259 événements**. Le
périmètre Nouvelle-Aquitaine retient **103 événements**, dont **94 rattachés
à un sujet identifiable** (74 sujets distincts). Les 9 autres événements sont
régionaux mais sans organisation ni victime identifiée : ils ne peuvent pas être
rapprochés d'un autre éditeur et ne sont donc pas comptés.

Répartition : **1 désaccord de gravité**, **0 désaccord de nature**.

## Ce qui est compté comme une contradiction

Deux éditeurs indépendants qui parlent du même sujet dans une fenêtre de 72
heures et ne disent pas la même chose :

- **gravité** : les sévérités déclarées diffèrent, même d'un seul point. Une
  source silencieuse sur la gravité ne vaut pas zéro et n'est pas comparée ;
- **nature** : les catégories d'affirmation diffèrent (avis de vulnérabilité,
  revendication de rançongiciel, fuite de données, renseignement).

Le sujet est l'organisation rattachée, sinon le domaine de la victime déclaré
par la source. Deux événements du même sujet ne sont rapprochés que s'ils
partagent un mot de sujet (`nginx`, par exemple) : un avis sur Oracle ne fusionne
pas avec un avis sur NGINX parce qu'ils sont publiés le même jour. Les flux d'un
même éditeur sont comptés comme une seule voix (`ransomlook.io` et
`www.ransomlook.io` sont le même éditeur). Les sources grises sont incluses.

## La contradiction observée

Trois éditeurs publient le 18 novembre 2026 des avis sur les vulnérabilités
F5 NGINX : `cert.ssi.gouv.fr` déclare la gravité **3**, `cert.at` et
`feeds.ncsc.nl` déclarent la gravité **2**. Aucun titre, résumé ou identité de
victime n'est repris ici ; le sujet est identifié par l'empreinte
`8c715a903795b09b` et les événements par leurs identifiants internes `51151`,
`51362`, `51960`.

La règle déjà présente dans la fiche organisation exigeait un écart d'au moins
deux points : elle ne voyait donc pas ce désaccord 3 contre 2. Le détecteur
ajouté compare les positions réellement déclarées, sans seuil arbitraire.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-source-contradictions.mts \
  --json=bench/results/source-contradictions-2026-11-22.json
```

Équivalent : `pnpm mesure:contradictions`. La commande est en lecture seule,
ne fait aucun appel réseau et s'achève en environ 1,3 seconde. Le résultat
détaillé est écrit dans `bench/results/source-contradictions-2026-11-22.json`.

Les dix comportements sont fixés par `apps/api/test/source-contradictions.test.ts`
(10 tests verts) : désaccord de gravité, désaccord de nature, éditeurs
indépendants, hors Nouvelle-Aquitaine, fenêtre de 72 heures, sujets distincts,
domaine de victime, absence de données personnelles, source unique, gravité
non renseignée.

## Contraintes

- Nouvelle-Aquitaine uniquement : événement régional ou organisation rattachée
  à l'un des douze départements de la région ;
- sources grises autorisées, aucun service payant, aucun appel réseau ;
- aucune donnée personnelle de victime : le rapport ne contient que des
  empreintes SHA-256 tronquées, des identifiants d'événements internes et des
  noms d'éditeurs publics ;
- code et interface en anglais, rapport en français ;
- `apps/api/src/server.ts` inchangé : 0 ligne de diff ;
- aucune commande de plus de 60 secondes (mesure ~1,3 s, tests ~0,5 s).
