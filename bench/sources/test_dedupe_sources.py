#!/usr/bin/env python3
"""Tests hors ligne du détecteur de doublons de sources."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

CHEMIN = Path(__file__).with_name("dedupe-sources.py")
_spec = importlib.util.spec_from_file_location("dedupe_sources", CHEMIN)
dedupe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dedupe)


class NormalisationURL(unittest.TestCase):
    def test_variantes_meme_source(self):
        variants = [
            "https://www.exemple.fr/flux/?a=1&b=2#rss",
            "http://exemple.fr/flux?b=2&a=1",
            "https://exemple.fr:443/flux/?utm_source=x&a=1&b=2",
            "https://www.exemple.fr//flux/?fbclid=1&b=2&a=1",
        ]
        self.assertEqual(len({dedupe.normaliser_url(u) for u in variants}), 1)

    def test_urls_distinctes(self):
        self.assertNotEqual(
            dedupe.normaliser_url("https://exemple.fr/rss"),
            dedupe.normaliser_url("https://exemple.fr/actualites"),
        )
        self.assertNotEqual(
            dedupe.normaliser_url("https://exemple.fr/rss"),
            dedupe.normaliser_url("https://autre.fr/rss"),
        )


class ComparaisonContenu(unittest.TestCase):
    RSS = """<?xml version="1.0"?>
    <rss><channel>
      <item><title>Un titre</title><link>{base}/article/1?utm_source=rss</link></item>
      <item><title>Un autre titre</title><link>{base}/article/2</link></item>
      <item><title>Troisième</title><link>{base}/article/3</link></item>
    </channel></rss>"""

    def test_rss_scheme_et_utm_ignores(self):
        a = dedupe.signatures_items(
            self.RSS.format(base="https://www.exemple.fr").encode(), "application/rss+xml"
        )
        b = dedupe.signatures_items(
            self.RSS.format(base="http://exemple.fr").encode(), "text/xml"
        )
        self.assertEqual(a, b)
        self.assertEqual(dedupe.chevauchement(a, b), 3)

    def test_menus_sans_lien_ne_comptent_pas(self):
        html = """<html><body>
          <h2>Actions de l'État</h2><h2>Services de l'État</h2>
          <a href="/a/1">Premier article de la préfecture</a>
          <a href="/a/2">Deuxième article de la préfecture</a>
        </body></html>"""
        a = dedupe.signatures_items(html.encode(), "text/html", "https://un.fr/actualites")
        b = dedupe.signatures_items(html.encode(), "text/html", "https://deux.fr/actualites")
        self.assertEqual(dedupe.chevauchement(a, b), 0)

    def test_articles_communs_suffisent(self):
        html = "<html>" + "".join(
            f'<a href="/article/{i}">Titre de l\'article numéro {i}</a>' for i in range(5)
        ) + "</html>"
        a = dedupe.signatures_items(html.encode(), "text/html", "https://www.un.fr/")
        b = dedupe.signatures_items(html.encode(), "text/html", "http://un.fr/")
        self.assertEqual(len(a), 5)
        self.assertEqual(dedupe.chevauchement(a, b), 5)


class Regroupement(unittest.TestCase):
    @staticmethod
    def source(identifiant, url, active=True):
        return {
            "id": identifiant,
            "nom": identifiant,
            "famille": "presse",
            "url": url,
            "fichier": "test.sql",
            "active": active,
        }

    def test_aucune_source_perdue(self):
        sources = [
            self.source("a", "https://exemple.fr/rss"),
            self.source("b", "http://www.exemple.fr/rss/?utm_source=x"),
            self.source("c", "https://miroir.fr/flux"),
            self.source("d", "https://autre.fr/rss"),
            self.source("e", "https://mort.fr/rss", active=False),
        ]
        items = [f"titre|exemple.fr/article/{i}" for i in range(1, 6)]
        sondes = {
            "a": {"id": "a", "http": 200, "items": items, "erreur": None},
            "b": {"id": "b", "http": 200, "items": [], "erreur": None},
            "c": {"id": "c", "http": 200, "items": items[:3], "erreur": None},
            "d": {"id": "d", "http": 200, "items": [], "erreur": None},
            "e": {"id": "e", "http": None, "items": [], "erreur": "timeout"},
        }
        rapport = dedupe.construire_rapport(sources, {"sondes": sondes})
        self.assertEqual((rapport["avant"], rapport["apres"]), (5, 3))
        self.assertEqual(len(rapport["sources"]), 5)
        self.assertEqual({d["id"] for d in rapport["sources"]}, {s["id"] for s in sources})
        self.assertTrue(rapport["controles"]["coherent"])
        self.assertEqual(rapport["sondes_en_echec"][0]["id"], "e")
        gardiens = {g["garder"] for g in rapport["groupes"]}
        self.assertIn("a", gardiens)
        self.assertNotIn("b", gardiens)

    def test_gardien_actif_et_repondant(self):
        sources = [
            self.source("inactif", "https://www.un.fr/rss", active=False),
            self.source("actif", "http://un.fr/rss"),
        ]
        sondes = {
            "inactif": {"http": 200, "items": ["a|x", "b|y", "c|z", "d|w", "e|v"]},
            "actif": {"http": 200, "items": []},
        }
        rapport = dedupe.construire_rapport(sources, {"sondes": sondes})
        self.assertEqual(rapport["groupes"][0]["garder"], "actif")


if __name__ == "__main__":
    unittest.main(verbosity=2)
