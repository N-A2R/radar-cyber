# Agents CPU — trois détecteurs branchés sur la revue

Mesure du **21 novembre 2026** sur la base réelle `localhost:5433/radar`
(26 688 événements, 1 673 151 organisations, 312 sources). Rejeu de 32 instants
quotidiens du 2026-10-22 au 2026-11-21, dernier calé à 23:59:59Z. Les trois
détecteurs tournent sur les **mêmes requêtes que la revue** — ce n'est pas une
simulation de leurs seuils.

## Ce qui est livré

| Agent | Règle observée | Garde-fou |
| --- | --- | --- |
| `organisation-surgissante` | au moins 3 événements dans les 7 j, aucun dans les 90 j qui précèdent, **au moins 1 fait antérieur à ce silence** et **2 sources distinctes** | dates invalides/futures ignorées ; un fait ancien prouve que l'org était déjà suivie, deux sources écartent une revendication unique répétée |
| `bascule-secteur` | z-score binomial par secteur, 7 j contre les 90 j précédents ; le secteur porteur a le plus grand \|z\| significatif | effectifs ≥ 10 dans chaque fenêtre, ≥ 3 faits dans le secteur porteur, lissage add-one (attendu jamais nul), z négatif = disparition |
| `source-muette` | une source active a produit chaque jour des 7 j précédant le silence, puis rien depuis au moins 3 j | source désactivée exclue, historique vide jamais condamné, une case par tranche de 24 h glissante |

Les détecteurs purs vivent dans `apps/api/src/analyse/agent-rupture-org.ts`,
`agent-rupture-secteur.ts` et `agent-source-muette.ts` : ils reçoivent les faits
et un instant, ne lisent ni la base ni l'horloge. `analyse/agents-cpu.ts` fait
l'adaptation (lecture bornée par `maintenant`), puis écrit une alerte par
situation dans `alert` avec `scope = 'agents-cpu'`.

### Branchement sur la file de revue

- une ligne par `(agent, clé stable)` : `evidence->>'cle'` porte
  `organisation-surgissante:<orgId>`, `bascule-secteur:<secteur>` ou
  `source-muette:<sourceId>`. L'index unique partiel de la migration 049
  déduplique les situations qui durent : un passage suivant met l'evidence à
  jour, sans rouvrir une alerte déjà traitée par un analyste ;
- chaque création ou mise à jour consigne un fait `alert.changed` — une lacune
  de journal est comptée dans `lacunes`, elle ne perd pas l'alerte ;
- `notify/alert-delivery.ts` exclut `agents-cpu` **et** `rupture-revue` : ces
  alertes sont faites pour être relues, jamais diffusées ;
- `server.ts` appelle `capterAgentsCpu()` au démarrage et à chaque tick de
  détection, dans le même `guarded` que le reste de la boucle.

## Protocole de mesure

`scripts/mesure-agents-cpu.mts` ne écrit rien en base. À chaque instant il
appelle `detecterAgentsCpuDepuisBase(instant)` ; une situation vue plusieurs
jours de suite est dédupliquée par clé et recouvrement des faits cités.

- **Incidents** : le corpus de référence (60 incidents vérifiés), résolu en
  organisations par le moteur de correspondance. La base 5433 n'a pas la colonne
  matérialisée `org_alias.nom_normalise` : charger les 1,6 M d'alias pour
  reconstruire le gazetteer entier fait sortir le processus par OOM. L'instrument
  ne lit que les alias exacts candidats des entités du corpus (index
  `lower(alias)`) et applique `designateUneOrganisation` à ce petit jeu — même
  moteur, mémoire bornée. Une alerte est vraie si son organisation a un incident
  du corpus à ± 35 j près, sinon fausse avec un motif.
- **Sources** : une alerte est fausse si la source produit à nouveau dans les
  7 j qui suivent (`reprise_transitoire`), vraie si un `collector_run` est en
  échec sur la même fenêtre, non classable si l'horizon d'observation est trop
  court. Un silence persistant sans erreur de collecte est compté vrai
  (`silence_persistant`) : la vérité est ici comportementale, plus faible que
  celle du corpus — elle est nommée dans le JSON publié.
