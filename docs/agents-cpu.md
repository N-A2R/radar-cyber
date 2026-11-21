# Agents CPU — trois détecteurs branchés sur la revue

Mesure du **21 novembre 2026** sur la base réelle `localhost:5433/radar`
(26 688 événements, 1 673 151 organisations, 312 sources). Rejeu de 32 instants
quotidiens du 2026-10-22 au 2026-11-21, dernier calé à 23:59:59Z. Les trois
détecteurs tournent sur les **mêmes requêtes que la revue** — ce n'est pas une
simulation de leurs seuils.

## Ce qui est livré

| Agent | Règle observée | Garde-fou |
| --- | --- | --- |
| `organisation-surgissante` | au moins 3 événements d'une organisation dans les 7 j, aucun dans les 90 j qui précèdent | dates invalides ignorées ; les 90 j d'absence jouxtent la fenêtre récente, ils ne la recouvrent pas |
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
- les seuils n'ont pas été ajustés après mesure : le 100 % de fausses alertes
  de l'agent d'organisation est publié tel quel. Le corriger demanderait une
  exigence de corroboration (sources distinctes, fait confirmé) — un changement
  de règle, pas un réglage de chiffre.

---

## Historique : agents de rupture historiques (avant ce chantier)

Mesure du 21 novembre 2026 sur 27 rejeux du 2025-11-21 au 2026-11-21 (pas de
14 j) pour `nouvelle-organisation`, `rafale` et `changement-nature` : aucune
nouvelle organisation, 3 rafales fausses sur 3, 3 changements de nature dont
2 fausses et 1 non classable (revendication postérieure à la couverture du
corpus). Détails dans `docs/fausses-alertes.md` et les rejeux
`bench/results/rupture-rejeu-*.json`. Ces agents restent branchés sur le scope
`rupture-revue`, distinct de celui des agents CPU.
