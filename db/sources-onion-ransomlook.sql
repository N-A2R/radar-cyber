-- Sources .onion de revendication, testées via Tor le 2026-11-10.
-- Statut mesuré par requête HTTP à travers le proxy SOCKS de Tor.
INSERT INTO source (id, name, family, url, kind, format, enabled, interval_sec) VALUES
  ('onion:rl:eraleign-apt73', 'eraleign (apt73)', 'ransomware', 'http://basheqtvzqwz4vp6ks5lm2ocq7i6tozqgf6vjcasj4ezmsy4bkpshhyd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:abyss-data', 'abyss-data', 'ransomware', 'http://3ev4metjirohtdpshsqlkrqcmxq6zu3d7obrdhglpy5jpbr7whmlfgqd.onion', 'narrative', 'html', false, 3600),
  ('onion:rl:byod', 'byod', 'ransomware', 'http://byodxn5s7sua6oyyjj74rycgn6afncfckprt5ezskt3cni6lg3wdrgad.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:fulcrumsec', 'fulcrumsec', 'ransomware', 'http://4e3p3in2bl67hxchuwza7qvnpe7pyeloyztr5fnh257fxkovfhappjyd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:gammax', 'gammax', 'ransomware', 'http://gammax6w3dkfdjfrjthtmqzsioue52vzy6lz54qy6jcvmogfpubutjyd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:genesis', 'genesis', 'ransomware', 'http://genesis6ixpb5mcy4kudybtw5op2wqlrkocfogbnenz3c647ibqixiad.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:global-secret-group', 'global secret group', 'ransomware', 'http://o5lsqyar7ox25z734k6zaxt2vf7bsyi4q5rturi5iyxzqo3ica7bjsad.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:3am', '3am', 'ransomware', 'http://threeamkelxicjsaf2czjyz2lc4q3ngqkxhhlexyfcp2o6raw4rphyad.onion', 'narrative', 'html', false, 3600),
  ('onion:rl:netrunner', 'netrunner', 'ransomware', 'http://netrunrs65cn2yidokrmxn5rrur2gjpuyuwrt6mkfy6lek4jnqojn4qd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:kazu', 'kazu', 'ransomware', 'http://6czlbd2jfiy6765fbnbnzuwuqocg57ebvp3tbm35kib425k4qnmiiiqd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:orova', 'orova', 'ransomware', 'http://maa2yprc5pldyr5hjn246hw7i66wdhglnostqgqkcbuh4vyyeos4xxyd.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:ransomhouse', 'ransomhouse', 'ransomware', 'http://da763kyxwe3mf67gui5tb5igvpnt4w6cps5svrw2wkizyrzqgamdxtid.onion/', 'narrative', 'html', false, 3600),
  ('onion:rl:sarcoma', 'sarcoma', 'ransomware', 'http://zp6bziy6wljpkg6i3uxzzcxyajodxzoc7acf5egb2vhzzrot23y3mpyd.onion/', 'narrative', 'html', false, 3600)
ON CONFLICT (id) DO NOTHING;