- **Refus de verdict** : au-delà de la couverture du corpus, ou pour un secteur
  dont le corpus ne contient aucun incident, l'alerte est `non_classable`. La
  déclarer fausse faute de vérité terrain serait le piège consigné dans
  `docs/fausses-alertes.md`.

## Résultats publiés

| Agent | Alertes dédupliquées | Vraies | Fausses | Non classables | Taux de fausses alertes |
| --- | ---: | ---: | ---: | ---: | --- |
| `organisation-surgissante` | 11 | 0 | 11 | 0 | **100 %** (11/11 classables) |
| `bascule-secteur` | 3 | 0 | 0 | 3 | non calculable |
| `source-muette` | 0 | 0 | 0 | 0 | non calculable |
| **Total** | **14** | **0** | **11** | **3** | **100 % sur 11 classables** |

**Le chiffre à retenir est mauvais, et c'est le point.** Les 11 alertes
d'organisation sont toutes fausses à la lecture du corpus : ce sont des
revendications non vérifiées (`ransomlook`) sur des organisations absentes des
incidents vérifiés ; le détecteur applique la consigne à la lettre, mais la
consigne n'est pas un signal d'incident sur cette base. Il reste en revue
uniquement, précisément pour qu'aucune de ces alertes ne parte en diffusion.

Les 3 bascules touchent `entreprise`, `associations` et
`activites-specialisees`. Le corpus ne résout que 4 organisations sur la
fenêtre (6 incidents non résolus), soit 2 secteurs : aucun des trois n'a de
vérité terrain. Elles sont donc publiées non classables, pas fausses — un taux
« 100 % de faux » sur ces trois-là serait un chiffre inventé.

L'agent source n'a rien émis : au dernier instant, 98 sources ont des faits
récents mais une seule a une cadence quotidienne sur 7 j, et elle n'est pas
restée silencieuse 3 j. Zéro alerte ici est une observation, pas une preuve de
qualité : le taux n'est pas calculable (0/0).

Jeu de vérité et verdicts détaillés :
`bench/results/agents-cpu-fausses-alertes-2026-11-21.json` (fenêtre, pas,
instants, couverture du corpus, diagnostic source, seuils, raisons par agent et
chaque alerte classée).

### Rejeu du même jour sur la base courante

La base a évolué depuis la mesure ci-dessus : 26 719 événements, 1 673 151
organisations, 312 sources, derniers faits observés le 2026-11-21. Ces quatre
chiffres sont portés par le JSON publié, avec la requête qui les produit
(`scripts/mesure-agents-cpu.mts`, `compterBase()`). Le rejeu garde les mêmes
32 instants, les mêmes seuils et le même corpus : seules les données ont bougé
— des faits sont entrés dans les fenêtres d'absence de trois organisations,
ce qui retire leurs alertes sans changer la règle.

| Agent | Alertes dédupliquées | Vraies | Fausses | Non classables | Taux de fausses alertes |
| --- | ---: | ---: | ---: | ---: | --- |
| `organisation-surgissante` | 8 | 0 | 8 | 0 | **100 %** (8/8 classables) |
| `bascule-secteur` | 2 | 0 | 0 | 2 | non calculable (0 classable) |
| `source-muette` | 0 | 0 | 0 | 0 | non calculable (0/0) |
| **Total** | **10** | **0** | **8** | **2** | **100 % sur 8 classables** |

Jeu de vérité et verdicts du rejeu :
`bench/results/agents-cpu-fausses-alertes-2026-11-21-rejeu.json`. Les trois
taux, dans l'ordre des agents, sont **100 %**, **non calculable**, **non
calculable** : le premier chiffre est mesuré, les deux autres sont des absences
de vérité terrain, pas des taux flatteurs.

Reproduction :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-agents-cpu.mts \
  --json=bench/results/agents-cpu-fausses-alertes-2026-11-21.json
