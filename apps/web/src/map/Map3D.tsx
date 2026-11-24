/**
 * Carte MapLibre GL JS 6 — vue « carte » du radar cyber (Nouvelle-Aquitaine).
 *
 * Props :
 * - `orgs` : organisations, petits points neutres cliquables (popup nom/kind/ville).
 * - `events` : événements à placer ; champs utilisés : `id`, `title`, `family`,
 *   `severity`, `sourceId`, `sourceUrl`, `observedAt`, `summary`, `lat`, `lon`, `orgId`.
 * - `families` : filtre actif par famille (liste vide ou indéfinie = toutes).
 * - `onSelect` : appelé avec `org:<id>` au clic sur un marqueur d'organisation.
 * - `onSelectEvent` : appelé avec l'`id` de l'événement au clic sur un point.
 *
 * Couches (de bas en haut) :
 * - `osm` (plan raster), `satellite` (imagerie IGN), `dem` (terrain),
 *   `ofm`/`buildings` (bâtiments 3D OpenFreeMap) ;
 * - `dep` (choroplèthe de densité d'organisations par département) +
 *   `dep-outline` (contours départementaux) ;
 * - `arcs-glow` + `arcs` (liaisons org → événement ou centroïde ; couleur par
 *   nature d'organisation si connue, sinon par famille) ;
 * - `cities` (labels de villes) ;
 * - `orgs` (marqueurs neutres cliquables) + `hot` (halo des orgs actives) ;
 * - `events` : cercles colorés par famille, rayon par sévérité ; au-delà de
 *   `MAX_POINTS` points, agrégation par cellule géo (compteur + famille dominante) ;
 * - `events-hover` (halo de survol), `events-count` (compteur des cellules).
 *
 * Palette fixe exportée : `FAMILY_COLORS` (partagée avec `arcs.ts`).
 */
// Le worker MapLibre n'est utile qu'à cette vue : le configurer ici garde la
// bibliothèque hors du chunk initial.
import '../maplibre-worker'
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import { FAMILY_HEX, FAMILY_HEX_FALLBACK, arcHex, type FlowArc } from './arcs.js'
import { connectAttackStream, fetchLiveAttacks, LiveAttackLayer, mergeAttacks, type LiveAttack } from './live3d.js'
import DEP_GEOJSON_RAW from './departements-na.geojson?raw'
import { styleSecours } from '../offline'
import { FAMILY_LABELS, ORG_KIND_LABELS } from './libelles'
import { Badge } from '@astryxdesign/core/Badge'

// ── Types ────────────────────────────────────────────────────────────────

export type MapOrg = {
  id: number
  name: string
  slug: string
  kind: string
  city: string | null
  /** Code INSEE du département ; sinon densité lue depuis `/api/orgs`. */
  dept?: string | null
  /** Nombre d'événements rattachés ; sinon calculé depuis `events`. */
  eventCount?: number
  lat: number | null
  lon: number | null
}

export type MapEvent = {
  id: string
  title: string
  family: string
  assertionType: string
  orgId?: number | null
  lat?: number | null
  lon?: number | null
  severity?: number
  confidence?: string | null
  sourceId?: string
  sourceUrl?: string | null
  observedAt?: string | null
  summary?: string | null
}

export interface Map3DProps {
  /** Organisations affichées (points neutres cliquables). */
  orgs: MapOrg[]
  /** Événements à placer sur la carte. */
  events: MapEvent[]
  /** Filtre actif par famille ; liste vide/indéfinie = toutes les familles. */
  families?: readonly string[]
  /** Clic sur un marqueur d'organisation → `org:<id>`. */
  onSelect?: (id: string) => void
  /** Clic sur un point d'événement → id de l'événement. */
  onSelectEvent?: (id: string) => void
  /** Arcs animés (flux temps réel) ; vide = pas d'overlay. */
  flows?: FlowArc[]
  /** Live WebGL layer: ongoing Nouvelle-Aquitaine attacks, redrawn at 60 fps. */
  live?: boolean
  /** Fond de carte : imagerie satellite (IGN) ou plan vectoriel sombre. */
  basemap?: 'sat' | 'plan'
}

// ── Palette fixe (alignée sur les variables CSS de styles.css) ──────────

export const FAMILY_COLORS: Record<string, string> = FAMILY_HEX
export const FAMILY_COLOR_FALLBACK = FAMILY_HEX_FALLBACK
/** Marqueur d'organisation : neutre (`--muted`), distinct des familles colorées. */
export const NEUTRAL_COLOR = '#8b93a1'


export { FAMILY_LABELS }


/** Palette des types d'organisation (maquette), reprise par `orgKindMatch`. */
const ORG_KIND_COLORS: Record<string, string> = {
  sante: '#f05545',
  collectivite: '#4a90d9',
  entreprise: '#f0a63c',
  enseignement: '#a855f7',
  recherche: '#22c55e',
  operateur_critique: '#e0483c',
  ess: '#e0b341',
}
const ORG_KIND_FALLBACK = '#9fb2c4'

const STROKE_DARK = '#12100d'
const STROKE_LIGHT = '#ffffff'

/** Expression MapLibre `match` sur `family`, construite depuis la palette partagée. */
function familyMatch(): any[] {
  const pairs = Object.entries(FAMILY_COLORS).flatMap(([family, color]) => [family, color])
  return ['match', ['get', 'family'], ...pairs, FAMILY_COLOR_FALLBACK]
}

