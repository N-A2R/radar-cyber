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

### La suite, dans l'ordre (mise à jour du 15 novembre)

1. ~~**Le corpus, encore.**~~ **Saturé aux sources web publiques.** Neuf
   requêtes sur deux moteurs le 15 novembre n'ont trouvé aucun incident NA
   nouveau et vérifiable — chaque candidat était déjà au corpus, hors région
   ou pas un incident (journal dans les métadonnées du corpus). Les réserves
   sectorielles reflètent la rareté des publications. L'élargissement exigera
   des sources hors web public.
2. ~~**Le référentiel des petites structures.**~~ **Comblé côté régional** par
   l'import SIRENE hors numérique du 14 (7 436 entreprises, secteurs déduits
   du NAF) : la couverture passe de 35,7 % à 64,3 %. Reste la liste de courses
   (500 entités, 199 en France) qui exige de l'arbitrage humain sur les
   homonymies.
3. ~~**La décision presse.**~~ **Réglée le 14** : famille `presse_cyber` admise
   au contrat (PR #31), presse ciblée par requête (PR #30) — 0 → 200
   événements admis.
4. ~~**Le taux de fausses alertes.**~~ **Mesuré et publié le 15** (chantier 10
   clos) : 0 alerte émise sur 27 rejeux — les agents sont muets sur cette
   base, raison structurelle agent par agent, et la revue est branchée pour
   quand ils tireront.

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
| 5 | **Corpus de référence** — les incidents réels, versionnés | **fait** (15/11 : 60 incidents sourcés, recherche de saturation documentée dans les métadonnées) | corpus annoté dans le dépôt : date, organisateur, lieu, type, preuve |
| 6 | **Mesure de couverture publiée** | **fait** (15/11 : `docs/mesure-couverture.md`, 27/42 = 64,3 %, reproductible, `bench/results/couverture-2026-11-15.json`) | tableau nominatif : vu/non vu, délai, motif d'absence — committé |
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
| 13 | **Référentiel entreprises** | **moitié** (15/11 : trou re-publié à jour — cohorte vivante 500 entités, dont **199 en France** chargeables et **301 sans zone** ; cohorte Exa 302 stable, quasi étrangère ; 3 identités testées dans Sirene, refus documentés pour homonymie — `docs/manques-referentiel.md`) ; le côté régional du trou est comblé par l'import SIRENE du 14 (7 436 entreprises, secteurs déduits du NAF) | **trou publié** en liste de courses (zone et voie par entité) |
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

**La phrase, publiée le 15 novembre 2026** (mesures reproductibles liées) :

> Sur les incidents publics de Nouvelle-Aquitaine de douze derniers mois
> (fenêtre `2025-11-01 → 2026-10-31`), le radar en a vu **27 sur 42 publiés
> (64,3 %)**, avec un délai médian de veille de **1,9 jour** après publication
> (mesuré le 14 novembre sur le flux réel, bulletins CVE exclus). Les **15
> incidents non vus** le sont pour une raison connue et écrite : 0 refusé à
> l'admission, 15 non rattachés — dont 9 organisations absentes du référentiel
> (nommées une par une dans la liste de courses) et 6 présentes mais non
> reconnues par le moteur (refus assumé des alias mono-jeton). La couverture
> du référentiel entreprises **en part des salariés de la région n'est pas
> mesurable aujourd'hui** — aucun effectif n'est en base — ; elle est publiée
> en lignes à la place : 5 788 lignes hors numérique (commerce 3 290,
> construction 1 230, industrie 1 027, agroalimentaire 241) sur 20 495
> entreprises, et 24 entreprises sans NAF à qualifier.
> Sources : `docs/mesure-couverture.md` (27/42, reproduite), `bench/results/couverture-2026-11-15.json`,
> `docs/fausses-alertes.md` (0 alerte émise, publié tel quel),
> `docs/manques-referentiel.md` (500 entités, 199 en France).

Le taux est mauvais et il est publié — c'est le sens de « mesure publiable ».
Ce qui reste ouvert pour que la phrase soit *plus* vraie : qualifier les
entités de la liste de courses (199 en France, arbitrage humain sur les
homonymies), faire tirer les agents de rupture (ils sont muets, cf.
`docs/fausses-alertes.md`), et croître le corpus au-delà des sources web
publiques (saturation documentée dans les métadonnées du corpus).

---

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
