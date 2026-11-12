# Chantier 3 — la file de revue de la quarantaine

**Statut : livré.** API 165/165, rendu web 59 contrôles, interactions web 26/26,
`tsc` sans erreur sur les deux applications, build web OK. Mesures :
`bench/results/NA-review.json`.

## Le problème, en chiffres

L'instance réelle compte **16 235 lignes en quarantaine pour 3 456 événements
publiés**. La route `GET /quarantine` existait, la promotion existait
(`quarantine/promote.ts`), mais **aucun écran** : personne ne pouvait trier ce
stock. La quarantaine était un puits, pas une file.

Trois obstacles concrets, mesurés avant d'écrire l'écran :

1. **Rattacher coûte cher.** `matchOrgInIndex` balaye tout le référentiel :
   **3,59 ms par indice** sur 4 462 organisations, soit **1,8 s pour 500 faits**
   et une projection de 7 s pour une file de 2 000. Inutilisable à l'ouverture
   d'un écran.
2. **Rien ne priorise.** La route rendait les faits par date d'arrivée. Un
   analyste ouvre, voit 50 domaines étrangers, et referme.
3. **Aucune trace de décision.** Le schéma n'a pas de table d'audit. Rejeter un
   fait ne disait ni qui, ni quand, ni pourquoi — et aucune annulation n'était
   possible.

## Ce qui a été construit

### 1. Un préfiltre, sans toucher au scoring — `quarantine/candidates.ts`

Le moteur de rattachement est celui qui existe ; on ne le réécrit pas pour aller
plus vite. On réduit seulement **ce qu'on lui donne** : un index de jetons
témoins (jeton de nom le plus rare, jetons de nom hors ville, étiquettes de
domaine hors TLD) construit une fois, puis interrogé par indice.

La propriété exigée est forte : le sous-ensemble doit être un **sur-ensemble
garanti** des correspondances possibles. Si l'indice ne fournit aucun jeton
exploitable, on rend l'index complet — jamais un sous-ensemble arbitraire.

| Mesure (4 462 organisations, 500 indices réels) | Valeur |
| --- | --- |
| Balayage complet | 1 795,6 ms (3,59 ms/indice) |
| Préfiltré | **7,5 ms** (0,02 ms/indice) |
| Gain | **×239** |
| Organisations examinées en moyenne | **8,6 sur 4 462** |

Vérifié par **test différentiel** (`test/quarantine-candidates.test.ts`, 6 cas) :
500 revendications réelles, jeu d'or de rattachement (75 cas), indices constrits
pour chaque chemin du moteur (domaine, suffixe, nom court, ville + nom, chaîne
vide).

**Un piège mérite d'être dit.** Sur le référentiel NA, les 500 revendications ne
rattachent **rien** : « résultat identique » y est trivialement vrai (0 = 0). Un
test qui s'arrête là ne prouve rien. Un sixième cas injecte donc des
organisations dérivées des revendications elles-mêmes et exige que le préfiltre
préserve **des rattachements positifs** (≥ 20), puis les supprime.

### 2. Un triage explicable — `quarantine/triage.ts`

Fonction pure, sans base, qui rend un score 0–100, un seau et une suggestion —
**avec la liste des règles appliquées et leur poids**. Le panneau de droite de
l'écran affiche cette trace : un classement qu'on ne peut pas contester n'est pas
un classement.

