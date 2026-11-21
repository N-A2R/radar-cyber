#!/usr/bin/env python3
"""Détecter les sources en doublon du catalogue versionné `db/*.sql`.

Trois signaux, du plus fort au plus faible :

  1. URL canonique identique — schéma et `www.` ignorés, slash final et fragment
     retirés, paramètres de suivi écartés, paramètres restants triés ;
  2. URL finale identique après redirections (deux URL qui mènent au même flux) ;
  3. contenu identique sur les 5 premiers items (RSS, Atom, JSON ou HTML) :
     au moins 3 liens canoniques communs (2 si les flux n'en exposent que 2).
     Les titres normalisés servent à l'extraction ; les libellés de menu sans
     lien (communs à tous les sites d'une même administration) sont exclus.

Les groupes sont construits par union-find : A~B par URL et B~C par contenu
forment un seul groupe. La source à garder est choisie de façon déterministe :
active, répondante, la plus configurée, avec des items, URL chiffrée,
puis identifiant le plus court et trié — le choix est déterministe.

Fonctionnement hors ligne : `--collecter` sonde chaque URL et écrit un snapshot
dans `bench/results/`. Sans cet argument, le snapshot est relu et le rapport est
recalculé sans réseau — une source candidate reste donc toujours tracée, même
quand sa sonde a échoué (champ `erreur`).

    python3 bench/sources/dedupe-sources.py --collecter
    python3 bench/sources/dedupe-sources.py
    python3 bench/sources/test_dedupe_sources.py
"""
from html.parser import HTMLParser

import argparse
import concurrent.futures
import html
import importlib.util
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "bench/results/doublons-sources-sondes.json"
RAPPORT_JSON = ROOT / "bench/results/doublons-sources.json"
RAPPORT_MD = ROOT / "docs/research/doublons-sources.md"
NB_ITEMS = 5
TIMEOUT = 10
WORKERS = 12
UA = "Mozilla/5.0 (compatible; RadarCyber/1.0; source-dedup)"

SUIVI = re.compile(
    r"^(utm_|fbclid$|gclid$|gclsrc$|dclid$|mc_cid$|mc_eid$|spm$|igshid$|"
    r"mkt_tok$|_ga$|ref$|ref_src$|source$|src$)",
    re.I,
)


def charger_parseur_catalogue():
    """Réutilise le parseur de `audit-catalog.py` (nom de fichier à tiret)."""
    chemin = Path(__file__).with_name("audit-catalog.py")
    spec = importlib.util.spec_from_file_location("audit_catalog", chemin)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normaliser_url(url: str) -> str:
    """Clé d'égalité d'une URL : hôte + chemin + paramètres triés, sans schéma."""
    try:
        parts = urllib.parse.urlsplit((url or "").strip())
    except ValueError:
        return (url or "").strip().lower()
    if not parts.hostname:
        return (url or "").strip().lower()
    hote = parts.hostname.lower().removeprefix("www.")
    port = ""
    if parts.port and not (
        (parts.scheme.lower() == "http" and parts.port == 80)
        or (parts.scheme.lower() == "https" and parts.port == 443)
    ):
        port = f":{parts.port}"
    chemin = re.sub(r"/{2,}", "/", parts.path or "/").rstrip("/") or "/"
    query = sorted(
        (k, v)
        for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
        if not SUIVI.match(k)
    )
    return f"{hote}{port}{chemin}" + (("?" + urllib.parse.urlencode(query)) if query else "")


def normaliser_texte(texte: str) -> str:
    """Titre comparable : NFKD, diacritiques et ponctuation retirés, casse ignorée."""
    brut = unicodedata.normalize("NFKD", html.unescape(texte or ""))
    lettres = "".join(
        c for c in brut if not unicodedata.combining(c) and (c.isalnum() or c.isspace())
    )
    return re.sub(r"\s+", " ", lettres).strip().lower()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _texte_noeud(noeud: ET.Element, *noms: str) -> str:
    for enfant in noeud.iter():
        if _local(enfant.tag) in noms and (enfant.text or "").strip():
            return (enfant.text or "").strip()
    return ""


def _items_xml(body: bytes) -> list[dict]:
    racine = ET.fromstring(body)
    noeuds = [n for n in racine.iter() if _local(n.tag) in ("item", "entry")]
    items = []
    for noeud in noeuds:
        titre = _texte_noeud(noeud, "title")
        lien = _texte_noeud(noeud, "link", "guid", "id")
        if not lien:
            for enfant in noeud.iter():
                if _local(enfant.tag) == "link" and enfant.get("href"):
                    lien = enfant.get("href")
                    break
        if titre or lien:
            items.append({"titre": titre, "lien": lien})
    return items


