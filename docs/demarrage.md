# Démarrage prouvé — D0

> Première mise en marche complète du radar dans l'environnement de reprise, sur
> des données réelles. Chaque sortie ci-dessous vient d'une commande réellement
> exécutée le 2026-11-12/13 ; rien n'est reconstitué de mémoire. Les défauts
> découverts par cette exécution sont listés en fin de document — ils ne sont ni
> masqués ni corrigés ici (un défaut = un chantier).

**Critères de sortie du chantier D0**

| Critère | Attendu | Mesuré | |
|---|---|---|---|
| `SELECT count(*) FROM org` | ≥ 34 000 | **34 330** | ✅ |
| Événements affichés dans le fil | ≥ 10 | **38** (25 en page 1 du fil) | ✅ |
| Capture de l'UI | 1 | fil + annuaire + fiche org (`bench/results/demarrage-capture-2026-11-12.txt`) | ✅ |
| Lot réel ingéré, dont ≥ 3 rattachés à une organisation | ≥ 10 evt. | 38 evt. ; **10 portent un `org_id`** (2 rattachements corrects vérifiés + 8 faux positifs du moteur, voir § Défauts) | ⚠️ |

## 0. Prérequis et contraintes de l'environnement

- Node 24, `pnpm@12.15.0` (`corepack enable && corepack prepare pnpm@12.15.0 --activate`).
- **Réseau sortant du sandbox filtré** (TLS coupé hors github/npm/pypi) : les
  collecteurs RSS/HTTP du radar ne joignent aucune source. Conséquence assumée
  et documentée plus bas : les boucles de collecte sont débrayées
  (`RADAR_COLLECT=0`) et le lot réel est apporté par la porte d'admission HTTP
  prévue à cet effet (`POST /api/ingest`, docstring : « bots Hermes, scripts »).

## 1. Base fraîche et socle

```bash
pnpm install

# PostgreSQL embarqué, cluster neuf, port 5433 (base de test de la mission)
PGDATA=./pgdata PGPORT=5433 pnpm db:up
# → PostgreSQL prêt sur 5433 (db=radar user=radar, données=./pgdata)

DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
RADAR_ADMIN_EMAIL=admin@radar.local RADAR_ADMIN_PASSWORD=demo-d0-radar \
pnpm setup            # = scripts/bootstrap.mts --with-sample
```

Sortie (extraits) :

```
✓ schéma                    db/init.sql appliqué
✓ migrations                29/29 appliquées
✓ sources                   265 en base (18 catalogues versionnés)
✓ règles de détection       7 règle(s)
✓ référentiel NA            4462 orgs / 22904 alias
jeu : Échantillon de revendications pour la file de revue
  source : joshhighet/ransomwatch — posts.json — Unlicense
  500 revendications, fenêtre ["2024-06-01","2025-06-17"]
500 fait(s) inséré(s), 500 en quarantaine pour cette source
✓ échantillon quarantaine   500 faits
✓ journal de vérité         table présente, append-only et projections vérifiés
✓ compte                    admin@radar.local
Socle : 9/9 étapes en place.
```

Migrations 028 et 030 vérifiées en base après coup :

```
event_archive = true          -- migration 028 (archive longue)
org_history   = true          -- migration 030 (bi-temporel)
migrations    = 29/29         -- dernière : migrate-031-alert-delivery-channels.sql
```

## 2. Référentiel complet (les 4 jeux de `db/data/`)

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
apps/api/node_modules/.bin/tsx scripts/load-organisations-na.mts --apply
```

Sortie (extraits) :

```
chargé : 34330 organisations, 29564 alias
bilan : 29 868 création(s), 4 462 mise(s) à jour, 0 rattachement(s) par SIREN, 29 564/52 468 alias insérés
répartition : 4 462 collectivite, 10 008 sante, 6 528 enseignement, 13 332 entreprise
```

## 3. API et interface

```bash
# API — sans boucles de collecte (réseau sortant bloqué de toute façon)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar RADAR_COLLECT=0 \
PORT=8080 HOST=127.0.0.1 apps/api/node_modules/.bin/tsx apps/api/src/server.ts
# → Server listening at http://127.0.0.1:8080

