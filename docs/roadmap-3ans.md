# Roadmap 3 ans — Radar Cyber (2027 → 2029)

Écrite le 21 novembre 2026, **révisée le même jour après les six décisions
structurantes** (voir « Ce que ça change »). Elle remplace l'horizon court de
`docs/chantiers.md`, qui devient le plan du premier trimestre.

---

## Les six décisions qui commandent tout

| Décision | Choix | Conséquence |
|---|---|---|
| **Modèle** | **Commun numérique** — gratuit, ouvert, financé | Pas de paywall. Il faut un financement, une licence, une gouvernance. |
| **Victimes** | **Nommées** | Il faut un droit de réponse, un délai, et une trace de la décision de publier. |
| **Succès** | **Un chiffre de couverture publié et cité** | Tout doit être reproductible par un tiers. La crédibilité prime sur la fonctionnalité. |
| **Rythme** | **Temps plein** | ~1 600 h/an. La roadmap est calibrée là-dessus, pas sur une équipe. |
| **Géographie** | **Nouvelle-Aquitaine à fond** | 90 % sur une région, pas 40 % sur douze. Pas d'extension nationale avant 2030. |
| **Équipe** | **Solo + agents** | L'orchestration d'agents n'est pas un confort : c'est le modèle d'exécution. |

---

## L'ambition, en une phrase

> **Devenir la référence publique des incidents cyber en Nouvelle-Aquitaine :
> un chiffre de couverture publié, reproductible, cité — et des organisations
> victimes nommées, avec leur droit de réponse.**

Le produit n'est pas une carte ni un flux d'alertes. C'est **une réponse chiffrée
à une question précise** :

> *Sur les 12 derniers mois, parmi les incidents cyber publics qui ont touché des
> organisations de Nouvelle-Aquitaine, quelle part avons-nous vue, quand, et
> pourquoi pas les autres ?*

Tout le reste sert à rendre cette réponse vraie, vérifiable et défendable.

---

## Ce qu'on refuse (les non-objectifs)

1. **Pas de paywall sur la donnée publique.** Un commun numérique ne revend pas
   ce que la presse a déjà publié.
2. **Pas de score d'exposition inventé.** Aucun « indice de risque » sans méthode
   publiée et mesurée.
3. **Pas de source illégale ou extorquée.** Pas de scraping de fuites, pas
   d'achat de données volées, pas de contact avec des groupes criminels.
4. **Pas de contenu généré présenté comme un fait.** Un texte de modèle est
   étiqueté ; il ne remplace jamais une source primaire.
5. **Pas de couverture flatteuse.** Tant que le référentiel a des trous
   sectoriels, on publie le trou, pas le taux.
6. **Pas d'extension géographique avant que la région ne tienne.** La largeur est
   une récompense, pas un point de départ.

---

## La contrainte juridique, puisqu'on nomme les victimes

Nommer une organisation victime est **la** décision qui rend l'observatoire utile
— et **la** qui peut le faire tomber. Elle impose quatre mécanismes, dès 2027 :

1. **Source primaire obligatoire.** Aucune organisation nommée sans un lien
   public vers la source qui l'affirme. Pas de source, pas de nom.
2. **Droit de réponse.** Chaque fiche organisation porte un contact et une
   procédure de rectification ; une réponse publiée est liée à l'incident.
3. **Délai de publication.** Un incident n'est nommé qu'après confirmation par
   une source secondaire, ou 48 h après la première, au choix documenté.
4. **Journal de la décision de publier.** Qui a décidé, quand, sur quelle preuve,
   et pourquoi nommer plutôt qu'anonymiser. C'est le même journal append-only que
   le reste : la décision de publier est un fait daté.

Ce que ça change techniquement : la file de revue gagne un motif de refus
`publication-risquee`, et l'écran d'une organisation affiche toujours sa source
et sa date de dernière vérification.

---

## Le financement (commun numérique, temps plein)

Un commun numérique n'est pas gratuit à produire. Le budget est celui d'une
personne à temps plein, plus une infrastructure marginale.

| Poste | Ordre de grandeur | Financement visé |
|---|---|---|
| Temps de travail | 1 ETP | Subvention Région Nouvelle-Aquitaine / ANCT / BPI « communs numériques » |
| Hébergement | < 100 €/mois | inclus dans la subvention |
| Juridique (relecture) | ponctuel | appui d'un incubateur public |
| Licence et gouvernance | 0 € | open source, gouvernance documentée |