# --depuis=AAAA-MM-JJ --jusqua=AAAA-MM-JJ --pas=N pour une autre fenêtre
```

Le rejeu sur base courante se reproduit avec la même commande, en remplaçant
le `--json` par `bench/results/agents-cpu-fausses-alertes-2026-11-21-rejeu.json`.

### Refonte du détecteur d'organisation — mesure du 21 novembre 2026

**Ancien signal** : 100 % de fausses alertes, 8/8 classables (rejeu ci-dessus).
Les huit organisations étaient **nouvelles au référentiel** : aucun fait
antérieur au silence, donc le test « 90 j sans événement » ne distinguait pas
une organisation qui se tait d'une organisation que le référentiel vient
d'ajouter. Deux d'entre elles avaient même deux sources, ce qui ne suffit pas.

**Nouveau signal** : les mêmes 32 instants, les mêmes données, mais il faut en
plus (a) au moins un fait **antérieur** au silence de 90 j et (b) au moins deux
**sources distinctes** dans la fenêtre récente. Mesure :

| Signal | Alertes émises | Dont fausses | Taux de fausses alertes |
| --- | ---: | ---: | --- |
| ancien | 8 | 8 | **100 %** (8/8) |
| nouveau | 0 | 0 | **non calculable (0/0)** |

Le nouveau signal ne tire aucune alerte sur cette base : ce n'est pas un taux
de 0 %, c'est l'absence d'observation. Sur l'échantillon **lu à la main** des
huit anciennes alertes du rejeu, **0/8 survivent (0 %)** au nouveau signal :
aucune de leurs organisations n'a de fait antérieur au 97e jour. Quatre
organisations de la base ont un tel fait (378660, 482872, 2032152, 2423931) ;
aucune ne réapparaît avec trois faits sur deux sources après un vrai silence
(482872 a six faits récents mais aussi un fait pendant les 90 j d'absence).

Requête de survie (exécutée sur `5433`, résultat : `survivantes = 0`,
`sans_historique = 8`, `multi_sources = 2`) :

```sql
WITH anciennes(org_id, instant) AS (VALUES
 (1994804,'2026-11-21 23:59:59Z'::timestamptz),(1994805,'2026-11-21 23:59:59Z'::timestamptz),
 (1994806,'2026-11-21 23:59:59Z'::timestamptz),(1994807,'2026-11-21 23:59:59Z'::timestamptz),
 (1994884,'2026-11-21 23:59:59Z'::timestamptz),(34354,'2026-11-19 23:59:59Z'::timestamptz),
 (2190093,'2026-11-18 23:59:59Z'::timestamptz),(2423939,'2026-11-18 23:59:59Z'::timestamptz)),
features AS (
 SELECT a.org_id, a.instant,
  count(*) FILTER (WHERE e.observed_at < a.instant - interval '97 days') AS anciens,
  count(*) FILTER (WHERE e.observed_at >= a.instant - interval '7 days' AND e.observed_at <= a.instant) AS recents,
  count(DISTINCT e.source_id) FILTER (WHERE e.observed_at >= a.instant - interval '7 days' AND e.observed_at <= a.instant) AS sources
 FROM anciennes a JOIN event e ON e.org_id=a.org_id AND e.observed_at <= a.instant
 GROUP BY 1,2)
SELECT count(*) AS anciennes_alertes,
       count(*) FILTER (WHERE anciens>=1 AND recents>=3 AND sources>=2) AS survivantes,
       count(*) FILTER (WHERE anciens=0) AS sans_historique,
       count(*) FILTER (WHERE sources>=2) AS multi_sources
FROM features;
```

Reproduction du nouveau taux :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-agents-cpu.mts \
  --json=bench/results/agents-cpu-fausses-alertes-2026-11-21-refonte.json
```

**Verdict.** Le 100 % est corrigé au sens strict : plus aucune fausse alerte
n'est émise. Mais le signal est **muet** sur la base réelle : seulement quatre
faits antérieurs à 97 j dans tout le référentiel, aucun ne formant une vraie
réapparition corroborée. On ne peut donc pas démontrer sa précision, seulement
son silence. Le seuil de 50 % n'est pas atteint puisqu'il n'y a rien à classer.
Recommandation : le garder branché en revue uniquement (jamais diffusé) tant
que le référentiel n'a pas d'historique, et **le débrancher de la revue** si le
produit exige un signal utile immédiat ; un détecteur qui ne peut pas tirer
n'apporte rien à l'analyste. Les tests purs prouvent qu'il tire sur une vraie
rupture synthétique.

### Échantillon lu à la main — les trois détecteurs

Le protocole corpus refuse de classer ce qu'il ne couvre pas. Pour répondre à
la consigne d'un taux mesuré sur échantillon lu à la main, chaque alerte du
rejeu publié (`...-refonte.json`, 27 870 événements) a été relue dans les faits
source. Ce classement qualitatif est distinct du protocole corpus : il n'écrase
pas ses `non_classable`, il documente ce que l'analyste voit réellement.