/** Expression MapLibre `match` sur `kind` (couleur des points d'organisation). */
function orgKindMatch(): any[] {
  const pairs = Object.entries(ORG_KIND_COLORS).flatMap(([kind, color]) => [kind, color])
  return ['match', ['get', 'kind'], ...pairs, ORG_KIND_FALLBACK]
}
// ── Choroplèthe départements (OSM, ODbL) ────────────────────────────────

type DepFeature = {
  type: 'Feature'
  geometry: unknown
  properties: { code: string; nom: string }
}

/** Limites des 12 départements de Nouvelle-Aquitaine (propriétés `code`, `nom`). */
const DEP_FEATURES = (JSON.parse(DEP_GEOJSON_RAW) as { type: 'FeatureCollection'; features: DepFeature[] }).features

/**
 * Densité du référentiel par département.
 *
 * L'orange saturé à 0,68 couvrait toute la carte : chaque département dépasse
 * cent organisations, donc tous tombaient dans la classe haute, et l'aplat
 * masquait les points d'activité. La densité du référentiel est un fond, pas
 * une alerte : elle passe en teal très clair, et se lit comme une texture.
 */
function densityColor(count: number): string {
  if (count <= 0) return 'rgba(61,219,217,0)'
  if (count <= 200) return 'rgba(61,219,217,0.05)'
  if (count <= 600) return 'rgba(61,219,217,0.08)'
  if (count <= 1500) return 'rgba(61,219,217,0.11)'
  if (count <= 4000) return 'rgba(61,219,217,0.14)'
  return 'rgba(61,219,217,0.18)'
}

/** Expression `match` sur `code`, teintée par le nombre réel d'organisations. */
function depDensityMatch(counts: Map<string, number>): ExpressionSpecification {
  const pairs = DEP_FEATURES.flatMap((f) => [f.properties.code, densityColor(counts.get(f.properties.code) ?? 0)])
  // `match` admet un nombre variable de couples ; TS ne vérifie pas un spread
  // dans un tuple, d'où la conversion vers le type d'expression MapLibre.
  const expr = ['match', ['get', 'code'], ...pairs, 'rgba(232,163,61,0)'] as unknown as ExpressionSpecification
  return expr
}

/** Compte les organisations par code de département (données réelles de `orgs`). */
function countOrgsByDept(orgs: MapOrg[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const o of orgs) {
    if (!o.dept) continue
    counts.set(o.dept, (counts.get(o.dept) ?? 0) + 1)
  }
  return counts
}

// ── Constantes ──────────────────────────────────────────────────────────

// Bâtiments 3D : tuiles vectorielles OpenFreeMap (OSM, hauteurs incluses, sans clé).
const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet'
// Polices de la carte (labels de villes + compteurs de cellules).
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

/** En deçà, chaque point est dessiné ; au-delà, agrégation par cellule. */
const MAX_POINTS = 5000
/** Taille cible d'une cellule à l'écran, en pixels. */
const CELL_PX = 16
const MIN_CELL_DEG = 0.0002
/** Rayon (px) d'un point selon sa sévérité (1-5). */
const SEVERITY_RADII: Record<number, number> = { 1: 4, 2: 6, 3: 8, 4: 11, 5: 14 }

const CITY_LABELS: [string, number, number][] = [
  ['Bordeaux', -0.5792, 44.8378], ['La Rochelle', -1.152, 46.1591], ['Poitiers', 0.3404, 46.5802],
  ['Limoges', 1.2611, 45.8336], ['Pau', -0.3708, 43.2951], ['Bayonne', -1.4748, 43.4929],
  ['Angoulême', 0.1562, 45.6484], ['Niort', -0.4588, 46.3238], ['Agen', 0.6211, 44.2022],
  ['Périgueux', 0.7213, 45.1841], ['Bergerac', 0.4831, 44.8531], ['Arcachon', -1.1688, 44.6586],
  ['Cognac', -0.3294, 45.6959], ['Rochefort', -0.9667, 45.9421], ['Saintes', -0.6333, 45.7466],
  ['Brive-la-Gaillarde', 1.5333, 45.15], ['Guéret', 1.8703, 46.1706], ['Tulle', 1.7672, 45.2667],
  ['Mont-de-Marsan', -0.4997, 43.8907], ['Dax', -1.0536, 43.7102],
]

// Habillage de la carte selon la variante de design (data-theme sur <html>).
const MAP_THEMES: Record<string, { tiles: string[]; raster: Record<string, number>; buildings: string[]; label: string; labelHalo: string; orgStroke: string; depLine: string; fog: string; fogHorizon: string; lightColor: string; lightIntensity: number }> = {
  clair: {
    tiles: ['https://tiles.basemaps.cartocdn.com/light_all/{z}/{x}{r}.png'],
    raster: { 'raster-brightness-max': 1, 'raster-saturation': 0, 'raster-contrast': 0 },
    buildings: ['#e8e4dd', '#dcd6cb', '#cfc6b8', '#bdb2a1'],
    label: '#1f2937', labelHalo: '#ffffff', orgStroke: '#ffffff', depLine: 'rgba(15,23,42,0.55)',
    fog: '#e9eff5', fogHorizon: '#fbfcfe', lightColor: '#ffffff', lightIntensity: 0.75,
  },
}
const MAP_THEME_DARK = {
  raster: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.92, 'raster-contrast': 0.18 },
  buildings: ['#1b2230', '#2b3542', '#3d4a5c', '#5a6b82'],
  label: '#e6ebf2', labelHalo: '#080b10', orgStroke: '#080b10', depLine: 'rgba(232,163,61,0.55)',
  // Brume de fond et lumière rasante : les bâtiments extrudés prennent du
  // relief au lieu d'être des aplats. Couleurs prises dans la charte sombre.
  fog: '#050a12', fogHorizon: '#0c1826', lightColor: '#c8d4e2', lightIntensity: 0.5,
}

