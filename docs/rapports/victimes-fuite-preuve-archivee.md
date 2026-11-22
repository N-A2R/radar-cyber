# Victimes NA des sites de fuite — preuve archivée

**Mesure du 22 novembre 2026 : 66 victimes de Nouvelle-Aquitaine extraites, 66 avec une capture archivée de leur revendication (66/66, 100 %).**

## Résultat reproductible

```bash
# Extraction + archivage (37,8 s mesurées, < 60 s), base réelle 5433
pnpm leak-proofs:archive --max-sites=80 --years=2025,2026

# Relecture des octets archivés et mesure (0,5 s)
pnpm leak-proofs:measure --json=bench/results/leak-victim-proofs-measure.json
```

Sortie observée :

```
NA claims extracted: 69
NA leak victims with archived claim capture: 66
...
NA leak victims with archived claim capture: 66 (victims=66, valid claim records=66, invalid=0)
```

Le manifeste `bench/results/leak-victim-proofs.json` et les 66 enregistrements
`bench/leak-victim-proofs/*.warc` sont versionnés : la mesure relit les fichiers,
vérifie le digest SHA-1 base32, la longueur, l'URL source, l'empreinte de la
revendication, le SHA-256 du contenu et l'absence de données personnelles. Une
capture modifiée est exclue du chiffre (test de comportement dédié).

## État réel de départ et chemin de la mesure

| Étape | Résultat mesuré |
| --- | ---: |
| Organisations du référentiel | 1 673 151 |
| Sources | 312 |
| Événements | 26 259 |
| Sites de fuite interrogés avec succès | 72 (8 bloqués) |
| Revendications collectées | 34 985 |
| Revendications rattachées à la NA | 69 |
| Victimes NA distinctes | **66** |
| Victimes avec capture archivée vérifiée | **66** |

Les 69 revendications NA se réduisent à 66 victimes distinctes : trois
revendications supplémentaires visent une organisation déjà extraite (doublons
de campagne), et sont consignées comme telles dans le manifeste. Sur ces 66
victimes, 62 sont rattachées par identifiant à une organisation du référentiel,
toutes dans l'un des 12 départements autorisés de Nouvelle-Aquitaine ; les
quatre autres portent un signal territorial explicite détecté par le collecteur.

## Ce qui est archivé

Les pages web historiques des revendications RansomLook répondent aujourd'hui
HTTP 404 (les UUID de blogs ont été renouvelés). La preuve archivable est donc
l'objet JSON **exact tel que publié** par les flux publics :

- `https://www.ransomlook.io/api/recent/5000`, `/api/posts/2025`, `/api/posts/2026` ;
- `https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json`.

Chaque victime possède un enregistrement WARC 1.1 distinct contenant l'objet
JSON de sa revendication, avec `WARC-Target-URI` pointant le flux d'origine,
`WARC-Date`, `WARC-Block-Digest` SHA-1 base32, `Content-Length`, l'empreinte de
la revendication et une clé de victime dérivée de l'identifiant de
l'organisation. Les octets sont découpés dans la réponse brute sans
resérialisation, puis filtrés avant écriture.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : détection conservatrice (département
  explicite, commune ancrée, rattachement par nom ou domaine unique) héritée du
  collecteur ; les 62 organisations rattachées ont été revérifiées en SQL sur
  les 12 départements de la région.
- **Aucune donnée personnelle de victime** : le manifeste ne contient ni nom de
  victime ni contact, seulement des identifiants d'organisation et des hashes ;
  les captures sont filtrées (courriels, téléphones, identifiants nationaux)
  avant écriture, et la mesure rejette toute capture qui en contiendrait. Un
  balayage des 66 fichiers ne trouve aucune correspondance.
- **Sources grises autorisées, aucun service payant** : agrégateurs publics et
  dépôt GitHub public uniquement ; aucun appel à une API payante.
- **Code et interface en anglais, rapport en français** : modules, scripts,
  tests et sorties de mesure en anglais ; le présent rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff (aucune route ajoutée).
- **Aucune commande de plus de 60 s** : archivage 37,8 s, mesure 0,5 s,
  6 tests ciblés 2,3 s, typage 10 s.

La mesure ne porte que sur les revendications publiques disponibles au moment
 de l'extraction : une revendication supprimée d'un flux après coup reste
 vérifiable par la capture archivée, mais une revendication jamais publiée dans
 ces quatre flux n'entre pas dans le chiffre.
