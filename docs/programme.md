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

**11 chantiers faits, 2 à moitié, 7 pas commencés.** Le moteur tourne et il est
vérifié ; ce qui manque n'est plus du code, c'est la preuve qu'il voit.

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
| 2 — Mesure | **0/4** | 5, 6, 7, 8 — tout l'axe |
| 3 — Analyse | 3/4 | 10 |
| 4 — Données | 1/3 | 13 (chargement), 15 (relance réseau) |
| 5 — Produit | 2/4 | 17, 18 |
| 6 — Transmission | 1/1 | rien |

**L'axe 2 est vide.** C'est celui qui donne son sens aux autres : sans le
corpus (5) et la mesure (6), on ne peut pas écrire la phrase de clôture du
programme. Tout le reste est instrumenté mais non mesuré.

### La suite, dans l'ordre

1. **5 — corpus** : les incidents publics de Nouvelle-Aquitaine des 12 derniers
   mois, sourcés et datés. Rien ne le bloque, et tout en dépend ensuite.
2. **6 — mesure** : le tableau nominatif vu / non vu / délai / motif. La
   mécanique existe (`analyse/`), il lui manque le corpus.
3. **13 — chargement** des 302 entités qualifiées, puis **7** : le rappel par
   secteur, qui n'a de sens qu'avec 5, 6 et 13 en place.
4. En parallèle, sans dépendance : **18** (fiches d'organisation), **10**
   (agents de rupture), **17** (carte hors ligne), **15** (relance réseau).

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
| 5 | **Corpus de référence** — les incidents réels, versionnés | à faire | corpus annoté dans le dépôt : date, organisateur, lieu, type, preuve |
| 6 | **Mesure de couverture publiée** | à faire | tableau nominatif : vu/non vu, délai, motif d'absence — committé |
| 7 | **Mesure du rattachement par secteur** | à faire | précision et rappel par secteur d'activité, pas un global trompeur |
| 8 | **Valeur des sources** | à faire | chaque source a un apport mesuré en incidents réels, pas en volume |

### Axe 3 — Analyse : voir au-delà du fil

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 9 | **Corrélation multi-sources** | **fait** (fiche org) | regroupement 72 h par famille, première source, délai de reprise, résumé |
| 10 | **Agents de rupture** | à faire | 3 agents, taux de fausses alertes mesuré, branchés sur la revue |
| 11 | **Anticipation mesurée** | **fait** (`docs/anticipation.md`) | part des faits précédés d'un signal, par nature, avec réserve sous 10 faits |
| 12 | **Contradictions entre sources** | **fait** (fiche org) | désaccords de gravité et de nature affichés avec les positions de chaque source |

### Axe 4 — Données : ce qui entre

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 13 | **Référentiel entreprises** | **voie prête** (`scripts/load-manques-exa.mts`, 302 entités qualifiées) — reste le chargement et le trou résiduel | **trou publié** en liste de courses (411 entités, 8 en France, zone et voie par entité) |
| 14 | **Diagnostic des sources muettes** | **fait** (`docs/sources-diagnostic.md`) | rendement par source exposé, `null` ≠ 0, transitions journalisées |
| 15 | **Réparation du parsing** | **moitié faite** (motif par run, migration 029) | sources illisibles **réparées ou désactivées avec motif** — nécessite une relance réseau |

### Axe 5 — Produit : ce qui se voit

| # | Chantier | État | Critère de sortie |
| --- | --- | --- | --- |
| 16 | **Le « pourquoi » dans le rail** | **fait** (inspecteur) | rattachement expliqué (motif, alias, confiance, candidats écartés), absence motivée |
| 17 | **Carte complète et hors ligne** | à faire | 34 330 organisations, utilisable sans réseau |
| 18 | **Recherche et fiches d'organisation** | à faire | une fiche montre l'historique de rattachement, pas seulement l'état |
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
