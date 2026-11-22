# Rapport d'audit d'accessibilité AA — interface Nouvelle-Aquitaine

## Objectif chiffré et résultat

**Objectif : auditer les 11 écrans de l'application en WCAG 2.0/2.1 A+AA et
corriger chaque écart, avec un test par comportement corrigé.**

| Mesure | Avant corrections | Après corrections |
|---|---|---|
| Écrans audités | 11 | 11 |
| Violations axe-core A/AA (nœuds) | **50** | **0** |
| Comportements AA corrigés et testés | 0 | **10** |
| Tests dédiés qui passent | 0 | **11/11** |
| Diff de `apps/api/src/server.ts` | — | **0 ligne** |

Le chiffre principal est le nombre de **nœuds DOM en violation** retournés par
axe-core sur les règles `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, additionné
sur les 11 écrans. Les 50 violations initiales venaient toutes de `aria-selected`
posé sur des `<button>` de la liste d'événements (règle `aria-allowed-attr`,
critère 4.1.2), visible sur 10 écrans sur 11 (5 nœuds par écran).

## Commande reproductible

```bash
cd apps/web && ./node_modules/.bin/vitest run \
  test/a11y-audit.test.tsx test/a11y-shell-status.test.tsx --reporter=dot
```

Sortie attendue : `A11Y_AA_AUDIT screens=11 violations=0`, puis
`Test Files 2 passed`, `Tests 11 passed`. Durée mesurée : 4 à 13 s.
Le détail par écran est écrit dans `bench/results/na-a11y-aa.json` (fichier
versionné, régénéré à chaque exécution). La mesure de départ a été faite avec
la même commande, avant correction : `A11Y_AA_AUDIT screens=11 violations=50`.

L'audit s'exécute en mode démonstration (`VITE_DATA_MODE=mock`) : aucun appel
réseau, aucune donnée de victime. Le titre et l'attribut `lang` du document de
test sont lus dans le `index.html` réel, afin que la mesure reflète la page
livrée. axe-core (4.14.1, licence open source) est la seule dépendance ajoutée.

## Corrections, une par comportement

| # | Comportement | Critère | Test |
|---|---|---|---|
| 1 | Lignes du fil : `aria-pressed` remplace `aria-selected` sur un bouton | 4.1.2 | `gives feed rows a valid pressed state…` |
| 2 | Lien « Skip to content » vers le `<main id="main">` | 2.4.1 | `bypasses the rail with a skip link…` |
| 3 | `lang="en"` aligné sur l'interface anglaise | 3.1.1 | `declares English as the page language` |
| 4 | Champ de recherche global nommé « Global search » | 4.1.2 | `names the global search combobox` |
| 5 | Tab / Maj+Tab renfermé dans les dialogues modaux | 2.1.2 | `wraps Tab focus inside a modal dialog` |
| 6 | En-têtes triables de Health actionnables au clavier | 2.1.1 | `makes every health sort header keyboard operable` |
| 7 | Onglets du graphe : flèches, `aria-selected`, panneau nommé | 2.1.1 / 4.1.2 | `follows the tabs pattern…` |
| 8 | Focus porté sur la fermeture de l'aide clavier (Review) | 2.4.3 | `moves focus into the review keyboard help dialog` |
| 9 | Erreur API annoncée en `role="alert"` / `aria-live` | 4.1.3 | `announces an API failure…` |
| 10 | Message hors ligne annoncé en `role="status"` / `aria-live` | 4.1.3 | `announces stale offline data…` |

Les libellés de la coquille (portée du fil, repli/dépli, mode démonstration)
ont été passés en anglais pour rester cohérents avec `lang="en"`. Le focus
visible, les jetons de contraste AA et les région `status` des écrans internes
étaient déjà en place et n'ont pas été modifiés.

## Périmètre et limites

- Périmètre géographique : l'interface est celle du radar de Nouvelle-Aquitaine
  (11 écrans, incluant « Nouvelle-Aquitaine ») ; les données de démonstration
  sont synthétiques et ne contiennent aucune donnée personnelle de victime.
- Les sources grises restent autorisées ; aucun contrôle n'a été ajouté sur
  leur contenu. Aucun service payant n'est utilisé.
- Le contraste des couleurs n'est pas évalué par axe-core sous jsdom (absence
  de canvas) ; il repose sur les jetons de couleur AA déjà documentés dans
  `apps/web/src/styles.css`.
- Les messages d'état historiques en français de certains écrans internes ne
  sont pas traduits dans ce chantier ; ils ne sont pas couverts par la mesure
  axe. Le lien « Skip to content » et la navigation sont en anglais, comme le
  reste de l'interface.
- Aucune commande de vérification ne dépasse 60 s (mesure : 4 à 13 s,
  typecheck : 7 à 14 s).

OBJECTIF : atteint — 0 / 0 violations axe-core A/AA (11 / 11 écrans audités, 50 / 50 violations initiales corrigées, 10 / 10 comportements corrigés et testés ; mesure reproductible : `cd apps/web && ./node_modules/.bin/vitest run test/a11y-audit.test.tsx test/a11y-shell-status.test.tsx --reporter=dot`).