def _items_json(body: bytes) -> list[dict]:
    donnees = json.loads(body.decode("utf-8", errors="replace"))
    meilleurs: list[dict] = []

    def visiter(value):
        if len(meilleurs) >= NB_ITEMS:
            return
        if isinstance(value, dict):
            for child in value.values():
                visiter(child)
        elif isinstance(value, list):
            if value and all(isinstance(x, dict) for x in value):
                for ligne in value:
                    titre = ""
                    lien = ""
                    for cle, val in ligne.items():
                        if not isinstance(val, str):
                            continue
                        base = _local(str(cle))
                        if base in ("title", "titre", "name", "headline", "subject") and not titre:
                            titre = val
                        elif base in ("link", "url", "href", "guid", "id") and not lien:
                            lien = val
                    if titre or lien:
                        meilleurs.append({"titre": titre, "lien": lien})
                    if len(meilleurs) >= NB_ITEMS:
                        return
            else:
                for child in value:
                    visiter(child)

    visiter(donnees)
    return meilleurs[:NB_ITEMS]


class _LiensHTML(HTMLParser):
    """Titres d'articles : textes d'ancres avec leur href résolu, et titres."""

    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.items: list[dict] = []
        self._href: str | None = None
        self._ancre: list[str] = []
        self._titre: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._ancre = []
        elif tag in ("h1", "h2", "h3", "h4"):
            self._titre = []

    def handle_data(self, data: str):
        if self._href is not None:
            self._ancre.append(data)
        if self._titre:
            self._titre.append(data)

    def handle_endtag(self, tag: str):
        if tag == "a" and self._href is not None:
            titre = normaliser_texte(" ".join(self._ancre))
            lien = urllib.parse.urljoin(self.base, self._href)
            if len(titre) >= 12 and normaliser_url(lien) not in ("", "/"):
                self.items.append({"titre": titre, "lien": lien})
            self._href, self._ancre = None, []
        elif tag in ("h1", "h2", "h3", "h4") and self._titre:
            titre = normaliser_texte(" ".join(self._titre))
            if len(titre) >= 15:
                self.items.append({"titre": titre, "lien": ""})
            self._titre = []


def _items_html(body: bytes, base: str) -> list[dict]:
    texte = body.decode("utf-8", errors="replace")
    parser = _LiensHTML(base)
    parser.feed(texte)
    items: list[dict] = []
    for item in parser.items:
        if item not in items:
            items.append(item)
        if len(items) >= NB_ITEMS:
            break
    if not items:
        brut = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", texte)
        brut = normaliser_texte(re.sub(r"<[^>]+>", " ", brut))
        if brut:
            items.append({"titre": brut[:300], "lien": ""})
    return items


def signatures_items(body: bytes, content_type: str, base_url: str = "") -> list[str]:
    """5 signatures max : titre normalisé + lien canonique."""
    try:
        ct = (content_type or "").lower()
        if "xml" in ct or body.lstrip()[:1] == b"<" and b"<rss" in body[:2000].lower():
            items = _items_xml(body)
        elif "json" in ct or body.lstrip()[:1] in (b"{", b"["):
            items = _items_json(body)
        else:
            items = _items_html(body, base_url)
    except (ET.ParseError, ValueError, TypeError, json.JSONDecodeError):
        items = _items_html(body, base_url)
    signatures: list[str] = []
    for item in items[:NB_ITEMS]:
        titre = normaliser_texte(item.get("titre", ""))
        lien = normaliser_url(item.get("lien", "")) if item.get("lien") else ""
        sig = f"{titre}|{lien}" if titre or lien else ""
        if sig and sig not in signatures:
            signatures.append(sig)
    return signatures[:NB_ITEMS]


def sonder(source: dict) -> dict:
    """Un sondage réel, ou une erreur tracée — jamais une source silencieuse."""
    resultat = {
        "id": source["id"],
        "url": source["url"],
        "url_finale": None,
        "http": None,
        "octets": 0,
        "items": [],
        "erreur": None,
    }
    try:
        url = urllib.parse.quote(source["url"], safe="/:?&=#%+@,;!$'()*~-_.[")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as reponse:
            body = reponse.read(1024 * 1024)
            resultat["http"] = reponse.status
            resultat["url_finale"] = reponse.geturl()
            resultat["octets"] = len(body)
            resultat["items"] = signatures_items(
                body, reponse.headers.get("Content-Type", ""), reponse.geturl()
            )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as exc:
        resultat["erreur"] = f"{type(exc).__name__}: {str(exc)[:180]}"
    return resultat


