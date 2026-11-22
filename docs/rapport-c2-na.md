# Rapport — Serveurs de commande hébergés en Nouvelle-Aquitaine

**Date de mesure :** 22 novembre 2026 (03 h 12 UTC).
**Périmètre :** Nouvelle-Aquitaine uniquement. Sources grises admises, aucun service payant, aucun appel réseau.

## Résultat

**Le nombre de C2 présumés hébergés en Nouvelle-Aquitaine est 0.**

Le chiffre est mesuré sur l'état réel de la base, pas supposé. La liste `detections` du JSON de preuve est vide ; chaque détection porterait un identifiant, **la source qui l'a révélée**, la règle appliquée (`na-hosting`) et la localité de Nouvelle-Aquitaine reconnue. Preuve : `bench/results/c2-na-2026-11-22.json`.

Le préfiltrage a examiné **8 signaux bruts porteurs d'un mot-clé C2** : quatre titres d'actualité CTI de `actu-infosecurity-magazine` et quatre indices de revendication de la source grise `ransomwatch`. Aucun ne satisfait la règle d'hébergement explicite en région :

- le seul titre qui affirme un hébergement de C2 est « Iranian Hacking Group Found Hosting C2 Infrastructure in the US » (événement 23478, source `actu-infosecurity-magazine`) : l'hébergement est aux États-Unis, donc hors périmètre ;
- les trois autres titres CTI parlent de C2 sans localisation d'hébergement (blockchain Solana, panneau RatHat, malware NIK) ;
- les quatre indices `ransomwatch` sont des noms d'entreprise contenant les initiales « C&C », sans verbe ni lieu d'hébergement : faux positifs du préfiltrage, écartés par la règle.

Aucune détection n'ayant été retenue, il n'y a aucune source à attribuer à une détection ; les huit sources de signaux sont en revanche conservées une par une dans le JSON (`signals`, avec `id`, `source`, `origin`, `family`, sans texte).

## État réel de départ

Mesure faite sur la base de travail réelle `radar` (PostgreSQL local), sans jeu de démonstration :

| Grandeur | Valeur mesurée | Requête |
|---|---:|---|
| Organisations | 1 673 151 | `SELECT count(*) FROM org;` |
| Sources | 312 | `SELECT count(*) FROM source;` |
| Événements | 26 239 | `SELECT count(*) FROM event;` |
| Revendications en quarantaine | 32 959 | `SELECT count(*) FROM quarantine_raw WHERE kind='claim';` |
| Signaux C2 bruts | 8 | `SQL.signals` dans le JSON de preuve |
| Sources C2 du catalogue | 4 | `SQL.sources` dans le JSON de preuve |
| Détections NA retenues | **0** | `detectC2Servers` |

Les quatre sources dont l'identifiant ou le nom annonce un flux C2 sont `feed:firehol:c2_tracker`, `feed:firehol:cybercrime`, `feodo-ip` et `osint-threatfox` ; aucune n'a d'événement stocké dans l'état mesuré. La recherche porte sur les identifiants et les noms, pas sur les URL : une adresse `.onion` contenant la sous-chaîne « c2 » n'est pas une source C2.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  pnpm measure:c2-na --json=bench/results/c2-na-2026-11-22.json
```

Dans ce bac à sable, le rôle `radar` n'a pas de mot de passe utilisable ; la mesure a été exécutée en lecture seule par socket PostgreSQL :

```bash
time timeout 55 sudo -n -u postgres env HOME=/tmp \
  DATABASE_URL='postgres://postgres@localhost/radar?host=/var/run/postgresql' \
  ./apps/api/node_modules/.bin/tsx scripts/measure-c2-na.mts \
  --json=/tmp/c2-na-2026-11-22.json
