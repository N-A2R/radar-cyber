# Filtrage d'actionnabilité des indicateurs

## Politique

Le filtre rejette le "monde" : un indicateur n'est gardé que s'il désigne
un actif surveillé par une organisation (ou une CVE déjà rencontrée).
Les indicateurs globaux (IP inconnues, domaines publics, hashes) sont
écartés pour limiter le bruit.

## Motifs (`IndicatorReason`)

- `org_domain` : domaine exact d'une organisation.
- `org_subdomain` : sous-domaine d'un domaine d'organisation.
- `org_ip` : IP d'un asset (exacte ou dans un /24 connu).
- `cve_known` : CVE déjà présente dans nos événements vulnérabilités.
- `public_suffix` : suffixe public (rejeté).
- `global` : tout le reste (rejeté).

## Limites connues

- Les hashes ne sont jamais actionnables (aucun lien avec nos actifs).
- L'expansion /24 est une heuristique (peut générer du bruit sur les grands réseaux).
- L'index est chargé une fois en mémoire (~quelques centaines de lignes).

## Intégration dans generic.ts

Dans `ingestIndicator`, après `const value = line.trim();` (ligne ~174) et
avant `batch.push`, ajouter :

```ts
const verdict = isActionableIndicator(value, type, idx);
if (!verdict.keep) { skipped++; continue; }
```

avec `idx` chargé une fois via `loadActiveIndex()` + `loadKnownCves()` au
début de la fonction (à fusionner dans l'index).

## Mesure

Sur un échantillon TABLESAMPLE SYSTEM(1) de la table `indicator`
(55 149 lignes) : 5 gardés, 55 144 rejetés (dont 55 143 `global`,
4 `cve_known`, 1 `org_subdomain`, 1 `public_suffix`). Temps : 119 ms.

## Filtrage par langue des événements

`detectLanguage()` (`collectors/filter.ts`) score les mots outils et les
mots-clés cyber français/anglais, avec un bonus borné pour les accents. Elle
renvoie `fr`, `en` ou `und` quand le texte est trop court pour trancher.

`ingestNarrative()` stocke le résultat dans `event.langue` (migration 045) et
applique la porte optionnelle `RADAR_EVENT_LANGUAGES` : liste de codes séparés
par des virgules, vide/`*`/`all` = aucune restriction. Les rejets sont comptés
dans `collector_run.items_rejected` sous `langue:fr`, `langue:en` ou
`langue:und`. Une valeur invalide fait échouer le run au démarrage plutôt que
de filtrer silencieusement tout le flux.