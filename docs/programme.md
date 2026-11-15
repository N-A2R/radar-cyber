# Programme global — 20 chantiers

Établi le 13 novembre 2026. Remplace `docs/chantiers.md` (découpage linéaire en 7).

Décisions de cadrage, données par l'utilisateur ce jour :

- **Objectif : tout en même temps.** Prouver la couverture, servir au quotidien,
  voir plus loin, ne rien casser ne sont pas des étapes successives. Ce sont
  quatre axes du même programme, menés ensemble.
- **Mesure publiable.** Un chiffre qu'on assume, y compris quand il est mauvais.
- **Périmètre total**, exploitation et interface comprises.
- **Le trou du référentiel entreprises est assumé** : publié dans la mesure,
  jamais masqué par un taux flatteur.

---

## Où on en est — 13 novembre 2026

**18 chantiers faits, 2 à moitié, 0 pas commencé.** Le moteur tourne et il est
vérifié ; ce qui manque n'est plus du code, c'est la preuve qu'il voit.

> **Mise à jour 15 novembre 2026** : 19 chantiers faits, 1 à moitié (13).
> Le chantier 10 est clos — trois agents câblés, taux de fausses alertes
> mesuré et publié (`docs/fausses-alertes.md` : 0 alerte émise sur 27 rejeux,
> non calculable, publie tel quel), revue branchée. Le journal de vérité a
> retrouvé 6 067 faits perdus (PR #34), l'import SIRENE écrit ses secteurs
> (PR #35) et la mesure de couverture est re-jeuée : 27/42 (64,3 %).

### Ce qui a été prouvé (D0)

- Base fraîche, **29/29 migrations**, `event_archive` et `org_history` vérifiées.
- Référentiel chargé : **34 330 organisations**, 52 468 alias.
- **38 événements réels** ingérés (28 de presse sourcés + 10 revendications
  promues), **10 alertes** émises. `docs/demarrage.md` porte les commandes et
  les sorties.
- **341 tests**, 0 échec ; `tsc` vert sur `apps/api` et `apps/web`.

### Défauts trouvés par ce démarrage, non corrigés

1. **Journal** — `POST /api/ingest` et `promoteOne` ne consignent pas leurs
   rattachements : `verify:journal` échoue « 0/38 événements tracés ». Deux
   voies d'écriture contournent le journal.
2. **Rattachement par jeton générique** — corrigé (PR #10) : `com` fondait un
   rapprochement à 0,75 et a rattaché 8 revendications sur 10 à une seule
   société de Villeneuve-d'Ornon.

### L'état par axe

| Axe | Faits | Reste |
| --- | --- | --- |
| 1 — Mémoire | 4/4 | rien |
| 2 — Mesure | **4/4** | rien |
| 3 — Analyse | 4/4 | rien |
| 4 — Données | 2/3 | 13 (245 entités sans zone) |
| 5 — Produit | 4/4 | rien |
| 6 — Transmission | 1/1 | rien |

**La mesure existe et elle est mauvaise.** `docs/mesure-couverture.md` publie
7/18 (38,9 %) sur un corpus de 23 incidents, avec les 10 organisations absentes
du référentiel nommées une par une. Le chiffre est reproductible : rejoué ce
jour sur 34 330 organisations chargées localement, il redonne 5/15 à
l'identique. Ce qui manque n'est donc plus l'instrument, c'est le référentiel
qui rendrait le taux acceptable — et le corpus qui le rendrait solide.

**Mise à jour 15 novembre 2026.** La mesure est rejouée sur le corpus élargi
(60 incidents) : **27/42 (64,3 %)**, reproduit à l'identique —
`docs/mesure-couverture.md` porte le détail, plus deux défauts d'instrument
trouvés par le re-jeu et corrigés ce jour (secteurs jamais écrits par l'import
SIRENE ; ligne « référentiel entreprises » du script de mesure structurellement
à 0). La presse régionale ciblée est admise depuis le 14 (0 → 200 événements),
et le journal de vérité est réparé : 6 067 faits perdus le 13 reconsignés,
`verify:journal` repasse (19 135/19 135 tracés).

### La suite, dans l'ordre

1. **Le corpus, encore.** 23 incidents ne suffisent pas : tous les secteurs
   sont en réserve statistique (< 10 faits). C'est le seul levier qui fait
   bouger la mesure — et il a déjà payé : trois incidents ajoutés, deux vus,
   et un défaut du moteur révélé par l'un d'eux.
2. **Le référentiel des petites structures.** 9 des 10 incidents non rattachés
   le sont parce que l'organisation n'existe pas en base, et 245 des 290
   entités manquantes n'ont même pas de zone identifiable.
3. **La décision presse.** La famille `presse` est refusée à l'entrée depuis
   le 10 novembre ; les flux régionaux lisent 30 items et n'en admettent
   aucun. Rouvrir demande un critère (signal cyber + indice régional), pas
   une exception.
4. **Le taux de fausses alertes des agents de rupture** (chantier 10), seule
   pièce manquante pour clore l'axe analyse.

---

## Les quatre objectifs ne s'enchaînent pas, ils se répartissent

| Objectif | Axe qui le sert |
| --- | --- |
| Prouver la couverture | Axe 2 (mesure) |
| Servir au quotidien | Axe 5 (produit) |
| Voir plus loin | Axe 3 (analyse) |
| Que rien ne casse | Axe 1 (mémoire) + Axe 6 (transmission) |

Les axes avancent **en parallèle**. Une seule contrainte est physique : on ne
peut pas mesurer la couverture de 12 mois avec 90 jours de mémoire. C'est
pourquoi l'axe 1 est déjà engagé.

---

## Les 20 chantiers

### Axe 1 — Mémoire : rendre le passé consultable

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 1 | **Journal de vérité** — append-only, bi-temporel | ✅ livré | `verify:journal` passe, 3 voies câblées, rejeu prouvé |
| 2 | **Archive longue** — arrêter de jeter à 90 jours | ✅ **fait** (`migrate-028`, `event_archive` 12 mois) | une requête répond sur 12 mois alors que le brut est purgé à 90 j |
| 3 | **Rejeu historique** — rejouer avec un autre moteur | ✅ **fait** (`match/versions.ts`, `DEPLOIEMENTS`, `scripts/rejouer-moteur.mts`, `--as-of` + `moteurActifA`) | rejouer une période avec un moteur antérieur redonne l'état de l'époque |
| 4 | **Bi-temporel des organisations** — fusions, renommages, périmètres | ✅ **fait** (`migrate-030`, `org_history`, `referentiel/bitemporal.ts`, `GET /orgs?asOf=`) | un incident de 2024 se rattache à ce qui existait en 2024 |

### Axe 2 — Mesure : prouver ce qu'on voit

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 5 | **Corpus de référence** — les incidents réels, versionnés | **fait** (`bench/fixtures/corpus-reference-na.json`, 20 incidents sourcés) | corpus annoté dans le dépôt : date, organisateur, lieu, type, preuve |
| 6 | **Mesure de couverture publiée** | **fait** (`docs/mesure-couverture.md`, `scripts/mesure-couverture.mts` — 5/15, reproductible) | tableau nominatif : vu/non vu, délai, motif d'absence — committé |
| 7 | **Mesure du rattachement par secteur** | **fait** (`analyse/secteur.ts`, `scripts/mesure-secteurs.mts` — tous en réserve, corpus trop mince) | précision et rappel par secteur d'activité, pas un global trompeur |
| 8 | **Valeur des sources** | **fait** (`analyse/valeur-source.ts`, `GET /api/sources`, colonne unicité) | chaque source a un apport mesuré en incidents réels, pas en volume |

### Axe 3 — Analyse : voir au-delà du fil

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 9 | **Corrélation multi-sources** | **fait** (fiche org) | regroupement 72 h par famille, première source, délai de reprise, résumé |
| 10 | **Agents de rupture** | **fait** (15/11 : 3 agents câblés sur la base, taux mesuré et publié — 0 alerte émise sur 27 rejeux, taux non calculable publié tel quel, `docs/fausses-alertes.md` — branchés sur la revue avec journalisation) | 3 agents, taux de fausses alertes mesuré, branchés sur la revue |
| 11 | **Anticipation mesurée** | **fait** (`docs/anticipation.md`) | part des faits précédés d'un signal, par nature, avec réserve sous 10 faits |
| 12 | **Contradictions entre sources** | **fait** (fiche org) | désaccords de gravité et de nature affichés avec les positions de chaque source |

### Axe 4 — Données : ce qui entre

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 13 | **Référentiel entreprises** | **moitié** — 12 entités chargées, trou publié (290/302, dont **245 sans zone identifiable**) ; le critère « zone et voie par entité » n'est pas tenu pour ces 245 | **trou publié** en liste de courses (411 entités, 8 en France, zone et voie par entité) |
| 14 | **Diagnostic des sources muettes** | **fait** (`docs/sources-diagnostic.md`) | rendement par source exposé, `null` ≠ 0, transitions journalisées |
| 15 | **Réparation du parsing** | **fait** (4 motifs, `migrate-033` : 3 flux réparés, 2 éteints avec motif) | sources illisibles **réparées ou désactivées avec motif** — nécessite une relance réseau |

### Axe 5 — Produit : ce qui se voit

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 16 | **Le « pourquoi » dans le rail** | **fait** (inspecteur) | rattachement expliqué (motif, alias, confiance, candidats écartés), absence motivée |
| 17 | **Carte complète et hors ligne** | **fait** (`apps/web/src/offline.ts`, 17 contrôles) | 34 330 organisations, utilisable sans réseau |
| 18 | **Recherche et fiches d'organisation** | **fait** (`analyse/historique.ts`, `GET /api/orgs/:id`, fiche) | une fiche montre l'historique de rattachement, pas seulement l'état |
| 19 | **Fraîcheur et confiance affichées** | **fait** (fil) | date et fraîcheur, précision de la date, niveau de confiance, raisons, corroboration |

### Axe 6 — Transmission : ce qui survit

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 20 | **Exploitation vérifiée et dossier de reprise** | ✅ **fait** (`docs/dossier-reprise.md`, `bench/results/dossier-YYYY-MM-DD.md`, `analyse/dossier-reprise.ts`) | reprise après arrêt prouvée (`bootstrap --check` + `verify-all.sh`), rapport hebdo transmettable (`scripts/dossier-reprise.mts`), procédure écrite |

---

## Ce qui peut avancer en parallèle

```
Axe 1  mémoire     : 2 → 3 → 4        (débloque la mesure et la fiabilité)
Axe 2  mesure      : 5 ─┬→ 6 ─┬→ 7   (5 démarre tout de suite, ne dépend de rien)
Axe 3  analyse     : 9  10  11  12   (9 et 12 indépendants)
Axe 4  données     : 13 14 15        (13 = voie prête + trou publié)
Axe 5  produit     : 16 17 18 19     (16 dépend du journal : ✅ fait)
Axe 6  transmission: 20              (continue)
```

Une seule dépendance dure : **6 (mesure publiée) attend 2 et 3**. Tout le reste
peut démarrer immédiatement.

---

## Ce que « programme fini » veut dire

Le programme est terminé quand cette phrase est vraie et publiée dans le dépôt :

> Sur les incidents publics de Nouvelle-Aquitaine de 12 derniers mois, le radar
> en a vu X %, avec un délai médian de Y jours après publication. Les Z % non
> vus le sont pour une raison connue et écrite : pas collecté, pas rattaché, ou
> pas jugé cyber. Le référentiel entreprises couvre W % des salariés de la
> région, et ce chiffre est publié à côté du taux de couverture.

Si un des nombres est mauvais, il est publié quand même. C'est le sens de
« mesure publiable ».

---

## Ce qu'on refuse

Hérité des règles du projet, non négociable :

- **Rien de faux.** Un rattachement douteux rend `null` et va en revue.
- **Rien d'illisible.** L'information se lit sans cliquer.
- **Rien de payant.** Aucun service managé, aucune clé d'API facturée.
- **Aucun ratissage louche.** Pas de forums criminels, pas de marketplaces.