function applyMapTheme(map: maplibregl.Map, theme: string) {
  const light = MAP_THEMES[theme]
  const cfg = light ?? MAP_THEME_DARK
  const osm = map.getSource('osm') as maplibregl.RasterTileSource | undefined
  if (light && osm) osm.setTiles(light.tiles)
  else if (osm) osm.setTiles(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'])
  map.setPaintProperty('osm', 'raster-brightness-max', cfg.raster['raster-brightness-max'])
  map.setPaintProperty('osm', 'raster-saturation', cfg.raster['raster-saturation'])
  map.setPaintProperty('osm', 'raster-contrast', cfg.raster['raster-contrast'])
  map.setPaintProperty('buildings', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
    0, cfg.buildings[0], 8, cfg.buildings[1], 25, cfg.buildings[2], 60, cfg.buildings[3]])
  map.setPaintProperty('cities', 'text-color', cfg.label)
  map.setPaintProperty('cities', 'text-halo-color', cfg.labelHalo)
  map.setPaintProperty('orgs', 'circle-stroke-color', cfg.orgStroke)
  map.setPaintProperty('dep-outline', 'line-color', cfg.depLine)

  // Ambiance : ciel, horizon et brume au sol, plus une lumière rasante sur les
  // volumes. Purement natif MapLibre 6 (`setSky`, `setLight`), aucune
  // dépendance ; les couleurs viennent du thème, donc la charte ne bouge pas.
  try {
    map.setSky({
      'sky-color': cfg.fogHorizon,
      'horizon-color': cfg.fog,
      'fog-color': cfg.fog,
      'sky-horizon-blend': 0.35,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.15,
      'atmosphere-blend': 0.6,
    })
    map.setLight({
      anchor: 'viewport',
      color: cfg.lightColor,
      intensity: cfg.lightIntensity,
      position: [1.6, 88, 55],
    })
  } catch {
    // Style pas encore prêt : l'ambiance sera posée au prochain `style.load`.
  }
}

/** Couleur unique des arcs agrégés par destination. */
const AGGREGATED_ARC_COLOR = 'rgba(232,163,61,0.55)'

/** Arc candidat, avant regroupement par destination. */
type ArcDraft = {
  /** Destination arrondie (~11 m) : clé de regroupement. */
  key: string
  coordinates: [number, number][]
  family: string
  nature: string | null
  severity: number
}

type ArcFeature = {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: { family: string; nature: string | null; color: string; count: number }
}

function arcKey(lon: number, lat: number): string {
  return `${lon.toFixed(4)},${lat.toFixed(4)}`
}

/**
 * Un seul arc par destination : `count` = nombre d'arcs regroupés, `family`
 * celle de l'arc le plus sévère, couleur unique.
 */
function aggregateArcs(drafts: readonly ArcDraft[]): ArcFeature[] {
  const groups = new Map<string, { feature: ArcFeature; severity: number }>()
  for (const draft of drafts) {
    const existing = groups.get(draft.key)
    if (!existing) {
      groups.set(draft.key, {
        severity: draft.severity,
        feature: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: draft.coordinates },
          properties: { family: draft.family, nature: draft.nature, color: AGGREGATED_ARC_COLOR, count: 1 },
        },
      })
      continue
    }
    existing.feature.properties.count += 1
    if (draft.severity > existing.severity) {
      existing.severity = draft.severity
      existing.feature.properties.family = draft.family
      existing.feature.properties.nature = draft.nature
    }
  }
  return Array.from(groups.values(), (entry) => entry.feature)
}

/** Épaisseur du trait : `2 + min(6, count / 12)` ; le halo ajoute 6 px. */
function arcWidth(extra: number): ExpressionSpecification {
  return ['+', 2 + extra, ['min', 6, ['/', ['coalesce', ['get', 'count'], 1], 12]]]
}

function arcPoints(from: [number, number], to: [number, number], segments = 32): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const lift = Math.sin(t * Math.PI) * 0.18
    points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + lift])
  }
  return points
}

const debugWindow = window as unknown as Record<string, unknown>

// ── Géographie / agrégation ─────────────────────────────────────────────

/** Taille de cellule (en degrés) pour que la cellule fasse ~`CELL_PX` px à l'équateur. */
function cellSizeDeg(zoom: number): number {
  const degPerPx = 360 / (256 * Math.pow(2, zoom))
  return Math.max(degPerPx * CELL_PX, MIN_CELL_DEG)
}

function severityRadius(severity: number | undefined): number {
  const raw = typeof severity === 'number' && Number.isFinite(severity) ? severity : 3
  const s = Math.min(5, Math.max(1, Math.round(raw)))
  return SEVERITY_RADII[s]
}

function countRadius(count: number): number {
  if (count <= 2) return 12
  if (count <= 5) return 15
  if (count <= 20) return 20
  if (count <= 100) return 26
  return 34
}

type OrgCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Record<string, unknown> }[] }

function orgCollection(orgs: MapOrg[]): OrgCollection {
  return {
    type: 'FeatureCollection',
    features: orgs.flatMap((o) => {
      if (o.lat == null || o.lon == null || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return []
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.lon, o.lat] as [number, number] },
        properties: { id: o.id, name: o.name, kind: o.kind, city: o.city },
      }]
    }),
  }
}

