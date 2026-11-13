-- 034 : les sources jamais lues, tranchées une par une.
--
-- Constat du 13 novembre 2026 : 270 sources déclarées, 182 activées, 163 lues
-- au moins une fois, **21 jamais lues**. Sur ces 21, deux fonctionnent — elles
-- n'avaient simplement jamais été exécutées — et dix-neuf ne peuvent pas
-- fonctionner telles quelles : page HTML là où le collecteur attend un flux,
-- API sans clé, ou canal Telegram qui ne rend pas de flux.
--
-- Aucune n'est supprimée : elles sont éteintes avec leur motif, réactivables
-- dès qu'une URL valide existera. Une source éteinte sans motif est une dette
-- invisible ; avec motif, c'est une décision.

-- 1. Elles fonctionnent — vérifiées le 13/11/2026 avec suivi de redirection.
UPDATE source
   SET description = 'Vérifié 2026-11-13 : 758 items dans le flux, jamais exécutée jusqu''ici'
 WHERE id = 'cat-huntress-blog';

UPDATE source
   SET description = 'Vérifié 2026-11-13 : 100 items dans le flux, jamais exécutée jusqu''ici'
 WHERE id = 'cat-cert-ee';

-- 2. Elles ne peuvent pas fonctionner telles quelles.
UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : répond 403 au collecteur (protection anti-robot)'
 WHERE id = 'actu-cybernews';

UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : Flux Atom vide, aucun item'
 WHERE id = 'cat-schneier-security';

UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : API Have I Been Pwned sans clé (401)'
 WHERE id = 'leak:hibp:breaches';

UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : API GitHub publique, aucun item de fuite exploitable'
 WHERE id = 'paste:github:gists-public';

UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : page HTML, pas un flux — le collecteur extrait zéro item'
 WHERE id IN (
   'ransom-ichi-ecosystem',
   'ransom-look-leaks',
   'ransomleak-antibrok3rs',
   'ransomleak-fulcrumsec',
   'ransomleak-lapsus',
   'ransomleak-leakeddata',
   'ransomleak-netleaks',
   'ransomleak-soulgroup',
   'ransomleak-toufan'
 );

UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : canal Telegram sans flux RSS — à remplacer par un miroir publiable'
 WHERE id IN (
   'tg-baseleeak',
   'tg-leaked-databases',
   'tg-marketo-leaks',
   'tg-ransomwareg',
   'tg-snatch-news'
 );

-- `hermes_radar_cyber` n'est pas une URL mais un profil d'exécution local
-- (`box hermes`) : il n'a pas à figurer comme source à collecter.
UPDATE source SET enabled = false,
   description = 'Éteinte 2026-11-13 : profil d''exécution local, pas une source réseau'
 WHERE id = 'hermes_radar_cyber';
