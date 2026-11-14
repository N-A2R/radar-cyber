-- 038 : la famille inventée `presse_cyber` sort du contrat.
--
-- `packages/shared` déclare les familles autorisées ; `presse_cyber` n'en fait
-- pas partie. Conséquence mesurée sur D0 : `classifyFamily` reçoit une famille
-- hors contrat, rend la valeur telle quelle, et la porte d'admission
-- (`if (family === "presse") refus`) ne s'applique plus. Les 200 articles admis
-- le 14 novembre ont donc contourné la décision du 10 novembre **et** échappé
-- à toute règle de détection : `presse-cyber` attend `family = "presse"`,
-- `fuite-donnees` attend `family = "cti"`. Aucun événement ne pouvait alerter.
--
-- La famille correcte est `cti` : c'est celle que le contrat prévoit pour un
-- flux de renseignement, et c'est celle que les règles de détection attendent.
-- Le filtrage reste tenu par `classifyFamily`, qui rétrograde en `presse` —
-- donc refuse — tout item qui ne porte pas de signal cyber.

UPDATE source
   SET family = 'cti'
 WHERE id LIKE 'gn-%'
   AND family = 'presse_cyber';

-- Les événements déjà admis sous cette famille l'ont été en contournant la
-- porte : ils sont purgés. La collecte suivante les réadmet par le chemin
-- normal — donc les refuse s'ils ne portent pas de signal cyber.
DELETE FROM event WHERE family = 'presse_cyber';