type CellAccum = {
  lon: number
  lat: number
  count: number
  families: Map<string, number>
  severity: number
  sample: MapEvent | null
}

function pointFeature(e: MapEvent, stroke: string): Record<string, unknown> {
  return {
    type: 'Feature' as const,
    id: e.id,
    geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
    properties: {
      id: e.id,
      kind: 'point',
      family: e.family,
      color: FAMILY_COLORS[e.family] ?? FAMILY_COLOR_FALLBACK,
      radius: severityRadius(e.severity),
      severity: e.severity ?? 3,
      title: e.title,
      sourceId: e.sourceId ?? null,
      sourceUrl: e.sourceUrl ?? null,
      observedAt: e.observedAt ?? null,
      summary: e.summary ?? null,
      stroke,
    },
  }
}

function cellFeature(key: string, cell: CellAccum, stroke: string): Record<string, unknown> {
  const families = [...cell.families.entries()].sort((a, b) => b[1] - a[1])
  const dominant = families[0]?.[0] ?? 'cti'
  return {
    type: 'Feature' as const,
    id: `cell:${key}`,
    geometry: { type: 'Point' as const, coordinates: [cell.lon / cell.count, cell.lat / cell.count] },
    properties: {
      id: `cell:${key}`,
      kind: 'cell',
      family: dominant,
      color: FAMILY_COLORS[dominant] ?? FAMILY_COLOR_FALLBACK,
      radius: countRadius(cell.count),
      severity: cell.severity,
      count: cell.count,
      families: families.slice(0, 4),
      stroke,
    },
  }
}

/**
 * Construit les entités de la couche `events` : points individuels, ou — au-delà
 * de `MAX_POINTS` — cellules géo agrégées (compteur + famille dominante). Les
 * points isolés dans leur cellule restent des points individuels.
 */
