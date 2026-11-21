# UNE vague : Précision du rattachement — plusieurs jours, reprise par état

> **Une seule vague, plusieurs sessions.** Ce plan est le backlog complet. Il ne
> se termine pas en une session : chaque session reprend là où la précédente
> s'est arrêtée, en lisant un **fichier d'état commité**. Rien ne se perd, rien
> ne se répète.
>
> Objectif final : **un taux de précision du rattachement prouvé**, qui tient sur
> un échantillon **jamais vu**, avec le protocole écrit et reproductible.

## Le fichier d'état — la pièce maîtresse

`bench/state/wave-precision.json` :

```json
{
  "vague": "precision",
  "demarreeLe": "2026-11-21",
  "etapeCourante": "S1",
  "tacheCourante": "S1.3",
  "taches": { "S1.1": {"statut": "fait", "commit": "abc1234", "le": "2026-11-21T03:20Z"} },
  "journal": ["S1.1 corpus tiré, 500 entrées, graine 20261121"],
  "precisions": { "baseline": null, "apresRegles": null, "echantillonFrais": null }
}
```

**Règle de reprise**, à exécuter au début de CHAQUE session :

1. lire `bench/state/wave-precision.json` ;
2. prendre la première tâche dont le statut n'est pas `fait` ;
3. l'exécuter, la marquer `fait` avec son commit et son horodatage, committer le
   fichier d'état **avec** la tâche ;
4. enchaîner la suivante, jusqu'à la fin de la session.

Si le fichier n'existe pas : le créer et commencer à S1.1. Ne **jamais** repartir
de zéro, ne **jamais** refaire une tâche marquée `fait`.

## Définitions figées (ne changent plus de toute la vague)

| Verdict | Sens |
|---|---|
| **exacte** | l'organisation trouvée est celle que le texte désigne |
| **partielle** | bonne enseigne ou groupe, mauvaise entité (siège/établissement, filiale/maison mère) |
| **hors_sujet** | aucune relation réelle (homonyme, mot générique, TLD) |
| **indécidable** | le texte ne permet pas de trancher, même avec le registre |

**Précision** = `(exacte + partielle/2) / (exacte + partielle + hors_sujet)`.
Les indécidables sortent du dénominateur et se comptent à part.

## Règles de la vague

1. Un verdict sans preuve n'existe pas. Pas de « probablement ».
2. `bench/precision/corpus-v1.json` est **gelé** dès S1.4 : on peut ajouter des
   champs, jamais changer un verdict (un changement se fait dans un fichier
   séparé, daté, motivé).
3. L'**échantillon frais** (autre graine) ne se réutilise jamais deux fois.
4. Une correction qui ne tient pas sur l'échantillon frais est **retirée**.
5. Si la précision baisse, on le publie et on revient en arrière.
6. Aucun chiffre de campagne avant S6 — seulement des mesures d'étape.

---

## S1 — L'appareil de mesure et la vérité terrain

- [ ] **S1.1** `scripts/precision-echantillon.mts` : tirage **stratifié**
      reproductible (graine écrite dans le JSON), 500 rattachements réels.
      Strates : confiance (haute/moyenne/faible) × source × type d'indice
      (domaine, nom, sigle, ville)
- [ ] **S1.2** Vérification d'identité : registre
      (`recherche-entreprises.api.gouv.fr`, requête + réponse consignées), puis
      site de l'entité si le registre ne tranche pas (URL + extrait verbatim)
- [ ] **S1.3** Verdicts + preuves pour les 500, en 5 lots de 100, un commit par lot
- [ ] **S1.4** Gel : `bench/precision/corpus-v1.json` est figé, empreinte SHA-256
      écrite dans l'état et dans le rapport
- [ ] **S1.5** `bench/results/precision-baseline.json` : précision, répartition
      par verdict et par strate, **bruit de mesure** (deux tirages de 100 sur la
      même population, écart observé)
- [ ] **S1.6** Classer les `hors_sujet` par mode d'échec (jeton générique, TLD,
      homonyme, sigle, ville, troncature) avec effectifs

**Sortie S1 :** un corpus gelé et une précision de départ qui ne bougera plus.

## S2 — Les deux modes d'échec dominants

- [ ] **S2.1** Règle candidate pour le mode n°1, écrite, avec ce qu'elle casse
- [ ] **S2.2** Mesure sur corpus gelé **et** sur échantillon frais de 100
- [ ] **S2.3** Règle candidate pour le mode n°2, même protocole
- [ ] **S2.4** Bilan S2 : ce qui reste, ce qui a été retiré et pourquoi

## S3 — Modes restants et cas limites

- [ ] **S3.1** Modes 3 à 6, un commit par règle
- [ ] **S3.2** Cas limites : sigles (ANSSI, CHU), homonymes d'État, entités
      étrangères citées en français, noms à un seul mot
- [ ] **S3.3** `bench/precision/gold-v1.json` : 50 cas pièges qui doivent rester
      justes quoi qu'il arrive

## S4 — Généralisation et performance

- [ ] **S4.1** Échantillon frais de 500 (graine neuve, jamais vue) : mesure
- [ ] **S4.2** Comparaison corpus gelé / échantillon frais / jeu d'or
- [ ] **S4.3** Coût : temps de rattachement par indice, avant/après règles, sur
      1 244 048 organisations — mesuré, pas estimé

## S5 — Industrialisation

- [ ] **S5.1** Les règles retenues deviennent des tests de régression
- [ ] **S5.2** `verify-all.sh` intègre la mesure de précision sur le jeu d'or
- [ ] **S5.3** `docs/mesure-precision.md` : le protocole complet, réexécutable
      par quelqu'un d'autre

## S6 — Rapport de campagne

- [ ] **S6.1** `docs/rapport-precision.md` : précision de départ, précision
      finale sur échantillon frais, bruit de mesure, ce qui n'a pas marché
- [ ] **S6.2** `pnpm typecheck` + `bash scripts/verify-all.sh`, état `git` propre
- [ ] **S6.3** Marquer la vague terminée dans `bench/state/wave-precision.json`

## Fin de vague

`S6.3` fait et la vérification verte : la vague s'arrête. Écrire
`WAVE-COMPLETE` dans le fichier d'état. Ne rien enchaîner sans un plan écrit.