**Règle** : aucune subvention ne peut acheter un droit de regard sur les
chiffres. Si un financeur demande de taire un incident, la réponse est non, et
c'est écrit dans la charte.

---

## An 1 — 2027 : La preuve

**Objectif** : un chiffre de couverture publié, défendable, reproductible.

### T1 2027 — Mémoire et rejeu

- Archivage au lieu de purge à 90 jours ; requête sur 12 mois glissants.
- Bitemporel : `valid_at` (quand le fait était vrai) vs `at` (quand on l'a su).
- Rejeu d'une période : même résultat au moteur près, diff nominatif produit.

**Sortie** : une requête répond sur 12 mois alors que le brut est purgé à 90 jours ;
un rejeu produit la liste nominative des rattachements corrigés.

### T2 2027 — Couverture mesurée

- Corpus témoin de **50 incidents publics NA** (2024-2026), chacun sourcé et daté.
- Moteur de comparaison : vu / non vu, délai en jours, motif d'absence
  (`pas collecté` / `pas rattaché` / `pas jugé cyber`).
- Publication du tableau nominatif et de la méthode.

**Sortie** : le chiffre de couverture est publié, avec sa méthode, ses limites et
sa requête de reproduction.

### T3 2027 — Fermer les trous que la mesure révèle

- Les motifs d'absence deviennent des chantiers, dans l'ordre de leur poids.
- Objectif : **la part « pas rattaché » tombe sous 20 %** des absences.
- Référentiel : mesurer et publier le trou sectoriel ; refuser de publier un taux
  trompeur tant qu'il n'est pas comblé.

**Sortie** : deuxième mesure, avec le delta et son explication.

### T4 2027 — Les premiers agents, avec leur taux d'erreur

- Trois détecteurs : organisation qui surgit, secteur qui bascule, source qui se
  tait.
- Branchés sur la file de revue, **pas** sur la diffusion.
- Taux de fausses alertes mesuré et publié pour chacun.

**Sortie** : trois agents en production, trois taux publiés, aucun envoi
automatique.

### Chiffres à publier fin 2027

| Métrique | Cible |
|---|---|
| Couverture mesurée (12 mois) | **> 60 %** des incidents du corpus |
| Délai médian de détection | **< 48 h** après publication |
| Part « pas rattaché » dans les absences | **< 20 %** |
| Fausses alertes des agents | **< 30 %** par agent |
| Sources productives | **> 200** |
| Organisations reliées sur 7 jours | **> 300** |
| Incidents nommés avec source primaire | **100 %** |

---

## An 2 — 2028 : La profondeur

**Objectif** : passer de 60 % à 90 % **sur la Nouvelle-Aquitaine**, pas s'étendre.

### T1 2028 — Les 12 départements

- Chaque département a ses sources régionales productives (presse locale, radios,
  journaux municipaux, chambres consulaires).
- Mesure de couverture **par département**, publiée séparément.
- Objectif : aucun département sous 50 % de couverture.

**Sortie** : 12 chiffres, 12 corpus locaux, une méthode identique.

### T2 2028 — Tous les secteurs

- Combler le trou du référentiel : agroalimentaire, industrie, construction,
  commerce — les secteurs à zéro ligne aujourd'hui.
- Rattachement par SIREN/SIRET quand la source le permet.
- Objectif : la part « pas rattaché » tombe sous 10 %.

**Sortie** : référentiel couvert, taux publié, trou documenté s'il en reste.

### T3 2028 — Signaux à J-21

- Pour chaque incident du corpus, extraire l'état des données 21 jours avant.
- Chercher ce qui l'aurait annoncé : source qui se tait, secteur qui bascule,
  organisation qui apparaît dans un contexte inhabituel.
- Publier le résultat **même s'il est « rien »**.

**Sortie** : un document qui dit, chiffre en main, combien d'incidents avaient un
signal détectable à J-21.

### T4 2028 — Le service aux collectivités, sans paywall

- Alertes e-mail quotidiennes pour les collectivités qui le demandent, gratuites.
- Tableau de bord par périmètre, export PDF mensuel reproductible.
- Carte hors ligne pour le terrain.

**Sortie** : au moins **5 collectivités** servies gratuitement, avec un taux de
pertinence mesuré par retour utilisateur.

### Chiffres à publier fin 2028

| Métrique | Cible |
|---|---|
| Couverture mesurée (NA) | **> 90 %** |
| Délai médian de détection | **< 24 h** |
| Départements couverts à ≥ 50 % | **12 / 12** |
| Part « pas rattaché » | **< 10 %** |
| Incidents avec signal à J-21 | **mesuré et publié** (même 0 %) |
| Collectivités servies | **≥ 5**, gratuitement |

---

## An 3 — 2029 : La référence

**Objectif** : que le chiffre soit cité, reproduit et défendu par d'autres que
son auteur.

### T1 2029 — Le bilan vérifiable

- Publication d'un **bilan annuel** : incidents vus, délai, sources, corrections,
  erreurs assumées.
- Chaque correction de rattachement est traçable jusqu'à sa preuve.
- Un tiers peut rejouer la mesure et retrouver le même chiffre.

**Sortie** : un auditeur externe reproduit le chiffre sans aide.

### T2 2029 — L'ouverture

- Portail open data : jeux de données datés, versionnés, licence claire (ODbL).
- Méthode publiée intégralement : ce qu'on compte, ce qu'on ne compte pas.
- API publique gratuite pour la recherche et les collectivités.

### T3 2029 — La gouvernance

- Charte publique : financement, indépendance, refus, droit de réponse.
- Comité de relecture (3 personnes : un juriste, un universitaire, un RSSI).
- Le projet survit à son auteur : documentation complète, agents reproductibles.

### T4 2029 — La preuve d'utilité

- Mesure de l'usage réel : qui consulte, pour quoi, avec quel effet déclaré.
- Au moins une étude, un article ou un rapport externe citant les chiffres.

**Sortie** : l'observatoire n'est plus un projet personnel, c'est une source citée.

### Chiffres à publier fin 2029

| Métrique | Cible |
|---|---|
| Couverture mesurée (NA) | **> 95 %** |
| Délai médian de détection | **< 12 h** |
| Reproduction externe du chiffre | **réussie** |
| Citations externes | **≥ 3** |
| Collectivités servies | **≥ 15**, gratuitement |
| Temps de reprise par un tiers | **< 1 semaine** avec la documentation |

---

## La colonne vertébrale technique (les trois ans)

1. **Journal append-only.** Aucune écriture destructive ; tout le reste est une
   projection recalculable. C'est ce qui rend le rejeu, l'audit et le droit de
   réponse possibles.
2. **Mesure avant publication.** Aucun chiffre ne sort sans sa requête.
3. **Une porte unique.** Le CI juge ; un humain ne valide pas du code, il valide
   des chiffres.
4. **Sources primaires citées.** Chaque incident renvoie à sa source, toujours.
5. **Coût marginal.** Hébergement léger, modèles gratuits pour les agents, aucune
   dépendance payante structurelle — condition de survie d'un commun numérique.
6. **Agents orchestrés, pas improvisés.** Un orchestrateur maintient N agents en
   vol, une file jamais vide, une porte CI, un journal des tentatives. C'est ce
   qui rend un projet solo tenable à temps plein.

---

## Ce qui peut tout faire échouer

| Risque | Signal d'alerte | Réponse |
|---|---|---|
| **Le financement ne vient pas** | 6 mois sans subvention | réduire le périmètre, garder la mesure, publier quand même |
| **Le référentiel reste troué** | couverture plafonne à 40 % | publier le trou, chercher une source légale (INSEE, SIRENE) |
| **Les sources régionales se tarissent** | sources productives en baisse 3 mois | diversifier : presse, CTLog, CERT, revendications |
| **Le rattachement ne progresse pas** | « pas rattaché » stable | investir sur le matching, pas sur les écrans |
| **Un incident nommé à tort** | plainte ou rectification | publier la rectification, corriger, garder la trace |
| **Un incident grave manqué** | faux négatif sur un cas réel | publier l'erreur, corriger, documenter le motif |
| **Épuisement solo** | 3 mois sans publication | ralentir, automatiser, documenter pour déléguer |

---

## Ce que cette roadmap ne dit pas

- **Où ça tourne.** Détail tant que le coût reste marginal.
- **Quel modèle exactement pour les agents.** Il évolue tous les six mois ; seul
  le principe compte (file, porte, journal).
- **Quand on s'étend.** Pas avant 2030, et seulement si 95 % est atteint en
  Nouvelle-Aquitaine.
