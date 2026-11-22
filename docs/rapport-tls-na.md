# Certificats TLS des sites publics de Nouvelle-Aquitaine

**Mesure du 2026-11-22T00:30:26.551Z.** Corpus : `bench/corpus/sources-na-1000.jsonl`
(empreinte SHA-256 `fa7bb711bba847e25459a58ce474a3faeea26c35cca35210055d3f41f5028909`).

## Résultat mesuré

Sur **1 000 sites** du corpus et **760 hôtes distincts**, **16 sites**
(1,6 %) présentent un certificat **expiré, faible ou mal configuré**.
Ces sites occupent **16 hôtes** distincts.

Commande reproductible, depuis la racine du dépôt :

```sh
pnpm mesure:tls
```

Durée de la mesure : 17,8 s.

## Répartition par état

| État | Sites |
| --- | ---: |
| Expiré | 2 |
| Mal configuré | 14 |
| Faible | 0 |
| Valide | 979 |
| Pas de TLS | 4 |
| Inconnu | 1 |

Les états `Pas de TLS` et `Inconnu` ne sont pas comptés comme défauts de certificat :
les sites uniquement HTTP n'ont pas de certificat à auditer, et un endpoint
injoignable après une nouvelle tentative est une mesure manquante, pas une preuve
de mauvaise configuration.

## Motifs observés

| Motif | Sites |
| --- | ---: |
| Nom d'hôte hors certificat | 14 |
| Pas de service TLS | 4 |
| Certificat auto-signé | 3 |
| Certificat expiré | 2 |
| Endpoint injoignable | 1 |

Un site peut cumuler plusieurs motifs ; le statut retient le plus grave
(expiré, puis mal configuré, puis faible).

## Répartition par département

| Département | Sites | Défaut |
| --- | ---: | ---: |
| 16 | 79 | 0 |
| 17 | 111 | 1 |
| 19 | 45 | 1 |
| 23 | 17 | 0 |
| 24 | 52 | 1 |
| 33 | 238 | 7 |
| 40 | 68 | 0 |
| 47 | 48 | 0 |
| 64 | 119 | 4 |
| 79 | 68 | 2 |
| 86 | 82 | 0 |
| 87 | 73 | 0 |

## Sites les plus représentés parmi les défauts

| Hôte | Sites | État | Motifs |
| --- | ---: | --- | --- |
| collegealainfournierbordeaux.fr | 1 | Mal configuré | hostname_mismatch |
| stjo-secondigny.fr | 1 | Mal configuré | hostname_mismatch |
| stjosephdepontacq.com | 1 | Expiré | certificate_expired, self_signed_certificate |
| villedegan.fr | 1 | Mal configuré | hostname_mismatch |
| www.college-jean-moulin-artix.websco.fr | 1 | Mal configuré | hostname_mismatch |
| www.collegegoya.fr | 1 | Mal configuré | hostname_mismatch |
| www.collegestjoseph.fr | 1 | Mal configuré | hostname_mismatch |
| www.cordeliers-oloron.fr | 1 | Mal configuré | hostname_mismatch |
| www.mairie-margaux.fr | 1 | Mal configuré | hostname_mismatch |
| www.mairie-targon.com | 1 | Mal configuré | hostname_mismatch |
| www.mairie-vayres.fr | 1 | Expiré | certificate_expired |
| www.maxbramerie-laforce.websco.fr | 1 | Mal configuré | hostname_mismatch |
| www.saint-aubin-de-medoc.fr | 1 | Mal configuré | hostname_mismatch |
| www.saint-yzan-de-soudiac.com | 1 | Mal configuré | hostname_mismatch, self_signed_certificate |
| www.st-pantaleon-larche.correze.net | 1 | Mal configuré | hostname_mismatch |
| www.ville-marans.fr | 1 | Mal configuré | hostname_mismatch, self_signed_certificate |

## Méthode

1. Le corpus versionné `bench/corpus/sources-na-1000.jsonl` est lu sans appel
   réseau : 1 000 sources actives, déjà vérifiées en HTTP 200, toutes en
   Nouvelle-Aquitaine.
2. Les URL sont regroupées par hôte : un handshake TLS couvre toutes les pages
   d'un même hôte. Les URL HTTP sont tout de même testées sur le port 443 pour
   voir si un service TLS existe.
3. Chaque hôte reçoit un handshake TLS avec `rejectUnauthorized: false`, ce qui
   permet de lire le certificat même expiré, auto-signé ou hors nom.
4. Les règles pures classent le certificat : expiration, nom d'hôte, chaîne,
   auto-signature, signature MD5/SHA-1, taille de clé, version TLS.
5. Une nouvelle tentative est faite sur les erreurs transitoires (DNS, timeout,
   connexion refusée) ; un endpoint toujours injoignable reste `Inconnu`.
6. Le scan est borné à 64 connexions simultanées et à un budget global de 55 s,
   pour que la commande reste sous la limite d'une minute.

## Limites

- Mesure ponctuelle : un certificat peut expirer ou être renouvelé après la
  mesure. La date et l'empreinte du corpus sont écrites pour rejouer la mesure.
- Les sites derrière un même certificat wildcard partagent le verdict : le
  défaut est compté pour chaque source du corpus, pas une fois par certificat.
- Aucune donnée personnelle de victime n'est lue ni écrite : le corpus ne
  contient que des sites publics et leurs preuves HTTP.