# Web — vite proxifie /api vers l'API ; allowedHosts ouvert pour la prévisualisation
RADAR_ALLOWED_HOSTS=.e2b.app,localhost,127.0.0.1 \
RADAR_API_ORIGIN=http://127.0.0.1:8080 pnpm -F @radar/web dev
# → VITE v8.3.7  ready in 215 ms — http://localhost:5173/
```

Compte de démonstration locale : `admin@radar.local` / `demo-d0-radar`
(mot de passe jetable, instance locale uniquement — en production le mot de passe
vient de `RADAR_ADMIN_PASSWORD` au passage de `scripts/create-admin.mts`, jamais
d'un fichier).

## 4. Ingestion du lot réel

Deux lots réels, deux portes réelles. Le lot complet est versionné dans
`bench/results/demarrage-lot-reel-2026-11-12.json` (28 événements, chacun avec
son URL de preuve et sa date de consultation).

**Lot presse (28 événements)** — panorama complet Cyberhebdo LeMagIT du
13/11/2026 (24 incidents internationaux, chacun avec la source d'origine
pointée par la compilation) + 4 incidents Nouvelle-Aquitaine individuellement
sourcés (EFS Bordeaux 03/11, sites publics girondins 21/10, Berson 21/02/2025,
Floirac 18/04/2024). Aucun des 20 incidents du corpus de référence
(`bench/fixtures/corpus-reference-na.json`) n'apparaît dans ce lot : la mesure
de couverture à venir reste intègre.

```bash
# POST /api/ingest (authentifié) avec le lot versionné
# → 200 {"inserted":28,"skipped":0,"contract":{"rejections":[],"repairs":[]},"rejected":[]}
```

**Lot quarantaine (10 revendications)** — les 10 plus anciens faits de la file
de revue (ransomwatch, revendications réelles de groupes : cactus, lockbit3,
bianlian, blackbasta…), promus par la voie d'analyste, sans sélection :

```bash
for id in $(seq 1 10); do
  curl -X POST "http://127.0.0.1:8080/api/quarantine/$id/promote" \
    -H "Authorization: Bearer $TOKEN"
done
# → 10 événements créés (third_party_claim), 1 alerte par promotion
#   (règle ransomware-revendication) — 10 alertes au total
```

**Rattachement aux organisations** — moteur d'alias du dépôt
(`scripts/match-orgs.mts`), dry-run puis application :

```
[match] 52468 alias actifs (0 rejeté(s) en base), seuil 0.7
[match] avant : 8/38 événements rattachés (1 organisation(s)) — dry-run, aucune écriture
[match] 30 événement(s) sans organisation examiné(s)
[match] motifs sur les événements examinés :
[match]   matched 2 · no-alias 10 · short-only 6 · ambiguous 1 · below-threshold 11
[match]       26  conf=1.0  Commune de Bordeaux (alias « mairie de bordeaux ») ← Sites publics girondins…
[match]       27  conf=1.0  Commune de Berson (alias « mairie de berson ») ← Berson (FRA-33)…
[match] après : 10/38 événements rattachés (3 organisation(s)) — 2 ligne(s) mise(s) à jour, 2 rattachement(s) net(s)
```

## 5. État final en base

```
org               = 34 330   (collectivite=4462, enseignement=6528, entreprise=13332, sante=10008)
org_alias         = 52 468
source            = 265
detection_rule    = 7
event             = 38       (hermes_radar_cyber=28, ransomlook=10)
alert             = 10
quarantine_raw    = 500      (10 promues)
event_archive     = présente (migration 028)
org_history       = présente (migration 030)
migrations        = 29/29
rattachements     = 10/38 événements, 3 organisations
                    N-COM (N-COM)=8 ; Commune de Berson=1 ; Commune de Bordeaux=1