def charger_sources() -> list[dict]:
    module = charger_parseur_catalogue()
    par_id: dict[str, dict] = {}
    for row in module.parse_catalogues():
        par_id[row["id"]] = row
    return [
        {
            "id": row.get("id", ""),
            "nom": row.get("name", ""),
            "famille": row.get("family", ""),
            "url": row.get("url", ""),
            "fichier": row.get("_file", ""),
            "metadata": sum(
                bool(row.get(champ)) for champ in ("kind", "format", "parser", "interval_sec", "description")
            ),
            "active": row.get("enabled", "true").lower() != "false",
        }
        for row in sorted(par_id.values(), key=lambda r: r.get("id", ""))
    ]


def collecter(sources: list[dict]) -> dict:
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        sondes = list(pool.map(sonder, sources))
    return {
        "genere_le": datetime.now(timezone.utc).isoformat(),
        "methode": f"urllib, {WORKERS} threads, timeout {TIMEOUT}s, 5 premiers items",
        "sondes": {s["id"]: s for s in sondes},
    }


class UnionFind:
    def __init__(self, taille: int):
        self.parent = list(range(taille))

    def trouver(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def unir(self, a: int, b: int) -> None:
        ra, rb = self.trouver(a), self.trouver(b)
        if ra != rb:
            self.parent[rb] = ra


def chevauchement(a: list[str], b: list[str]) -> int:
    """Items communs : seuls les items avec lien comptent (menus exclus)."""
    liens_a = {s.rsplit("|", 1)[1] for s in a if "|" in s and s.rsplit("|", 1)[1]}
    liens_b = {s.rsplit("|", 1)[1] for s in b if "|" in s and s.rsplit("|", 1)[1]}
    communs = len(liens_a & liens_b)
    seuil = min(NB_ITEMS // 2 + 1, len(liens_a), len(liens_b))
    return communs if seuil >= 2 and communs >= seuil else 0


def score_gardien(source: dict, sonde: dict) -> tuple:
    """Le plus petit score est le meilleur gardien (stable et documenté)."""
    return (
        0 if source["active"] else 1,
        0 if sonde.get("http") and 200 <= sonde["http"] < 400 else 1,
        -source.get("metadata", 0),
        -len(sonde.get("items", [])),
        0 if source["url"].lower().startswith("https://") else 1,
        len(source["url"]),
        len(source["id"]),
        source["id"],
    )


def construire_rapport(sources: list[dict], snapshot: dict) -> dict:
    sondes = snapshot["sondes"]
    uf = UnionFind(len(sources))
    liens: list[tuple[int, int, str]] = []

    def lier(a: int, b: int, raison: str) -> None:
        liens.append((a, b, raison))
        uf.unir(a, b)

    par_url: dict[str, list[int]] = defaultdict(list)
    par_finale: dict[str, list[int]] = defaultdict(list)
    for i, source in enumerate(sources):
        sonde = sondes.get(source["id"], {})
        par_url[normaliser_url(source["url"])].append(i)
        if sonde.get("url_finale"):
            par_finale[normaliser_url(sonde["url_finale"])].append(i)

    for indexes in par_url.values():
        for i in indexes[1:]:
            lier(indexes[0], i, "url canonique identique")
    for indexes in par_finale.values():
        for i in indexes[1:]:
            lier(indexes[0], i, "même URL après redirection")

    for i in range(len(sources)):
        items_i = sondes.get(sources[i]["id"], {}).get("items", [])
        if len(items_i) < 2:
            continue
        for j in range(i + 1, len(sources)):
            items_j = sondes.get(sources[j]["id"], {}).get("items", [])
            if len(items_j) < 2:
                continue
            communs = chevauchement(items_i, items_j)
            if communs:
                lier(i, j, f"contenu identique ({communs}/5 items)")

    facteurs: dict[int, list[str]] = defaultdict(list)
    for a, b, raison in liens:
        if uf.trouver(a) == uf.trouver(b):
            racine = uf.trouver(a)
            facteurs[racine].append(f"{sources[a]['id']} ~ {sources[b]['id']} : {raison}")

    groupes_indexes: dict[int, list[int]] = defaultdict(list)
    for i in range(len(sources)):
        groupes_indexes[uf.trouver(i)].append(i)


    groupes = []
    decisions = []
    for racine, indexes in sorted(groupes_indexes.items(), key=lambda kv: min(kv[1])):
        gardien = min(indexes, key=lambda i: score_gardien(sources[i], sondes.get(sources[i]["id"], {})))
        doublons = [i for i in indexes if i != gardien]
        if doublons:
            groupes.append(
                {
                    "garder": sources[gardien]["id"],
                    "garder_nom": sources[gardien]["nom"],
                    "doublons": [sources[i]["id"] for i in doublons],
                    "preuves": sorted(facteurs.get(racine, []))[:8],
                }
            )
        for i in indexes:
            decisions.append(
                {
                    "id": sources[i]["id"],
                    "nom": sources[i]["nom"],
                    "url": sources[i]["url"],
                    "fichier": sources[i]["fichier"],
                    "groupe": racine,
                    "decision": "garder" if i == gardien else f"doublon de {sources[gardien]['id']}",
                    "erreur_sonde": sondes.get(sources[i]["id"], {}).get("erreur"),
                }
            )

    avant = len(sources)
    apres = len(groupes_indexes)
    return {
        "genere_le": datetime.now(timezone.utc).isoformat(),
        "perimetre": "catalogue versionné des sources, db/*.sql (INSERT INTO source)",
        "regles": [
            "URL canonique : schéma/www/slash final/fragment ignorés, UTM et suivi retirés, paramètres triés",
            "URL finale après redirection identique",
            "contenu : au moins 3 des 5 premiers items partagent un lien canonique identique",
        ],
        "avant": avant,
        "apres": apres,
        "sources_en_moins": avant - apres,
        "groupes": groupes,
        "sources": decisions,
        "sondes_en_echec": [
            {"id": s["id"], "erreur": s["erreur"]}
            for s in (sondes.get(src["id"], {}) for src in sources)
            if s.get("erreur")
        ],
        "controles": {
            "sources_entrees": avant,
            "sources_dans_les_decisions": len(decisions),
            "groupes": len(groupes_indexes),
            "somme_groupes": sum(len(v) for v in groupes_indexes.values()),
            "coherent": len(decisions) == avant
            and sum(len(v) for v in groupes_indexes.values()) == avant
            and apres == avant - sum(len(g["doublons"]) for g in groupes),
        },
    }


def formater_markdown(rapport: dict) -> str:
    lignes = [
        "# Doublons de sources du catalogue versionné",
        "",
        f"**{rapport['avant']} sources avant, {rapport['apres']} sources réellement distinctes après** "
        f"({rapport['sources_en_moins']} en moins, aucune retirée sans trace).",
        "",
        "Périmètre : " + rapport["perimetre"] + ". Chaque ligne du catalogue figure dans "
        "`bench/results/doublons-sources.json` avec sa décision (`garder` ou `doublon de …`) "
        "et son éventuelle erreur de sonde.",
        "",
        "## Règles",
        "",
    ]
    lignes += [f"- {r}" for r in rapport["regles"]]
    lignes += [
        "",
        "## Groupes de doublons",
        "",
        f"{len(rapport['groupes'])} groupes, "
        f"{rapport['sources_en_moins']} sources fusionnables.",
        "",
        "| Source à garder | Doublons | Preuve |",
        "| --- | --- | --- |",
    ]
    for g in rapport["groupes"]:
        preuve = "<br>".join(g["preuves"][:3]).replace("|", "\\|")
        lignes.append(
            f"| `{g['garder']}` — {g['garder_nom']} | "
            + ", ".join(f"`{d}`" for d in g["doublons"])
            + f" | {preuve} |"
        )
    lignes += [
        "",
        "## Sondes en échec",
        "",
        f"{len(rapport['sondes_en_echec'])} "
        "URL n'ont pas pu être sondées (tor, DNS, timeout…). Elles restent "
        "dans le rapport et sont regroupées sur l'URL canonique seule.",
        "",
    ]
    for e in rapport["sondes_en_echec"][:20]:
        lignes.append(f"- `{e['id']}` — {e['erreur']}")
    lignes += ["", "## Contrôles", "", "```json", json.dumps(rapport["controles"], indent=2), "```", ""]
    return "\n".join(lignes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collecter", action="store_true", help="sonder les URL et régénérer le snapshot")
    parser.add_argument("--json", type=Path, default=RAPPORT_JSON)
    parser.add_argument("--md", type=Path, default=RAPPORT_MD)
    args = parser.parse_args()

    sources = charger_sources()
    if args.collecter or not SNAPSHOT.exists():
        snapshot = collecter(sources)
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    else:
        snapshot = json.loads(SNAPSHOT.read_text())

    rapport = construire_rapport(sources, snapshot)
    if not rapport["controles"]["coherent"]:
        raise SystemExit("Contrôle de non-perte échoué : rapport incohérent")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n")
    args.md.parent.mkdir(parents=True, exist_ok=True)
    args.md.write_text(formater_markdown(rapport))
    print(
        f"{rapport['avant']} sources avant → {rapport['apres']} après "
        f"({len(rapport['groupes'])} groupes, {rapport['sources_en_moins']} doublons)"
    )


if __name__ == "__main__":
    main()
