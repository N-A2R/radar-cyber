# Archivage à froid chiffré — rapport de mesure

Date : 22 novembre 2026. Branche : `ext/chantier-h7`.

## Objectif chiffré

Objectif : **la procédure testée de bout en bout**. Le critère vérifiable retenu est le suivant : les six étapes de la procédure réussissent et **100 % des faits de Nouvelle-Aquitaine éligibles** sont sélectionnés, scellés, chiffrés puis restaurés depuis le fichier froid, sans donnée personnelle de victime.

## Chiffre obtenu

```
Cold archive: 6/6 stages passed; 59/59 NA events sealed, encrypted and restored (100%); sources=25; sha256=cd419f6758faded65a2ba9e3f6590bd78eb9aaa645c2327c2b6488f6ca9529a3; scope=Nouvelle-Aquitaine
```

**Résultat : 59/59 faits restaurés (100 %) et 6/6 étapes réussies.** La mesure a été rejouée deux fois : le chiffre et le SHA-256 du contenu canonique sont identiques (l'enveloppe, elle, utilise un sel et un IV neufs à chaque exécution).

### Commande reproductible

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
apps/api/node_modules/.bin/tsx scripts/measure-cold-archive.mts
# ou : pnpm measure:cold-archive
```

La commande affiche une ligne de synthèse puis un objet JSON (sans les enregistrements). `RADAR_COLD_ARCHIVE_DIR` et `RADAR_COLD_ARCHIVE_PASSPHRASE` permettent de fixer le répertoire froid et la phrase secrète ; sans ces variables, un répertoire temporaire et une phrase éphémère sont utilisés.

## État réel de départ

Mesuré sur la base de production au moment de l'exécution :

| Jeu de données | Volume |
|---|---:|
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 259 |
| Faits NA éligibles à l'archivage | 59 |
| Sources représentées dans ces faits | 25 |

Les 59 faits éligibles sont ceux dont l'organisation est dans l'un des douze départements de Nouvelle-Aquitaine ou qui sont explicitement marqués « regional », hors TLP `RED`/`AMBER` et hors famille `leaks`.

## Procédure testée

1. **select** — sélection en base, bornée à la Nouvelle-Aquitaine, avec jointure sur l'organisation et la source.
2. **redact** — retrait des courriels, numéros de téléphone et identifiants nationaux dans le titre, le résumé et l'URL ; refus de sceller si une trace subsiste.
3. **seal** — sérialisation canonique (clés et enregistrements triés) et SHA-256 stable.
4. **encrypt** — AES-256-GCM avec clé dérivée par scrypt ; seul le chiffré est écrit sur disque (`cold-archive.enc`, mode 0600), jamais le clair.
5. **verify** — déchiffrement, contrôle du digest, contrôle du périmètre, et contrôle négatif : un octet retourné dans une copie doit être rejeté.
6. **restore** — relecture du fichier froid et comparaison enregistrement par enregistrement avec le contenu scellé.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre sur `org.dept` (12 départements) ou `event.regional`.
- **Sources grises autorisées** : aucune liste blanche d'éditeurs ; un fait issu d'un forum non référencé est couvert par un test dédié.
- **Aucune donnée personnelle de victime** : redaction avant chiffrement, vérifiée sur le contenu déchiffré et sur les octets du fichier.
- **Aucun service payant** : chiffrement local via `node:crypto`, aucun appel réseau, aucun fournisseur externe.
- **Code et interface en anglais** : modules, messages CLI et tests en anglais ; le présent rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff (limite : 10).
- **Aucune commande de plus de 60 s** : mesure rejouée en environ 1 s, suite ciblée en environ 2 s.

## Vérification

Suite ciblée sur une base PostgreSQL jetable :

```bash
cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  node_modules/.bin/tsx test/run.ts test/cold-archive.test.ts
# tests 7 / pass 7 / fail 0
```

Un test par comportement : périmètre et sources grises, redaction, stabilité du digest et détection de modification, refus d'une mauvaise phrase secrète, rejet d'un octet corrompu, restauration complète, et ligne de mesure reproductible. Le typecheck de l'API passe également (`tsc --noEmit`).
