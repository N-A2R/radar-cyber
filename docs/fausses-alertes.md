# Taux de fausses alertes — agents de rupture

Chantier 10 du programme (`docs/programme.md`). La question : quand les trois
agents de rupture tirent, combien de fois n'y a-t-il rien derrière ?

Mesure du **15 novembre 2026**, méthode par rejeu historique : les agents
tournent sur la base à 27 instants répartis tous les 14 jours sur la fenêtre
`2025-11-01 → 2026-10-31` ; une alerte est déclarée vraie si son organisation
est un incident du corpus de référence dont la date publique tombe dans sa
fenêtre de veille (35 j), fausse sinon avec un motif. Le corpus couvre 24
organisations résolues ; 15 incidents du corpus n'ont pas de rattachement et
ne peuvent donc pas servir de vérité terrain.

## Le résultat, sans arrangement

```
Alertes émises sur 27 rejeux : 0
  nouvelle-organisation   0
  rafale                  0
  changement-nature       0

Taux de fausses alertes : non calculable (0 émise — 0/0, publié tel quel)
```

**Aucune alerte n'a été émise.** Le taux de fausses alertes est donc nul par
absence, pas par qualité : les agents ne tirent jamais sur cette base. C'est
publié comme tel — un taux flatteur calculé sur du vide serait exactement le
chiffre que ce projet refuse.

## Pourquoi les agents sont muets, agent par agent

| Agent | Raison structurelle |
| --- | --- |
| `nouvelle-organisation` | `referentielDepuis` est approché par `org.created_at` : le référentiel a été chargé en bloc le 13 novembre 2026. À chaque instant de rejeu, la base est « trop jeune » de six mois — le seuil de 180 j ne peut jamais être franchi. Il faut une vraie date d'entrée au référentiel, pas la date du chargement. |
| `rafale` | La seule combinaison département × famille qui atteint 3 faits en 7 j (ransomware, un département du sud-ouest) a une médiane historique au niveau du pic : pas de *saut*. Le détecteur fait son travail — il refuse une rivière régulière, il cherche une crue. |
| `changement-nature` | Aucune organisation de la base n'a de saut de famille avec +2 crans de gravité sur la fenêtre. Les bulletins de vulnérabilité (18 117 faits `vuln`) restent dans leur famille. |

De plus, les faits qui feraient tirer les agents datent de novembre 2026 —
après la fenêtre close du corpus. Le rejeu de la fenêtre ne les voit pas ;
les voir reviendrait à classer des alertes réelles comme fausses faute de
vérité terrain. La mesure se rejouera avec le corpus élargi (chantier en cours).

## Ce qui a été construit et vérifié à cette occasion

Le chantier a révélé deux défauts de câblage, corrigés :

1. **Le troisième agent n'était pas branché.** `detecterRupturesDepuisBase`
   n'appelait que deux des trois détecteurs ; `changement-nature` existait,
   testé, jamais alimenté par la base.
2. **La rafale était structurellement morte.** La requête des faits récents ne
   sélectionnait pas `zone` : le filtre `f.zone === zone` du détecteur
   comparait `undefined` à un département et aucune rafale n'aurait jamais
   pu partir, quelle que soit la base.
3. **`maintenant` n'atteignait pas le SQL** : les fenêtres se calculaient sur
   `now()` en dur, donc rejouer une date passée regardait la semaine présente.
   Le rejeu historique était impossible — c'est pourtant lui qui mesure.

Le branchement sur la revue est fait et testé : `capterAlertesRupture()`
persiste une ligne par (agent, organisation) dans `alert` (scope `rupture-revue`,
dédupliqué par index unique partiel — migrations 040 et 047), met à jour l'evidence
sans jamais rouvrir une alerte traitée, et consigne un fait `alert.changed`
par écriture. Les agents tournent à la cadence de la détection
(`server.ts`), et `dossier` continue de les exposer en direct.

## Reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm -F @radar/api exec tsx ../../scripts/mesure-fausses-alertes.mts
```

Résultat publié : `bench/results/fausses-alertes-2026-11-15.json`, re-joué le
même jour après les vagues SIRENE
(`bench/results/fausses-alertes-2026-11-15-post-vague2.json`) : sur un
référentiel de **1 244 048 organisations**, les agents restent muets —
**toujours 0 alerte émise sur 27 rejeux**. La conclusion du 15 novembre tient
à l'échelle : le taux de fausses alertes reste non calculable parce que les
agents ne tirent pas, et les raisons structurelles par agent (chargement en
bloc du référentiel, absence de saut de gravité) n'ont pas changé.

## Rejeu du 20 novembre 2026 — fenêtre fraîche post-trou de collecte

Après la reprise de collecte du 20 novembre (incident 2026-11-17, consigné
dans `docs/operations.md`) et le refresh réel d'EPSS, les agents ont été
rejoués sur la fenêtre fraîche `2026-10-21 → 2026-11-20` : 3 instants, calés
en arrière depuis la fin de fenêtre — le dernier voit les faits collectés le
jour même. L'instrument (`scripts/mesure-fausses-alertes.mts`) accepte
désormais `--depuis/--jusqua/--pas` ; au-delà de la couverture du corpus
(qui s'arrête au 10 novembre), une alerte serait classée « non_classable »
plutôt que fausse faute de vérité terrain.

```
Alertes émises sur 3 rejeux : 0
  nouvelle-organisation   0
  rafale                  0
  changement-nature       0
```

Raisons structurelles du 15 novembre, rejouées sur la base courante — les
trois tiennent, confirmées sur données, pas de mémoire :

| Agent | Verdict | Ce que la base dit aujourd'hui |
| --- | --- | --- |
| `nouvelle-organisation` | confirmée | Le référentiel (1 244 048 organisations, vagues SIRENE comprises) a été chargé entre le 13 novembre 21:27 et le 15 novembre 16:35 : âge maximal au référentiel **7 j**, seuil à 180 j. 19 organisations candidates (premier fait dans les 30 j), aucune ne franchit le seuil. |
| `rafale` | confirmée | Une seule combinaison atteint 3 faits en 7 j sur la dernière fenêtre — ransomware, dept 33 : 4 récents contre une médiane historique de 4. La rivière régulière décrite le 15 nov coule toujours : sous le double du seuil, pas de crue. |
| `changement-nature` | confirmée | Aucun candidat : aucun saut de famille avec +2 crans de gravité sur le dernier fait d'une organisation. Les 23 472 faits `vuln` (18 117 au 15 nov) restent dans leur famille. |

Résultat publié : `bench/results/rupture-rejeu-2026-11-20.json` — fenêtre,
instants, vérité terrain du sous-fenêtrage (6 organisations résolues, 3
incidents non résolus) et vérification des raisons dans le JSON. Le taux de
fausses alertes reste non calculable parce que les agents ne tirent pas ; le
mesurer sur la fenêtre fraîche exigerait un corpus qui la couvre (chantier en
cours).

