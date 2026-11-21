# Vague : Brancher les règles — la précision devient-elle réelle en production ?

> Suite de `docs/rapport-precision.md`. Les six règles sont **prouvées en spec**
> (83 % brut, tenu sur échantillon frais) mais le moteur **ne les appelle pas** :
> en production, la précision reste à 4,5 %. Cette vague branche, mesure le
> compromis, et dit la vérité sur ce qu'elle coûte.

## Le point de départ, mesuré

| Mesure | Valeur | Source |
|---|---|---|
| Précision moteur livré | **4,5 %** population · 5,7 % brut | `precision-baseline.json` |
| Précision règles en spec | **83,3 %** brut · 13,8 % population | `precision-regle12-s2.json` |
| Couverture si branché | **29 %** des indices rattachés | même fichier |
| Règles dans le moteur | **aucune** (`grep regles-precision apps/api/src` → le fichier seul) | code |
| Indécidables | 27 % des propositions | corpus |

## Budget : une demi-semaine humaine, à tenir en une session courte

Le quota restant est de **~100 M** tokens, soit **~1 h 10 de travail actif**
(85,5 M/h mesuré). Cette vague est dimensionnée pour tenir dedans :

| Étape | Heures humaines | Régime |
|---|---|---|
| S1 branchement | 3 h | jugé |
| S2 mesure avant/après sur les 500 | 2 h | scripté |
| S3 garde-fous et tests | 2 h | jugé |
| S4 rapport | 1 h | jugé |
| **Total** | **8 h** | ≈ 40-50 min d'agent |

## Règles

Verdict sans preuve = pas de verdict. Une baisse de couverture se publie. Un test
qui casse se répare, il ne se supprime pas. Aucun chiffre de campagne sans sa
commande.

---

## S1 — Brancher les six règles dans le moteur

- [ ] **S1.1** `promote.ts` appelle `regles-precision.ts` au point de décision,
      derrière un drapeau (`PRECISION_RULES=on|off`) pour pouvoir mesurer les
      deux comportements dans le même binaire
- [ ] **S1.2** Journaliser le refus : chaque indice écarté par une règle écrit
      **quelle règle** l'a écarté (sinon on ne saura jamais pourquoi la
      couverture tombe)
- [ ] **S1.3** `pnpm typecheck` + tests existants ; réparer ce qui casse, sans
      assouplir un test qui protège un comportement voulu

## S2 — Mesurer le compromis en conditions réelles

- [ ] **S2.1** Rejouer le flux réel avec `PRECISION_RULES=on` : combien
      d'indices rattachés, combien refusés, par règle
- [ ] **S2.2** Sur les 500 du corpus gelé : précision **et** couverture, avant
      (off) / après (on)
- [ ] **S2.3** Écrire `bench/results/precision-branchement.json` avec les deux
      régimes et le détail par règle

## S3 — Garde-fous

- [ ] **S3.1** Test de régression : un indice que le moteur rattachait à tort
      (ex. `wakao.co.jp` → « CO & CO ») ne doit plus produire de rattachement
- [ ] **S3.2** Test : un indice que le moteur rattachait **juste** continue de
      l'être (pas de régression de couverture sur les cas sûrs)
- [ ] **S3.3** Le jeu d'or (50 pièges) doit rester vert avec les règles actives

## S4 — Rapport

- [ ] **S4.1** `docs/rapport-regles-branchees.md` : précision et couverture
      avant/après, ce que chaque règle refuse, et ce que ça implique pour la
      revue humaine
- [ ] **S4.2** `pnpm typecheck` + `bash scripts/verify-all.sh` verts, `git status`
      propre
- [ ] **S4.3** Marquer la vague terminée dans `bench/state/wave-regles.json`

## Arrêt

Écrire `WAVE-COMPLETE` quand S4.3 est fait et la vérification verte. Si le quota
passe sous **30 M**, arrêter après la tâche en cours, écrire un rapport partiel
et laisser l'état à jour.
