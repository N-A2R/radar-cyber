# Chantier L5 — Traduction des sources étrangères

## Objectif mesurable

Traduire en français les articles de sources étrangères qui concernent la
Nouvelle-Aquitaine, et mesurer **le nombre d'articles traduits** ainsi que
**la qualité** de ces traductions.

## Chiffre obtenu

| Mesure | Valeur |
| Articles dans le périmètre Nouvelle-Aquitaine | 103 |
| Organisations (état de départ) | 1 673 151 |
| Sources (état de départ) | 312 |
| Événements (état de départ) | 26 259 |
| Articles en(scope Nouvelle-Aquitaine | 103 |
| Articles de langue étrangère détectés | 11 |
| **Articles traduits** | **11 / 11 (100 %)** |
| **Qualité moyenne (référence indépendante)** | **0,9451 (94,51 %)** |
| Qualité minimale sur le corpus d'or | 0,7556 |
| Violations de données personnelles | 0 |
| Langues | en : 6 · nl : 3 · de : 2 |

Les 11 traductions sont stockées dans la table `article_translation` et
exposées par `GET /api/translations`. Le détail reproductible est dans
`bench/results/translation.json`.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/translate-foreign-articles.mts
```

L'option `--offline` rejoue le corpus gelé sans base de données ; `--apply`
écrit les traductions en base (insertion idempotente). Le script échoue si le
corpus d'or ne couvre pas tous les articles traduits ou si une traduction
contient une adresse e-mail ou un numéro de téléphone. Aucune commande du
chantier ne dépasse 60 secondes (mesure : 0,4 s environ).

## Méthode

1. **Périmètre** — un article entre dans le périmètre si son événement porte le
   drapeau régional ou si son organisation est rattachée à l'un des douze
   départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79,
   86, 87). Aucune source n'est écartée pour son caractère gris : les flux
   ransomware, fuites et forums restent admissibles.
2. **Détection** — scoring déterministe de mots-outils et d'expressions fortes
   sur le titre, avec au moins 3 points de preuve et une confiance ≥ 0,3. Les
   titres français et les textes sans preuve ne sont pas traduits.
3. **Traduction** — glossaire local anglais / allemand / néerlandais vers le
   français, sans réseau et sans service payant. Les identifiants, versions,
   domaines et noms de produits sont conservés tels quels.
4. **Qualité** — 85 % de F1 sur les mots de contenu face à une référence
   française écrite indépendamment (corpus de 11 entrées,
   `bench/corpus/translation-gold.jsonl`) + 15 % de préservation des
   identifiants. Le score sans référence exige l'absence de mots-outils
   étrangers résiduels et l'absence de perte d'identifiant.

## Conformité

- **Données personnelles** — seuls les titres traduits sont persistés ; ni le
  titre original, ni le résumé, ni aucune donnée de victime n'est stocké ou
  exposé. Un titre contenant une adresse e-mail ou un téléphone est refusé
  (0 violation mesurée).
- **Code et interface en anglais** — module, scripts, routes, clés JSON et
  messages d'erreur sont en anglais ; seul ce rapport est en français.
- **`server.ts`** — aucun changement (diff de 0 ligne) : la route est enregistrée
  dans le registre commun `routes/index.ts`.
- **Aucun service payant** — traduction entièrement locale et déterministe.

## Vérifications

- 16 tests ciblés réussis (`test/translation.test.ts`), un test par comportement,
  y compris le filtre Nouvelle-Aquitaine, le refus des données personnelles, la
  préservation des identifiants et la route HTTP.
- Contrôle de couverture des règles d'accès : 3/3 réussis.
- `tsc --noEmit` : 0 erreur.

## Limites

Le moteur est un glossaire déterministe : il traduit la terminologie cyber et
les structures de titres courantes, pas la grammaire complète. Les langues
couvertes sont l'anglais, l'allemand et le néerlandais ; l'occitan et le basque
restent suivis par le chantier des langues régionales. La qualité mesurée est
un proxy reproductible (F1 + préservation), pas une évaluation humaine.