Signaux principaux : rattachement fort (+45) ou plausible (+24), moteurs
concordants (+12) ou en désaccord (−15), pays déclaré France (+25) ou hors France
(−35), indice réduit à un domaine (−5), description exploitable (±8), ancienneté
de publication (−6 au-delà d'un an).

**Deux corrections venues du corpus réel**, pas de l'intuition :

- **La fraîcheur est l'arrivée dans la file, pas la publication.** En pénalisant
  l'âge publié, les 500 revendications historiques tombaient toutes à « froid »,
  score 2 : la file ne triait plus rien. `receivedAt` porte désormais la fraîcheur
  (≤ 7 j : +12, ≤ 30 j : +6, > 180 j : −10) ; l'âge publié n'est qu'un malus.
- **`referentialGap` (+25) : un indice français sans correspondance est un trou
  du référentiel, pas du bruit.** C'est le signal le plus utile du corpus testé,
  et l'écran le dit explicitement : « envisagez d'ajouter l'entité plutôt que de
  rejeter ».

Seaux : **chaud ≥ 60**, **tiède ≥ 20**, froid en dessous. Tri : score décroissant,
puis date, puis identifiant. 13 tests.

### 3. Des décisions journalisées — `quarantine/review.ts`

`reviewQueue` : fenêtre bornée (**2 000** faits, `RADAR_REVIEW_WINDOW`, max
10 000), filtres source / groupe / recherche / seau / statut, facettes,
compteurs, drapeau `truncated` et temps de calcul. Au-delà de la fenêtre, l'écran
affiche un bandeau : « filtrez pour atteindre le reste du stock ». Pas de
pagination silencieusement fausse.

`applyReview` : `promote` réutilise **`promoteOne`** (même chemin que la promotion
existante, alertes comprises, saute les faits déjà promus) ; `reject`, `review` et
`undo` passent en transaction.

**Pas de migration** (contrainte du chantier) : le journal vit dans
`extracted->_review`, tableau d'entrées `{at, by, action, reason}`. Il est
**retiré du champ `extracted` renvoyé** et exposé par un champ `review` dédié —
vérifié en base et en HTTP. L'ancienne route `GET /quarantine` expose aussi
`review`, sans fuite de `_review`.

Garde-fous :
- **motif obligatoire pour un rejet** (refusé par l'API : 400) ;
- 1 à 500 identifiants par décision, entiers uniquement ;
- **`undo` ne dé-promeut jamais** : borné à `promoted = false` et statut
  `rejected | reviewed`. Une promotion ne se défait pas depuis la file ;
- toute route exige un jeton (401 sans).

7 tests en base : ordre, filtres, pagination, rejet groupé, annulation, promotion
avec rejeu sans doublon, journal, sélection vide.

### 4. L'écran — `apps/web/src/components/ReviewView.tsx`

Nouvelle entrée **« Revue »** dans le rail. Le dashboard ne change pas : carte,
fil, inspecteur et alertes en direct restent ce qu'ils sont.

Deux colonnes : la file à gauche, la décision à droite. **Clavier d'abord** :
`J`/`K` ou flèches pour parcourir, `X` cocher, `Maj+A` tout cocher, `P` promouvoir,
`R` rejeter (saisie du motif), `M` marquer revu, `U` annuler, `Échap`
désélectionner. Une décision porte sur la sélection si elle existe, sinon sur le
fait courant. Bandeau de résultat avec annulation immédiate pour un rejet ou un
marquage.

La logique clavier est **sortie du composant** (`review-keys.ts`, fonction pure) :
18 contrôles vérifient les bornes, la priorité de la sélection, l'absence de
décision pendant la saisie d'un motif, la file vide. Le composant est en plus
monté dans **jsdom** (`test/review-dom.tsx`, 26 contrôles) : on tape réellement les
touches et on vérifie **ce qui part vers l'API** — identifiants, action, motif,
annulation — plus les cas lecture seule, 401 et hors ligne.

## Jeu de données versionné

`bench/fixtures/claims-sample.json` — **44 Ko, 500 revendications réelles**, 55
groupes, fenêtre 2024-06-01 → 2025-06-17, 213 cas prioritaires (titres structurés
avec pays déclaré), 27 mentions France. Source : `joshhighet/ransomwatch`
(**Unlicense**), revendications **non vérifiées** de groupes rançonneurs. Aucun
corps brut, aucune donnée personnelle : titre, groupe, date.

- Construction : `python3 bench/quarantine/build_fixture.py`
- Chargement : `tsx scripts/load-claims-sample.mts` (TLP **RED**, `raw_body` NULL,
  `ON CONFLICT DO NOTHING`). Le script **refuse** de mélanger son jeu à une
  quarantaine existante sans `--force`, et sait le retirer (`--purge`).

## Mesures d'ouverture de la file

| Stock | Fenêtre | p50 | p95 | Seaux |
| --- | --- | --- | --- | --- |
| 500 (jeu réel) | 500 | **252 ms** | 333 ms | froid 474 · tiède 26 |
| 5 500 (+5 000 synthétiques) | 2 000 (tronqué) | **296 ms** | 402 ms | froid 1 880 · tiède 120 |

Le coût suit la **fenêtre**, pas le stock : c'est le but. Les 5 000 faits
synthétiques sont supprimés après mesure.

Reproduction :

```bash
DATABASE_URL=... apps/api/node_modules/.bin/tsx bench/quarantine/probe.mts \
  --scale 5000 --json bench/results/NA-review.json
```

## Ce que ce chantier révèle, et qui n'est pas résolu

**Aucun « chaud » sur le corpus réel.** Meilleur score : **43**, sur
`adveo.com`, `lumioplan.com`, `demos.fr`, `millimages.com` — tous marqués
`referentialGap`. Autrement dit : **les 4 462 organisations du référentiel NA
(communes, EPCI, départements, région) ne couvrent pas les entreprises visées par
ces revendications.** Ce n'est pas un défaut du tri, c'est un trou de périmètre.

C'est exactement la question du chantier 1 restée ouverte — quelles entreprises
ajoutera-t-on au référentiel ? — mais désormais elle est **outillée** : la file
remonte les candidats à l'ajout en tête, avec le motif.

Limites assumées :
- le tri est **une heuristique lisible**, pas un modèle appris ; aucun taux de
  faux positifs n'est mesuré, faute de corpus témoin annoté (**chantier 5**) ;
- le corpus est **historique** (2024–2025) : il exercise la file, il ne prouve pas
  la couverture actuelle ;
- pas de table d'audit : le journal dans `extracted` tient pour une personne, mais
  une vraie piste d'audit (index par auteur, par date) demanderait une migration ;
- la file ne propose pas encore l'ajout d'une organisation au référentiel depuis
  un `referentialGap` : le geste reste manuel.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `apps/api/src/quarantine/candidates.ts` | préfiltre de candidats (scoring inchangé) |
| `apps/api/src/quarantine/triage.ts` | score, seau, suggestion, trace |
| `apps/api/src/quarantine/review.ts` | file et décisions journalisées |
| `apps/api/src/routes/quarantine.ts` | `GET /quarantine/queue`, `POST /quarantine/review` |
| `apps/web/src/components/ReviewView.tsx` | écran de triage |
| `apps/web/src/review-keys.ts` | intentions clavier (pur, testé) |
| `apps/web/test/review-dom.tsx` | interactions réelles (jsdom) |
| `bench/quarantine/build_fixture.py` | construction du jeu versionné |
| `bench/quarantine/probe.mts` | mesures moteur + file |
| `scripts/load-claims-sample.mts` | chargement / purge du jeu |