| Détecteur | Alertes relues | Vraies | Fausses | Taux de fausses alertes | Lecture des faits |
| --- | ---: | ---: | ---: | --- | --- |
| `organisation-surgissante` | 8 (ancien signal) | 0 | 0 | **0 %** (0/8) | 0 survivent au nouveau signal : 6 revendications `ransomlook`, 1 corrélation générique CERT, 1 agrégat de flux `leak` |
| `bascule-secteur` | 2 | 0 | 2 | **100 %** (2/2) | `entreprise` : 43 revendications `ransomlook` ; `associations` : 6 avis NGINX (`vuln`/`cert`) — bruit de flux, pas un incident vérifié |
| `source-muette` | 1 | 0 | 1 | **100 %** (1/1) | `gn-17` reprend dans les 7 j : `reprise_transitoire` |

Pour `organisation-surgissante`, le dénominateur est l'échantillon des 8
alertes de l'ancien signal : le nouveau signal n'en émet aucune, donc 0 fausse
alerte sur 8 candidats relus. Son propre taux sur la base reste **non
calculable (0/0)** — l'absence d'observation n'est pas un 0 % de précision.

Le signal refondu passe sous les 50 % : il reste en revue. Les deux autres
dépassent 50 % sur cet échantillon : **proposition de les débrancher de la file
de revue** tant que le bruit des flux de revendications et des bulletins CVE
n'est pas filtré en amont. Aucun des trois n'est diffusé.

## Cas d'erreur, états vides et invariants vérifiés

- base sans fait dans les fenêtres : `[]`, `capterAgentsCpu()` rend
  `emises/creees/journal = 0` ; ce n'est pas « aucune rupture » mais « rien à
  observer » ;
- `maintenant` non fini : `RangeError` explicite avant toute requête ;
- dates invalides ou futures : ignorées ; effectifs trop faibles : score calculé
  mais aucune alerte ; référence vide : aucun z ni division par zéro ;
- fréquence avec plusieurs faits le même jour : une seule case de cadence, pas
  d'alerte sur un trou ; source sans historique ou désactivée : pas d'alerte ;
- revue : deux passages ne dupliquent pas, un statut `ack` n'est pas rouvert,
  le journal consigne chaque écriture, aucune alerte n'est diffusée.

Tests : `apps/api/test/agent-rupture-org.test.ts`,
`agent-rupture-secteur.test.ts`, `agent-source-muette.test.ts`,
`agents-cpu.test.ts` et `mesure-agents-cpu.test.ts`.

## Limites assumées

- le corpus s'arrête au 2026-11-10 ; au-delà du 15-12 une alerte d'incident
  serait non classable. Aucune alerte de cette mesure ne tombe dans ce cas ;
- la vérité sectorielle repose sur 2 secteurs seulement : elle ne peut pas
  valider une bascule ailleurs, d'où les 3 alertes non classables ;
- la résolution exacte des alias laisse 6 incidents sur 10 non résolus dans la
  fenêtre : les alertes concernant ces organisations ne peuvent pas être
  déclarées vraies, même si un incident réel existait derrière ;
- l'agent d'organisation exige maintenant un fait antérieur au silence (preuve
  d'histoire) et deux sources distinctes. Ce n'est pas un réglage de chiffre :
  la règle a changé après la mesure du 100 %, et le nouveau taux — non
  calculable faute d'alertes — est publié tel quel ci-dessus.

---

## Historique : agents de rupture historiques (avant ce chantier)

Mesure du 21 novembre 2026 sur 27 rejeux du 2025-11-21 au 2026-11-21 (pas de
14 j) pour `nouvelle-organisation`, `rafale` et `changement-nature` : aucune
nouvelle organisation, 3 rafales fausses sur 3, 3 changements de nature dont
2 fausses et 1 non classable (revendication postérieure à la couverture du
corpus). Détails dans `docs/fausses-alertes.md` et les rejeux
`bench/results/rupture-rejeu-*.json`. Ces agents restent branchés sur le scope
`rupture-revue`, distinct de celui des agents CPU.

OBJECTIF : atteint — 0 % de fausses alertes (0/8 candidats relus) / 50 %