# puis, en tant qu'utilisateur du worktree :
cp /tmp/c2-na-2026-11-22.json bench/results/c2-na-2026-11-22.json
```

Sortie observée :

```
NA presumed C2 servers hosted in region: 0 (signals=8, c2 sources=4, orgs=1673151, sources=312, events=26239) -> /tmp/c2-na-2026-11-22.json
```

Durée mesurée : **1,4 s**. Aucun appel réseau, aucune écriture dans les tables métier. Le JSON contient les requêtes SQL exactes et les expressions régulières utilisées (`patterns`).

## Méthode, en cinq étapes testables

1. **Préfiltrage SQL.** Seuls les titres d'événements (hors `family = 'vuln'`, les descriptions de CVE n'étant pas des observations d'infrastructure) et les indices de revendication sont interrogés avec l'expression partagée `C2_PATTERN`. Aucun résumé, corps TLP:RED, nom de victime, courriel ni téléphone n'est sélectionné.
2. **Qualification du signal.** Un titre doit nommer explicitement un C2 (`C2`, `C&C`, `CNC`, `command and control`, `serveur de commande`) ou un framework de C2 (`Cobalt Strike`, `teamserver`, `Meterpreter`, `Brute Ratel`, `Sliver C2`). Un simple mot « serveur » ne suffit pas.
3. **Preuve d'hébergement en région.** Un mot d'hébergement (`hosted`, `hébergé`, `located`, `infrastructure`, `server`, …) doit être suivi, dans la même phrase, d'une localité de Nouvelle-Aquitaine : douze départements, préfectures et villes complémentaires, en français ou en anglais, accentué ou non. Un pays ou une ville étrangère explicite dans la clause d'hébergement annule le rattachement, même si une localité NA apparaît plus loin dans le titre (victime à Bordeaux, C2 aux États-Unis → non compté).
4. **Attribution et déduplication.** Chaque détection conserve son identifiant et sa source d'origine, y compris pour les sources grises. Un même signal relu deux fois n'est compté qu'une fois.
5. **Publication.** Le compteur est exposé par `GET /api/c2/hosted` (clés anglaises, identifiants, sources et localité uniquement) et par la commande de mesure. Les titres d'origine ne quittent jamais la base.

Un test par comportement est écrit dans `apps/api/test/c2-hosted.test.ts` (15 tests) : anglais, français, framework connu, exclusion des CVE, hébergement explicite, nom de département, hébergement étranger, C2 sans hébergement, hébergement sans C2, source grise, déduplication, absence de donnée personnelle, mesure sur les tables réelles, attribution des signaux sans texte et contrat HTTP.

## Vérifications

- `tsx test/run.ts test/c2-hosted.test.ts test/resale-listings.test.ts test/securite-couverture.test.ts` sur une base de test jetable : **30 tests réussis, 0 échec**, en 2,2 s (5,0 s avec la création de la base).
- `tsc --noEmit -p tsconfig.json` (API) : réussi, 7,2 s.
- Mesure sur la base réelle : **1,4 s**, aucun appel réseau, aucune écriture.
- `apps/api/src/server.ts` n'est **pas modifié** (diff de **0 ligne**) : la route est enregistrée dans `routes/index.ts`, avec sa règle d'accès dans `security/rbac.ts`.
- Le code, les clés JSON, la route et les messages de commande sont en anglais ; le présent rapport est en français.
- Aucune donnée personnelle de victime n'est stockée ni publiée : le JSON ne contient que des compteurs, des identifiants, des noms de sources et la localité NA reconnue par la règle.

## Prévolution

Recherches effectuées avant toute modification : `gh pr list --state all --search 'chantier-p4'`, `'C2 Nouvelle-Aquitaine'`, `'serveurs de commande'`, `'C2 hébergés'`, `'command and control'`, `'chantier p4'`, `'C2'`, `'hébergement'`, `'hosting'`, `'serveurs'`, `'p4'`, et `git log --all --format='%h %s' | grep -iE 'c2|commande|command.and.control|hosted|héberg'`, complété par l'historique des branches `ext/chantier-p1` à `p3` : **aucune PR ni aucun commit ne couvre ce chantier**.

## Limites assumées

Le chiffre 0 décrit fidèlement l'état disponible : il ne prétend pas qu'aucun serveur de commande n'est hébergé dans la région, seulement qu'aucun hébergement explicite n'est détectable dans les titres et indices collectés. La règle refuse les inférences à partir de l'organisation rattachée à un événement : ce rattachement désigne la victime, pas l'hébergeur. Les quatre flux C2 du catalogue ne livrent aucun événement dans l'état mesuré ; brancher ces flux et géolocaliser leurs adresses IP demanderait une nouvelle collecte, hors périmètre de cette mesure sans appel réseau.