function buildEventFeatures(events: MapEvent[], cellDeg: number, aggregate: boolean, stroke: string): Record<string, unknown>[] {
  if (!aggregate) {
    return events.flatMap((e) => {
      if (e.lat == null || e.lon == null || !Number.isFinite(e.lat) || !Number.isFinite(e.lon)) return []
      return [pointFeature(e, stroke)]
    })
  }

  const cells = new Map<string, CellAccum>()
  for (const e of events) {
    if (e.lat == null || e.lon == null || !Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue
    const key = `${Math.floor(e.lon / cellDeg)}:${Math.floor(e.lat / cellDeg)}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { lon: 0, lat: 0, count: 0, families: new Map(), severity: 1, sample: null }
      cells.set(key, cell)
    }
    cell.lon += e.lon
    cell.lat += e.lat
    cell.count += 1
    cell.families.set(e.family, (cell.families.get(e.family) ?? 0) + 1)
    cell.severity = Math.max(cell.severity, e.severity ?? 3)
    if (!cell.sample) cell.sample = e
  }

  return [...cells.entries()].flatMap(([key, cell]) => {
    if (cell.count === 1 && cell.sample) return [pointFeature(cell.sample, stroke)]
    return [cellFeature(key, cell, stroke)]
  })
}

// ── Popups ──────────────────────────────────────────────────────────────

const POPUP_STYLE_ID = 'radar-map-popup-style'
const POPUP_STYLE = `
.radar-popup .maplibregl-popup-content {
  background: var(--surface-3);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-4);
  box-shadow: var(--shadow-popup);
  padding: var(--space-2) var(--space-3) var(--space-3);
  font: inherit;
  font-size: var(--text-xs);
  line-height: var(--line-snug);
  max-width: 320px;
}
.radar-popup .maplibregl-popup-tip {
  border-top-color: var(--surface-3);
  border-bottom-color: var(--surface-3);
  border-left-color: var(--surface-3);
  border-right-color: var(--surface-3);
}
.radar-popup .maplibregl-popup-close-button {
  color: var(--muted);
  font-size: var(--text-md);
  line-height: 1;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-2);
}
.radar-popup .maplibregl-popup-close-button:hover { color: var(--text); background: var(--surface-2); }
.radar-popup-body { display: flex; flex-direction: column; gap: var(--space-2); }
.radar-popup-head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.radar-popup-chip {
  color: #0b0f16;
  font-size: var(--text-micro);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.01em;
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  text-transform: lowercase;
}
.radar-popup-sev { color: var(--muted); font-size: var(--text-micro); font-variant-numeric: tabular-nums; }
.radar-popup-title { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); line-height: var(--line-snug); }
.radar-popup-meta { display: flex; flex-direction: column; gap: 1px; color: var(--muted); font-size: var(--text-micro); }
.radar-popup-summary { margin: 0; color: var(--muted); font-size: var(--text-xs); }
.radar-popup-link { color: var(--accent); font-size: var(--text-xs); text-decoration: none; }
.radar-popup-link:hover { text-decoration: underline; }
.radar-popup-fams { display: flex; flex-direction: column; gap: var(--space-1); }
.radar-popup-fam { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--text-micro); }
.radar-popup-fam .dot { width: 8px; height: 8px; border-radius: var(--radius-full); flex: none; }
.radar-popup-hint { color: var(--faint); font-size: var(--text-micro); }
`

function ensurePopupStyles(): void {
  if (document.getElementById(POPUP_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = POPUP_STYLE_ID
  style.textContent = POPUP_STYLE
  document.head.appendChild(style)
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text != null) node.textContent = text
  return node
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return 'inconnue'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'inconnue' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function familyChip(family: unknown): HTMLElement {
  const key = typeof family === 'string' ? family : ''
  const chip = el('span', 'radar-popup-chip', FAMILY_LABELS[key] ?? key)
  chip.style.background = FAMILY_COLORS[key] ?? FAMILY_COLOR_FALLBACK
  return chip
}

function eventPopupContent(p: Record<string, any>): HTMLElement {
  const root = el('div', 'radar-popup-body')
  const head = el('div', 'radar-popup-head')
  head.appendChild(familyChip(p.family))
  head.appendChild(el('span', 'radar-popup-sev', `Sévérité ${p.severity ?? '—'}/5`))
  root.appendChild(head)
  root.appendChild(el('div', 'radar-popup-title', String(p.title ?? 'Événement')))
  const meta = el('div', 'radar-popup-meta')
  meta.appendChild(el('span', '', `Source : ${p.sourceId ?? 'inconnue'}`))
  meta.appendChild(el('span', '', `Date : ${formatDate(p.observedAt)}`))
  root.appendChild(meta)
  if (typeof p.summary === 'string' && p.summary !== '') {
    root.appendChild(el('p', 'radar-popup-summary', p.summary))
  }
  if (typeof p.sourceUrl === 'string' && p.sourceUrl !== '') {
    const link = document.createElement('a')
    link.className = 'radar-popup-link'
    link.href = p.sourceUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Ouvrir la source ↗'
    root.appendChild(link)
  }
  return root
}

function cellPopupContent(p: Record<string, any>): HTMLElement {
  const root = el('div', 'radar-popup-body')
  const head = el('div', 'radar-popup-head')
  head.appendChild(familyChip(p.family))
  head.appendChild(el('span', 'radar-popup-sev', `Sévérité max ${p.severity ?? '—'}/5`))
  root.appendChild(head)
  root.appendChild(el('div', 'radar-popup-title', `${p.count ?? 0} événements agrégés`))
  const fams = Array.isArray(p.families) ? p.families : []
  if (fams.length > 0) {
    const list = el('div', 'radar-popup-fams')
    for (const entry of fams) {
      if (!Array.isArray(entry)) continue
      const key = String(entry[0])
      const row = el('span', 'radar-popup-fam')
      const dot = el('span', 'dot')
      dot.style.background = FAMILY_COLORS[key] ?? FAMILY_COLOR_FALLBACK
      row.appendChild(dot)
      row.appendChild(el('span', '', `${FAMILY_LABELS[key] ?? key} · ${entry[1]}`))
      list.appendChild(row)
    }
    root.appendChild(list)
  }
  root.appendChild(el('div', 'radar-popup-hint', 'Zoomez pour détailler'))
  return root
}

function orgPopupContent(p: Record<string, any>): HTMLElement {
  const root = el('div', 'radar-popup-body')
  root.appendChild(el('div', 'radar-popup-title', String(p.name ?? 'Organisation')))
  const meta = el('div', 'radar-popup-meta')
  const kind = typeof p.kind === 'string' ? ORG_KIND_LABELS[p.kind] ?? p.kind : '—'
  meta.appendChild(el('span', '', `Type : ${kind}`))
  if (p.city) meta.appendChild(el('span', '', `Ville : ${p.city}`))
  root.appendChild(meta)
  return root
}

// ── Composant ───────────────────────────────────────────────────────────

export default function Map3D(props: Map3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect
  const onSelectEventRef = useRef(props.onSelectEvent)
  onSelectEventRef.current = props.onSelectEvent
  const renderRef = useRef<(() => void) | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const flowsRef = useRef<FlowArc[]>(props.flows ?? [])
  flowsRef.current = props.flows ?? []
  const [liveStatus, setLiveStatus] = useState<{ count: number; fps: number } | null>(null)


  // Création unique de la carte.
  useEffect(() => {
    if (!ref.current) return
    let disposed = false
    let map: maplibregl.Map | null = null
    let popup: maplibregl.Popup | null = null
    let raf = 0
    let themeObserver: MutationObserver | null = null
    let liveLayer: LiveAttackLayer | null = null
    let liveRaf = 0
    let liveCloseFeed: (() => void) | null = null
    let liveAttacks: LiveAttack[] = []

    /** One WebGL2 layer, one draw call per frame, a single rAF loop. */
    const startLive = (target: maplibregl.Map) => {
      if (!propsRef.current.live || disposed || liveLayer) return
      try {
        liveLayer = new LiveAttackLayer()
        target.addLayer(liveLayer as unknown as maplibregl.CustomLayerInterface)
        liveLayer.setAttacks(liveAttacks)
        let lastTick = 0
        let statusAt = 0
        let lastFrames = 0
        const tick = (now: number) => {
          if (disposed) return
          if (now - lastTick >= 16) {
            lastTick = now
            target.triggerRepaint()
          }
          if (now - statusAt >= 1000) {
            const frames = liveLayer?.frames ?? 0
            setLiveStatus({
              count: liveAttacks.length,
              fps: statusAt === 0 ? 0 : Math.round((frames - lastFrames) * 1000 / (now - statusAt)),
            })
            statusAt = now
            lastFrames = frames
          }
          liveRaf = requestAnimationFrame(tick)
        }
        liveRaf = requestAnimationFrame(tick)
      } catch {
        // WebGL2 unavailable: the map stays readable, the live layer is optional.
        liveLayer = null
      }
      void fetchLiveAttacks('/api/live-map').then((list) => {
        liveAttacks = list
        liveLayer?.setAttacks(list)
      }).catch(() => {})
      liveCloseFeed = connectAttackStream('/api/live-map/stream', (attack) => {
        liveAttacks = mergeAttacks(liveAttacks, [attack])
        liveLayer?.setAttacks(liveAttacks)
      })
    }
    let zoomTimer: ReturnType<typeof setTimeout> | undefined

    const cityFeatures = {
      type: 'FeatureCollection' as const,
      features: CITY_LABELS.map(([name, lon, lat]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
        properties: { name },
      })),
    }

    const buildMap = (ofmUrl: string) => {
      if (disposed || !ref.current) return
      ensurePopupStyles()
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          glyphs: OFM_GLYPHS,
          sources: {
            osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
            sat: {
              type: 'raster',
              tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'],
              tileSize: 256,
              maxzoom: 19,
              attribution: 'IGN-F/Géoplateforme',
            },
            dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium' },
            ofm: { type: 'vector', tiles: [ofmUrl], minzoom: 0, maxzoom: 14 },
            orgs: {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
              // 34 000 organisations en points individuels donnaient une tache
              // illisible à l'ouverture. Le regroupement fait lire une densité
              // (une pastille par bassin), et le point individuel n'apparaît
              // qu'une fois assez zoomé pour qu'il veuille dire quelque chose.
              cluster: true,
              clusterRadius: 42,
              clusterMaxZoom: 9,
            },
            hot: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            cities: { type: 'geojson', data: cityFeatures },
            dep: { type: 'geojson', data: { type: 'FeatureCollection', features: DEP_FEATURES }, attribution: '© OpenStreetMap contributors' },
            arcs: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            events: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.92, 'raster-contrast': 0.18 } },
            // Imagerie satellite assombrie : lisible sous les calques de données.
            // Masquée au départ : sans `visibility: none`, elle s'affichait
            // jusqu'au premier changement de prop, et le fond « plan » restait
            // couvert par l'imagerie.
            { id: 'satellite', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: {
              'raster-saturation': -0.72, 'raster-contrast': 0.2,
              'raster-brightness-min': 0.02, 'raster-brightness-max': 0.6 } },
            {
              id: 'buildings',
              type: 'fill-extrusion',
              source: 'ofm',
              'source-layer': 'building',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
                  0, '#1b2230', 8, '#2b3542', 25, '#3d4a5c', 60, '#5a6b82'],
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.9,
              },
            },
            {
              id: 'dep',
              type: 'fill',
              source: 'dep',
              paint: { 'fill-color': depDensityMatch(countOrgsByDept(propsRef.current.orgs)), 'fill-opacity': 1 },
            },
            {
              id: 'dep-outline',
              type: 'line',
              source: 'dep',
              paint: { 'line-color': 'rgba(230,235,242,0.65)', 'line-width': 1 },
            },
            {
              id: 'arcs-glow',
              type: 'line',
              source: 'arcs',
              paint: { 'line-color': ['get', 'color'], 'line-width': arcWidth(6), 'line-opacity': 0.10 },
            },
            {
              id: 'arcs',
              type: 'line',
              source: 'arcs',
              paint: { 'line-color': ['get', 'color'], 'line-width': arcWidth(0), 'line-opacity': 0.85 },
            },
            {
              id: 'cities',
              type: 'symbol',
              source: 'cities',
              layout: {
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-offset': [0, 1.2],
                'text-font': ['Noto Sans Regular'],
              },
              paint: { 'text-color': '#e6ebf2', 'text-halo-color': '#080b10', 'text-halo-width': 1.5 },
            },
            {
              id: 'orgs-clusters',
              type: 'circle',
              source: 'orgs',
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': 'rgba(20, 30, 38, 0.88)',
                'circle-opacity': 1,
                'circle-stroke-color': 'rgba(61, 219, 217, 0.45)',
                'circle-stroke-width': 1,
                'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 10, 14, 100, 18, 1000, 24, 10000, 30],
              },
            },
            {
              id: 'orgs-cluster-count',
              type: 'symbol',
              source: 'orgs',
              filter: ['has', 'point_count'],
              layout: {
                'text-field': ['to-string', ['get', 'point_count']],
                'text-size': ['interpolate', ['linear'], ['get', 'point_count'], 10, 11, 1000, 12, 10000, 13],
                'text-font': ['Noto Sans Regular'],
                'text-allow-overlap': true,
              },
              paint: { 'text-color': '#dfe6f0' },
            },
            {
              id: 'orgs',
              type: 'circle',
              source: 'orgs',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 6],
                'circle-color': NEUTRAL_COLOR,
                'circle-stroke-color': '#080b10',
                'circle-stroke-width': 1.5,
              },
            },
            {
              id: 'hot',
              type: 'circle',
              source: 'hot',
              paint: {
                'circle-radius': 14,
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.18,
                'circle-stroke-color': ['get', 'color'],
                'circle-stroke-width': 1.2,
                'circle-stroke-opacity': 0.6,
              },
            },
            {
              id: 'events',
              type: 'circle',
              source: 'events',
              paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': ['get', 'radius'],
                'circle-opacity': 0.92,
                'circle-stroke-color': ['get', 'stroke'],
                'circle-stroke-width': 1,
              },
            },
            {
              id: 'events-hover',
              type: 'circle',
              source: 'events',
              paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': ['+', ['get', 'radius'], 4],
                'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.22, 0],
                'circle-stroke-color': ['get', 'stroke'],
                'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
                'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0],
              },
            },
            {
              id: 'events-count',
              type: 'symbol',
              source: 'events',
              filter: ['==', ['get', 'kind'], 'cell'],
              layout: {
                'text-field': ['to-string', ['get', 'count']],
                'text-size': 11,
                'text-font': ['Noto Sans Regular'],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b0f16', 'text-halo-width': 1.5 },
            },
          ],
        },
        center: [-0.4, 44.9],
        // Le panneau du fil occupe le tiers gauche : le cadrage précédent
        // posait la région au centre du canevas et laissait un tiers d'océan.
        zoom: 6.7,
        maxPitch: 70,
        attributionControl: { compact: true },
      })

      debugWindow.__radarMap = map
      if (propsRef.current.live) map.once('load', () => startLive(map!))
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, closeOnMove: false, maxWidth: '300px', className: 'radar-popup' })

      const showPopup = (lngLat: maplibregl.LngLatLike, content: HTMLElement) => {
        popup!.setLngLat(lngLat).setDOMContent(content)
        if (!popup!.isOpen()) popup!.addTo(map!)
      }

      let hoveredId: string | number | null = null
      const setHover = (id: string | number | null) => {
        if (id === hoveredId) return
        if (hoveredId != null) {
          try { map!.removeFeatureState({ source: 'events', id: hoveredId }, 'hover') } catch { /* ignoré */ }
        }
        hoveredId = id
        if (id != null) {
          try { map!.setFeatureState({ source: 'events', id }, { hover: true }) } catch { /* ignoré */ }
        }
      }

      // Mise à jour des données sans recréer la carte (le zoom est préservé).
      const renderData = () => {
        if (disposed || !map) return
        const { orgs, events, families } = propsRef.current
        const stroke = document.documentElement.dataset.theme === 'clair' ? STROKE_LIGHT : STROKE_DARK
        const active = families && families.length > 0 ? new Set(families) : null
        const visible = active ? events.filter((e) => active!.has(e.family)) : events
        const located = visible.filter((e) => e.lat != null && e.lon != null && Number.isFinite(e.lat) && Number.isFinite(e.lon))
        const aggregate = located.length > MAX_POINTS
        const cellDeg = cellSizeDeg(map.getZoom())

        const eventFeatures = buildEventFeatures(visible, cellDeg, aggregate, stroke)
        ;(map.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: eventFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
        ;(map.getSource('orgs') as maplibregl.GeoJSONSource | undefined)?.setData(orgCollection(orgs) as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
        const deptCounts = countOrgsByDept(orgs)
        const depFeatures = DEP_FEATURES.map((f) => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: { ...f.properties, count: deptCounts.get(f.properties.code) ?? 0 },
        }))
        ;(map.getSource('dep') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: depFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
        try { map.setPaintProperty('dep', 'fill-color', depDensityMatch(deptCounts)) } catch { /* style pas prête */ }

        const hotOrgs = new Set(visible.filter((e) => e.orgId != null).map((e) => e.orgId as number))
        const hotFeatures = orgs.flatMap((o) => {
          if (o.lat == null || o.lon == null || !Number.isFinite(o.lat) || !Number.isFinite(o.lon) || !hotOrgs.has(o.id)) return []
          return [{
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] as [number, number] },
            properties: { color: NEUTRAL_COLOR },
          }]
        })
        ;(map.getSource('hot') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: hotFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])

        const orgById = new Map(orgs.map((o) => [o.id, o]))
        // Les arcs de flux (org → point d'hébergement, ou org → centroïde en
        // repli) priment ; sinon on retombe sur les liaisons org → événement.
        // Un seul tracé par destination : 284 arcs vers 12 villes donnaient
        // 568 polylignes pour un dessin illisible.
        const drafts: ArcDraft[] = flowsRef.current.length > 0
          ? flowsRef.current.map((f) => ({
              key: arcKey(f.to.lon, f.to.lat),
              coordinates: arcPoints([f.from.lon, f.from.lat], [f.to.lon, f.to.lat]),
              family: f.family,
              nature: f.nature ?? null,
              severity: f.severity,
            }))
          : visible.flatMap((e) => {
              if (e.lat == null || e.lon == null || e.orgId == null) return []
              const org = orgById.get(e.orgId)
              if (!org || org.lat == null || org.lon == null) return []
              const draft: ArcDraft = {
                key: arcKey(e.lon, e.lat),
                coordinates: arcPoints([org.lon, org.lat], [e.lon, e.lat]),
                family: e.family,
                nature: null,
                severity: e.severity ?? 0,
              }
              return [draft]
            })
        const arcFeatures = aggregateArcs(drafts)
        ;(map.getSource('arcs') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: arcFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
      }
      renderRef.current = renderData
      // Les arcs « flux » respirent : la couche de lueur pulse comme le halo
      // des orgs (boucle rAF unique, pas de recalcul de géométrie).

      const syncTheme = () => {
        applyMapTheme(map!, document.documentElement.dataset.theme ?? 'observatoire')
        renderData()
      }
      map.on('load', syncTheme)
      themeObserver = new MutationObserver(syncTheme)
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

      mapRef.current = map

      map.on('style.load', () => {
        // Le thème n'était appliqué qu'au changement : la brume et la lumière
        // ne posaient donc jamais au premier affichage.
        applyMapTheme(map!, document.documentElement.dataset.theme ?? 'observatoire')
        try { map?.setTerrain({ source: 'dem', exaggeration: 1.8 }) } catch { /* style déjà prêt */ }
      })
      map.once('load', () => map?.resize())

      // La taille de cellule dépend du zoom : on ré-agrège à la fin du zoom.
      map.on('zoomend', () => {
        clearTimeout(zoomTimer)
        zoomTimer = setTimeout(() => renderRef.current?.(), 120)
      })

      let frame = 0
      const pulse = () => {
        frame += 0.06
        if (map && map.getLayer('hot')) {
          try {
            map.setPaintProperty('hot', 'circle-radius', 12 + Math.sin(frame) * 4)
            map.setPaintProperty('hot', 'circle-opacity', 0.16 + (Math.sin(frame) + 1) * 0.06)
          } catch { /* style pas encore prête */ }
        }
        raf = requestAnimationFrame(pulse)
      }
      pulse()

      map.on('mousemove', 'events', (e) => {
        const feature = e.features?.[0]
        setHover(feature?.id != null ? feature.id : null)
        map?.getCanvas().style.setProperty('cursor', 'pointer')
      })
      map.on('mouseleave', 'events', () => {
        setHover(null)
        map?.getCanvas().style.setProperty('cursor', '')
      })
      map.on('mousemove', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', 'pointer') })
      map.on('mouseleave', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', '') })
      map.on('mousemove', 'orgs-clusters', () => { map?.getCanvas().style.setProperty('cursor', 'pointer') })
      map.on('mouseleave', 'orgs-clusters', () => { map?.getCanvas().style.setProperty('cursor', '') })

      // Un groupe n'est pas un objet : il ne s'ouvre pas, il se traverse.
      map.on('click', 'orgs-clusters', (e) => {
        const feature = e.features?.[0]
        const clusterId = feature?.properties?.cluster_id
        const geometry = feature?.geometry
        if (typeof clusterId !== 'number' || geometry == null || geometry.type !== 'Point') return
        const center = geometry.coordinates as [number, number]
        const source = map?.getSource('orgs') as maplibregl.GeoJSONSource | undefined
        source?.getClusterExpansionZoom(clusterId).then((zoom) => {
          map?.easeTo({ center, zoom, duration: 450 })
        }).catch(() => { /* source remplacée entre-temps */ })
      })

      map.on('click', 'events', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const properties = (feature.properties ?? {}) as Record<string, any>
        if (properties.kind === 'cell') {
          showPopup(e.lngLat, cellPopupContent(properties))
          return
        }
        showPopup(e.lngLat, eventPopupContent(properties))
        if (properties.id != null) onSelectEventRef.current?.(String(properties.id))
      })
      map.on('click', 'orgs', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const properties = (feature.properties ?? {}) as Record<string, any>
        if (properties.id == null) return
        showPopup(e.lngLat, orgPopupContent(properties))
        onSelectRef.current?.(`org:${properties.id}`)
      })

      syncTheme()
    }

    const observer = new ResizeObserver(() => map?.resize())
    observer.observe(ref.current)

    /**
     * Deux échecs différents, deux réponses différentes.
     *
     * Le TileJSON ne sert qu'aux bâtiments en 3D : sans lui, la carte est
     * complète, simplement plate. En revanche, si le réseau est absent au point
     * que le fetch échoue **et** que rien n'a encore été construit, on dessine
     * le style de secours : les contours départementaux et les villes sont dans
     * le bundle, donc la carte reste une carte.
     */
    const degrade = (motif: string) => {
      console.warn(`[carte] service de tuiles indisponible (${motif}) : fond vectoriel embarqué`);
      if (map !== null) return;
      ensurePopupStyles()
      map = new maplibregl.Map({
        container: ref.current as HTMLElement,
        style: styleSecours(
          { type: 'FeatureCollection', features: DEP_FEATURES },
          cityFeatures as unknown as { type: 'FeatureCollection'; features: unknown[] },
        ) as unknown as maplibregl.StyleSpecification,
        center: [0.6, 45.2],
        zoom: 5.4,
      })
      if (propsRef.current.live) map.once('load', () => startLive(map!))
    }

    fetch(OFM_TILEJSON)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json: { tiles?: string[] }) => {
        const url = json.tiles?.[0]
        if (url) buildMap(url)
        else degrade('sans url de tuiles')
      })
      .catch((error: unknown) => degrade(error instanceof Error ? error.message : 'réseau'))

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(liveRaf)
      liveCloseFeed?.()
      observer.disconnect()
      themeObserver?.disconnect()
      clearTimeout(zoomTimer)

      popup?.remove()
      map?.remove()
    }
  }, [])

  // Bascule satellite / plan sans recréer la carte.
  useEffect(() => {
    const m = mapRef.current
    if (!m || !m.getLayer('satellite') || !m.getLayer('osm')) return
    const base = props.basemap ?? 'sat'
    m.setLayoutProperty('satellite', 'visibility', base === 'sat' ? 'visible' : 'none')
    m.setLayoutProperty('osm', 'visibility', base === 'plan' ? 'visible' : 'none')
  }, [props.basemap])

  // Mise à jour des données quand les props changent (ou au chargement de la carte).
  useEffect(() => {
    flowsRef.current = props.flows ?? []
    renderRef.current?.()
  }, [props.orgs, props.events, props.families, props.flows])

  return <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
    {props.live ? <div className="live-map-badge" role="status">LIVE · {liveStatus?.count ?? 0} attacks · {liveStatus?.fps ?? 0} fps</div> : null}
    <Badge label="Nouvelle-Aquitaine" className="map3d__badge" style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 2, pointerEvents: 'none' }} />
  </div>
}