```

## 6. Captures de l'UI (données réelles, rendu statique des vrais composants)

Mécanisme : `apps/web/test/etat-rendu.tsx` (nouveau, convention des `*-verif.tsx`
du dépôt) se connecte à l'API en cours d'exécution et rend les **vrais**
composants avec les **vraies** données — même chemin de rendu que le navigateur.
Sortie intégrale : `bench/results/demarrage-capture-2026-11-12.txt`.

```bash
RADAR_API_ORIGIN=http://127.0.0.1:8080 \
RADAR_ADMIN_EMAIL=admin@radar.local RADAR_ADMIN_PASSWORD=demo-d0-radar \
pnpm -F @radar/web run test:etat
```

### Fil (extraits)

```
FIL — 25 événements (API GET /api/events, tri régional)
dont 10 rattachés à une organisation, 5 familles
Fil d'événements 25 — tout · ransomware 14 · vuln 1 · leaks 4 · malware 1 · presse_cyber 5
4jmthompson.com$17.9M\USA\331GB\<1% DISCLOSED — revendiqué par cactus   ransomware · aujourd'hui · ransomlook · fragile
…
4Berson (FRA-33) : rançongiciel et rançon, la mairie privée de ses sauvegardes   ransomware · il y a 21 mois · hermes_radar_cyber · plausible, à confirmer
3Sites publics girondins indisponibles après une faille critique (préfecture, métropole, mairies de Bordeaux et de Pessac)   vuln · il y a 23 j · hermes_radar_cyber · plausible, à confirmer
4Université Charles de Prague (CZE) : compromission du SIS, données personnelles exfiltrées   leaks · aujourd'hui · hermes_radar_cyber · plausible, à confirmer
4Établissement français du sang de Bordeaux (FRA-33) : chambres froides programmées à 110 °C via un prestataire   presse_cyber · il y a 10 j · hermes_radar_cyber · plausible, à confirmer
```

### Annuaire (extraits)

```
ANNUAIRE — page 1 (API GET /api/directory, tri événements décroissant)
34330 organisations au total, 25 affichées
Organisation· | Nature | Commune· | Dépt· | Événements▼ | Carte
N-COM (N-COM) | Entreprise | VILLENEUVE | 33 | 8 | géolocalisée
Commune de Berson | Collectivité | Berson | 33 | 1 | géolocalisée
Commune de Bordeaux | Collectivité | Bordeaux | 33 | 1 | géolocalisée
Commune de Abzac | Collectivité | Abzac | 16 | 0 | géolocalisée
…
```

### Fiche organisation — Commune de Bordeaux (extraits)

```
FICHE ORGANISATION — Commune de Bordeaux (API GET /api/orgs/1918)
collectivite · commune · Bordeaux · 33
historique 1 faits / 12 mois
vue depuis octobre 2026 · nouvelle dans le radar · 1 source
vuln ×1
faits 1 — corroborés 0 — isolés 1
Sites publics girondins indisponibles après une faille critique (préfecture, métropole, mairies de Bordeaux et de Pessac)   21 oct. 2026 · vuln · source unique · hermes_radar_cyber
actifs 0 — aucun actif découvert
événements 1 — vuln 1
revendications 0
exposition sur 12 mois
```

## 7. Vérification complète

```bash
RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres bash scripts/verify-all.sh
```

Sortie intégrale : `bench/results/demarrage-verify-2026-11-12.txt`. Bilan :

```
OK: contrat (hors base)          21 tests, 0 échec
INFO: socle incomplet ou base absente   (→ § Défauts n°1 : journal)
OK: typecheck api                tsc --noEmit
OK: typecheck web                tsc --noEmit
OK: tests api                    # tests 336 · # pass 336 · # fail 0
OK: tests rendu / dom / sources / inspecteur / fil / corroboration / hors ligne
OK: build web                    ✓ built in 1.29s
OK: healthcheck local            /api/health {"ok":true,"sources":265}
                                 /api/stats {"orgs":34330,"events":38,"indicators":0}
