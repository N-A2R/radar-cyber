# Plan : Mission longue — vague 2 complète + dettes ouvertes

> Suite de `mission-hygiene.md`. Ce plan reprend les **169 entités restantes**
> de la cohorte française et les chantiers de la vague 2 jamais attaqués, puis
> les dettes techniques connues.
>
> **Doctrine, sans exception :** rien de faux, rien d'illisible, rien de payant,
> mesure publiable. Un SIREN non vérifié à une source citable n'est pas publié.
> Un chiffre sans requête n'est pas écrit.
>
> **État au départ, mesuré :** cohorte `zone=france`, **199 entités**,
> **30 traitées** (lots A, B, C), **12 résolues** (`12/30`, dont 9 haute,
> 2 moyenne, 1 faible). Reste **169 entités**.

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`
- `python3 -c "import json;d=json.load(open('bench/results/manques-glm-vague2.json'));print(d['resolution']['taux'])"`

## Règles d'exécution (les lire avant chaque lot)

1. **Ne jamais re-traiter une entité déjà présente** dans
   `bench/results/manques-glm-vague2.json`. Le compteur `cohorte.traitees` fait foi.
2. **Un lot = un commit.** Le message suit le format des lots précédents
   (`feat(référentiel): vague 2 — lot X/10 résolu`).
3. **Trois niveaux de confiance, jamais quatre** :
   - `haute` — SIREN/RCS **ou** dénomination publiés par le site de l'entité ;
   - `moyenne` — dénomination exacte et unique au registre ;
   - `faible` — à un jeton près, **à revoir avant chargement**.
   Une entité non résolue reste dans `nonResolues`, elle n'est pas escamotée.
4. **Sources autorisées, gratuites uniquement** : mentions légales du site de
   l'entité, `https://recherche-entreprises.api.gouv.fr/search?q=…`,
   annuaire-administratif, Wikipedia **avec** sa source primaire. Aucun scraper
   payant, aucun contournement de captcha.
5. **Chaque entrée porte sa preuve** : `requetes` (les requêtes réellement
   lancées) et `preuves[]` (`voie`, `url`, `extrait` **copié du contenu reçu**,
   `dateConsultation`). Un extrait se copie, il ne se reformule pas.
6. **Aucun chiffre global avant la fin** : le taux se calcule sur la cohorte
   entière à la dernière tâche, pas lot par lot.
7. Ne jamais `/clear`. Ne jamais `git push --force`. Ne jamais toucher un
   fichier hors du périmètre de la tâche en cours.

---

## Task 1: Lots D et E — entités 31-50

- [ ] Lot D : entités 31-40
- [ ] Lot E : entités 41-50

Méthode par entité : partir du nom (`nomLisible`), chercher le site, extraire la
mention légale, confronter au registre, remplir l'entrée complète (siren,
siretSiege, denominationLegale, ville, departement, natureJuridique,
typeOrganisation, etatAdministratif, adresseSiege, raison, requetes, preuves).
- [ ] Commit après chaque lot.

## Task 2: Lots F à R — entités 51-190, par lots de 10

- [ ] 14 lots de 10 entités

Reprendre exactement la méthode de Task 1. Si une entité résiste plus de
**trois** tentatives de sources, la laisser en `nonResolues` avec sa raison :
mieux vaut une non-résolution documentée qu'un SIREN deviné.
- [ ] Un commit par lot, 14 commits.

## Task 3: Lot S — entités 191-199

- [ ] Les 9 dernières entités
- [ ] **Calculer et publier le taux global** dans `resolution` (numérateur,
      dénominateur, par confiance), et le comparer au `12/30` de départ
- [ ] Commit : `feat(référentiel): vague 2 — cohorte france terminée, taux publié`

**Critère de sortie de la phase référentiel :** `cohorte.traitees == 199`, et le
taux publié est arithmétiquement vérifiable (`python3` ci-dessus).

## Task 4: Sources muettes — diagnostic par lots de 25

- [ ] `scripts/source-health.mts --json` → lister 25 sources muettes
- [ ] Pour **5 sources** du lot : fetch réel, puis dire pourquoi rien ne sort
- [ ] Classer chacune : `parse-casse` / `vide-legitime` / `format-change` /
      `bloque-externe`
- [ ] Pour les `parse-casse` : réparer le parser correspondant **et** prouver la
      réparation sur un cas réel (avant/après dans le JSON)
- [ ] Publier `bench/results/sources-muettes-vague2.json`
- [ ] Répéter jusqu'à 100 sources couvertes ou lot épuisé
- [ ] Commit par lot de 25 dépouillées

## Task 5: Quarantaine `.onion` — les pages illisibles

- [ ] Lister les 45 pages `.onion` en quarantaine (requête SQL citée)
- [ ] Grouper par motif d'échec, d'après les 4 motifs de `docs/sources-diagnostic.md`
- [ ] Pour le motif dominant : proposer un fix parser, le tester sur **5 pages réelles**
- [ ] Journaliser les transitions (`kind` du journal de vérité) — rien de destructif
- [ ] Commit : `fix(parsers): quarantaine .onion — motif dominant réparé`

Si aucun motif ne domine : le dire dans le rapport, ne pas inventer de correctif.

## Task 6: Précision `presse_cyber` — seulement si la mesure l'exige

La vague 1 a mesuré **20/20 (100 %)**. Cette tâche ne s'exécute **que si** une
nouvelle mesure sur un échantillon différent descend sous 90 %.

- [ ] Re-mesurer sur un échantillon **différent** (autre graine) et publier
- [ ] Si ≥ 90 % : documenter la mesure et **s'arrêter là** (ne rien corriger)
- [ ] Si < 90 % : prendre les 20 faux positifs, proposer un ajustement du
      classificateur, re-mesurer le **même** échantillon, publier avant/après
- [ ] Commit dans les deux cas

## Task 7: Dettes techniques connues

- [ ] **`sourceUrl` non borné** (`packages/shared/src/index.ts`) : 10 Mo passent
      aujourd'hui (mesuré, 20 ms). Poser une borne (ex. `z.url().max(2048)`),
      vérifier que `admit.ts` ne tronque pas avant, ajouter le cas au test
      `apps/api/test/contrat-surdimensionne.test.ts`
- [ ] Commit : `fix(contrat): sourceUrl borné — 10 Mo ne passent plus`

## Task 8: Rapport de mission

- [ ] `bench/results/mission-vague2-final-2026-11-21.md` : taux final, sources
      muettes couvertes, quarantaine traitée, dettes réglées, ce qui reste ouvert
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`, corriger si rouge
- [ ] Vérifier `git status` propre (hors `AGENTS.md` et `.claude/`)
- [ ] Commit : `docs(mission): rapport final vague 2 publié`

## Arrêt

La mission s'arrête quand : `cohorte.traitees == 199`, Tasks 4 à 8 cochées ou
explicitement documentées comme impossibles, et la vérification verte.
Écrire alors `MISSION-COMPLETE` — et **ne pas** enchaîner sur autre chose.