Vérification complète OK.
```

## 8. Ce que la remise en marche a révélé

Les deux défauts ci-dessous sont produits par le lot réel, pas par des cas
d'école. Ils ne sont **pas** corrigés ici : un défaut = un chantier, avec ses
tests. Les sorties qui les montrent sont dans les fichiers cités.

### Défaut n°1 — les portes d'ingestion ne tracent pas les événements au journal

`scripts/verify-journal.mts` (contrôle « couverture » : tout événement doit
porter un fait de journal, `event.rattachement` ou `match.decided`) :

```
ÉCHEC couverture    0/38 événement(s) tracé(s), 38 sans trace
```

Les collecteurs passent par `consignerLot` (`collectors/generic.ts`) et
journalisent chaque événement ; les portes `POST /api/ingest` et
`POST /api/quarantine/:id/promote` non. Angle mort confirmé sur données réelles
— c'est exactement ce que le contrôle du journal est fait pour voir.

### Défaut n°2 — faux positif systématique du moteur de promotion

La promotion automatique/manuelle (`matchOrgInIndex` dans
`quarantine/promote.ts`) a rattaché **8 des 10 revendications promues à la même
organisation**, « N-COM (N-COM) » (entreprise, Villeneuve-d'Ornon, 33) :

```
top orgs = N-COM (N-COM)=8 ; Commune de Berson=1 ; Commune de Bordeaux=1
```

Mécanisme : l'alias « com » de N-COM (nom « N-COM (N-COM) » → jetons `[com,
com]`) satisfait la règle « tous les jetons de l'organisation présents dans
l'indice » dès qu'un indice contient un domaine `.com` (« espackeuro.com… » →
jetons `{espackeuro, com}`), soit un score 0,75 ≥ seuil 0,5. Le second étage
(`confirmOrganization`, modèle de décision) est hors réseau dans cet
environnement : sa réponse `null` est interprétée « on garde la décision
déterministe ». Résultat : 8 liens faux, visibles en tête d'annuaire ci-dessus.
Les 8 événements porteurs sont laissés en l'état (preuve du défaut) et sont
**exclus du compte de rattachements corrects**.

### Réserve sur le critère « ≥ 3 rattachés à une organisation »

Compte tenu du défaut n°2, le décompte honnête est : **2 rattachements corrects
vérifiés** (Commune de Bordeaux, Commune de Berson — confiance 1,0 chacun, alias
« mairie de bordeaux » / « mairie de berson »), **8 faux positifs** (défaut
n°2), et deux abstentions légitimes ou trous de référentiel :

- **Floirac** (18/04/2024) : le moteur s'abstient — homonymie « Commune de
  Floirac » (33) / (17), pas départageable par `match-orgs` (le moteur
  `gazetteer@2`, lui, départage par le département cité — différentiel déjà
  mesuré par `scripts/rejouer-moteur.mts`).
- **EFS Bordeaux** (03/11/2026) : l'établissement existe au référentiel sous
  « EFS NOUVELLE-AQUITAINE SITE PELLEGRIN » (8085) et « …HAUT LEVEQUE » (9332),
  mais sans alias « Établissement français du sang » ni « EFS Bordeaux » :
  **trou de référentiel**, pas du moteur. L'article ne nomme pas le site
  bordelais concerné : un analyste honnête s'abstient aussi entre les deux.

### Ce qui est débrayé, et pourquoi

- `RADAR_COLLECT=0` : aucune boucle de collecte (RSS presse, NVD, onion,
  ransomware.live…). Le réseau sortant du sandbox est filtré ; les 265 sources
  resteraient muettes et inonderaient les logs d'`fetch failed`.
- La promotion automatique (`promoteMatches`, tick 30 min) n'a pas été laissée
  tourner : les 10 promotions viennent explicitement de la file de revue.
