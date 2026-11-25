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
 * - `cities` (labels de villes, ou marqueurs DOM dans le style de secours) ;
 * - `orgs` (marqueurs neutres cliquables) + `hot` (halo des orgs actives) ;
 * - `events` : cercles colorés par famille, rayon par sévérité ; au-delà de
 *   `MAX_POINTS` points, agrégation par cellule géo (compteur + famille dominante) ;
 * - `events-hover` (halo de survol), `events-count` (compteur des cellules).
 *
 * Palette exportée du pont Astryx (`FAMILY_COLORS`, partagée avec `arcs.ts`).
 */
// Le worker MapLibre n'est utile qu'à cette vue : le configurer ici garde la
// bibliothèque hors du chunk initial.
import '../maplibre-worker'
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import { FAMILY_HEX, familyHexFallback, resolveTokenColor, clearTokenCache, type FlowArc } from './arcs.js'
import { connectAttackStream, fetchLiveAttacks, LiveAttackLayer, mergeAttacks, type LiveAttack } from './live3d.js'
import DEP_GEOJSON_RAW from './departements-na.geojson?raw'
import { styleSecours } from '../offline'
import { FAMILY_LABELS, ORG_KIND_LABELS } from './libelles'
import { Badge } from '@astryxdesign/core/Badge'
import './map-timeline.css'

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

// ── Palette du pont Astryx (thème gothic unique) ────────────────────

export const FAMILY_COLORS: Record<string, string> = FAMILY_HEX
export function familyColorFallback(): string {
  return familyHexFallback()
}
/** Marqueur d'organisation : neutre (`--muted`), distinct des familles colorées. */
export function neutralColor(): string {
  return resolveTokenColor('--muted')
}

const MAP_TOKEN_NAMES = {
  buildings: ['--surface', '--surface-2', '--surface-3', '--line-strong'],
  label: '--text',
  labelHalo: '--bg',
  depLine: '--accent',
  density: '--data-teal',
  surface3: '--surface-3',
  fog: '--bg',
  fogHorizon: '--surface-3',
  lightColor: '--text',
} as const

type MapTokens = {
  buildings: string[]
  label: string
  labelHalo: string
  depLine: string
  density: string
  surface3: string
  fog: string
  fogHorizon: string
  lightColor: string
}

/** Les getters résolvent le thème après l'injection du CSS, pas à l'import. */
const MAP_TOKENS: MapTokens = new Proxy(MAP_TOKEN_NAMES as unknown as MapTokens, {
  get: (_target, property: keyof MapTokens) => {
    const names = MAP_TOKEN_NAMES[property]
    return typeof names === "string"
      ? resolveTokenColor(names)
      : names.map(resolveTokenColor)
  },
})

export { FAMILY_LABELS }

// ── Choroplèthe départements (OSM, ODbL) ────────────────────────────────

type DepFeature = {
  type: 'Feature'
  geometry: unknown
  properties: { code: string; nom: string }
}

/** Limites des 12 départements de Nouvelle-Aquitaine (propriétés `code`, `nom`). */
const DEP_FEATURES = (JSON.parse(DEP_GEOJSON_RAW) as { type: 'FeatureCollection'; features: DepFeature[] }).features

/**
 * Densité du référentiel par département : le fond reste une texture, pas une
 * alerte. La teinte vient du jeton `--data-teal` ; seule l'opacité varie.
 */
function densityOpacity(count: number): number {
  if (count <= 0) return 0
  if (count <= 200) return 0.05
  if (count <= 600) return 0.08
  if (count <= 1500) return 0.11
  if (count <= 4000) return 0.14
  return 0.18
}

/** Expression `match` sur `code`, opacité lue depuis le nombre réel d'orgs. */
function depDensityOpacity(counts: Map<string, number>): ExpressionSpecification {
  const pairs = DEP_FEATURES.flatMap((f) => [f.properties.code, densityOpacity(counts.get(f.properties.code) ?? 0)])
  return ['match', ['get', 'code'], ...pairs, 0] as unknown as ExpressionSpecification
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
/** La démo ne doit jamais dépendre d'un service de tuiles externe. */
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === 'mock'

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

/** Habillage unique : toutes les couleurs viennent du pont Astryx. */
function applyMapTheme(map: maplibregl.Map) {
  // Le style de secours n'a ni fond raster, ni bâtiments, ni couche de texte :
  // on ne touche que les couches réellement présentes.
  const paint = (layer: string, property: string, value: unknown) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer as never, property as never, value as never)
  }
  paint('osm', 'raster-brightness-max', 0.42)
  paint('osm', 'raster-saturation', -0.92)
  paint('osm', 'raster-contrast', 0.18)
  paint('buildings', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
    0, MAP_TOKENS.buildings[0], 8, MAP_TOKENS.buildings[1], 25, MAP_TOKENS.buildings[2], 60, MAP_TOKENS.buildings[3]])
  paint('cities', 'text-color', MAP_TOKENS.label)
  paint('cities', 'text-halo-color', MAP_TOKENS.labelHalo)
  paint('orgs', 'circle-stroke-color', MAP_TOKENS.labelHalo)
  paint('dep-outline', 'line-color', MAP_TOKENS.depLine)

  // Ambiance : ciel, horizon et brume au sol, plus une lumière rasante sur les
  // volumes. Purement natif MapLibre 6 (`setSky`, `setLight`).
  try {
    map.setSky({
      'sky-color': MAP_TOKENS.fogHorizon,
      'horizon-color': MAP_TOKENS.fog,
      'fog-color': MAP_TOKENS.fog,
      'sky-horizon-blend': 0.35,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.15,
      'atmosphere-blend': 0.6,
    })
    map.setLight({
      anchor: 'viewport',
      color: MAP_TOKENS.lightColor,
      intensity: 0.5,
      position: [1.6, 88, 55],
    })
  } catch {
    // Style pas encore prêt : l'ambiance sera posée au prochain `style.load`.
  }
}

/** Couleur unique des arcs agrégés par destination. */
function aggregateArcColor(): string {
  return resolveTokenColor('--accent')
}

/** Arc candidat, avant regroupement par destination. */
type ArcDraft = {
  /** Destination arrondie (~11 m) : clé de regroupement. */
  key: string
  /** Extrémités : la géométrie n'est calculée qu'en cas de cache miss. */
  from: [number, number]
  to: [number, number]
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
          geometry: { type: 'LineString', coordinates: arcPoints(draft.from, draft.to) },
          properties: { family: draft.family, nature: draft.nature, color: aggregateArcColor(), count: 1 },
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
      color: FAMILY_COLORS[e.family] ?? familyColorFallback(),
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
      color: FAMILY_COLORS[dominant] ?? familyColorFallback(),
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
  color: var(--accent-ink);
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
  chip.style.background = FAMILY_COLORS[key] ?? familyColorFallback()
  return chip
}

function eventPopupContent(p: FeatureProperties): HTMLElement {
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

function cellPopupContent(p: FeatureProperties): HTMLElement {
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
      dot.style.background = FAMILY_COLORS[key] ?? familyColorFallback()
      row.appendChild(dot)
      row.appendChild(el('span', '', `${FAMILY_LABELS[key] ?? key} · ${entry[1]}`))
      list.appendChild(row)
    }
    root.appendChild(list)
  }
  root.appendChild(el('div', 'radar-popup-hint', 'Zoomez pour détailler'))
  return root
}

interface FeatureProperties {
  kind?: string;
  id?: string | number;
  family?: string;
  severity?: number;
  title?: string;
  sourceId?: string;
  observedAt?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  count?: number;
  families?: Array<[string, number]>;
  name?: string;
  city?: string | null;
}

// Les fonctions de popup acceptent FeatureProperties (champs optionnels,
// accessibles en toute sécurité avec ?? et typeof).

function orgPopupContent(p: FeatureProperties): HTMLElement {
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
  const liveControlRef = useRef<{ start: () => void; stop: () => void } | null>(null)
  const [liveStatus, setLiveStatus] = useState<{ count: number; fps: number } | null>(null)
  const [mapUnavailable, setMapUnavailable] = useState(false)


  // Création unique de la carte.
  useEffect(() => {
    if (!ref.current) return
    let disposed = false
    let map: maplibregl.Map | null = null
    let popup: maplibregl.Popup | null = null
    let pulseRaf = 0
    let pulsing = false
    let pulseFrame = 0
    let liveLayer: LiveAttackLayer | null = null
    let liveRaf = 0
    let liveCloseFeed: (() => void) | null = null
    let liveAbort: AbortController | null = null
    let liveWanted = false
    let liveAttacks: LiveAttack[] = []
    let tileAbort: AbortController | null = null
    let degraded = false
    let webglFailed = false
    let tileErrors = 0
    let tileErrorAt = 0
    let cityMarkers: HTMLElement[] = []
    let dataCache: {
      orgs: MapOrg[] | null
      events: MapEvent[] | null
      families: string
      cellDeg: number
      eventFeatures: Record<string, unknown>[] | null
      orgFeatures: OrgCollection | null
      depFeatures: unknown[] | null
      hotFeatures: unknown[] | null
      arcKey: string
      arcFeatures: ArcFeature[]
    } = {
      orgs: null, events: null, families: '', cellDeg: Number.NaN,
      eventFeatures: null, orgFeatures: null, depFeatures: null, hotFeatures: null,
      arcKey: '', arcFeatures: [],
    }

    const invalidateCache = () => {
      clearTokenCache()
      dataCache.orgs = null
      dataCache.events = null
      dataCache.families = ''
      dataCache.cellDeg = Number.NaN
      dataCache.eventFeatures = null
      dataCache.orgFeatures = null
      dataCache.depFeatures = null
      dataCache.hotFeatures = null
    }

    const stopPulse = () => {
      pulsing = false
      if (pulseRaf !== 0) cancelAnimationFrame(pulseRaf)
      pulseRaf = 0
    }
    const startPulse = () => {
      if (pulsing || disposed) return
      pulsing = true
      const step = () => {
        if (disposed || !pulsing) return
        pulseFrame += 0.06
        const current = map
        if (current?.getLayer('hot')) {
          try {
            current.setPaintProperty('hot', 'circle-radius', 12 + Math.sin(pulseFrame) * 4)
            current.setPaintProperty('hot', 'circle-opacity', 0.16 + (Math.sin(pulseFrame) + 1) * 0.06)
          } catch { /* style pas encore prêt */ }
        }
        pulseRaf = requestAnimationFrame(step)
      }
      pulseRaf = requestAnimationFrame(step)
    }

    const clearCityMarkers = () => {
      for (const marker of cityMarkers) marker.remove()
      cityMarkers = []
    }
    const placeCityMarkers = () => {
      const current = map
      if (!current || cityMarkers.length === 0) return
      CITY_LABELS.forEach(([, lon, lat], index) => {
        const point = current.project([lon, lat]) as { x: number; y: number }
        cityMarkers[index]!.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`
      })
    }
    const showCityMarkers = () => {
      clearCityMarkers()
      const container = ref.current
      if (!container) return
      for (const [name] of CITY_LABELS) {
        const marker = el('span', 'radar-map-city', name)
        container.appendChild(marker)
        cityMarkers.push(marker)
      }
      placeCityMarkers()
    }

    /** One WebGL2 layer, one draw call per frame, a single rAF loop. */
    const attachLive = (target: maplibregl.Map) => {
      if (disposed || !liveWanted || map !== target || liveLayer) return
      try {
        const layer = new LiveAttackLayer()
        target.addLayer(layer as unknown as maplibregl.CustomLayerInterface)
        liveLayer = layer
        layer.setAttacks(liveAttacks)
        let lastTick = 0
        let statusAt = 0
        let lastFrames = 0
        const tick = (now: number) => {
          if (disposed || !liveWanted || map !== target || !liveLayer) return
          if (now - lastTick >= 16) {
            lastTick = now
            target.triggerRepaint()
          }
          if (now - statusAt >= 1000) {
            const frames = liveLayer.frames
            if (!disposed) setLiveStatus({
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
      liveAbort?.abort()
      liveAbort = new AbortController()
      void fetchLiveAttacks('/api/live-map', liveAbort.signal).then((list) => {
        if (disposed || !liveWanted || map !== target) return
        liveAttacks = list
        liveLayer?.setAttacks(list)
      }).catch(() => {})
      liveCloseFeed = connectAttackStream('/api/live-map/stream', (attack) => {
        if (disposed || !liveWanted || map !== target) return
        liveAttacks = mergeAttacks(liveAttacks, [attack])
        liveLayer?.setAttacks(liveAttacks)
      })
    }
    const startLive = () => {
      liveWanted = true
      const target = map
      if (disposed || !target || liveLayer) return
      if (typeof target.isStyleLoaded === 'function' && target.isStyleLoaded()) attachLive(target)
      else target.once('load', () => attachLive(target))
    }
    const stopLive = () => {
      liveWanted = false
      if (liveRaf !== 0) cancelAnimationFrame(liveRaf)
      liveRaf = 0
      liveAbort?.abort()
      liveAbort = null
      liveCloseFeed?.()
      liveCloseFeed = null
      const layer = liveLayer
      liveLayer = null
      if (layer) {
        try { map?.removeLayer(layer.id) } catch { layer.onRemove() }
      }
      if (!disposed) setLiveStatus(null)
    }
    liveControlRef.current = { start: startLive, stop: stopLive }
    let zoomTimer: ReturnType<typeof setTimeout> | undefined

    const cityFeatures = {
      type: 'FeatureCollection' as const,
      features: CITY_LABELS.map(([name, lon, lat]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
        properties: { name },
      })),
    }

    const onlineStyle = (ofmUrl: string) => ({
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
            // Le fond demandé est actif dès la première image : l'effet
            // [basemap] ne peut pas agir avant la création de la carte, qui
            // attend le TileJSON. Sa valeur initiale vient donc des props ici.
            { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: propsRef.current.basemap === 'plan' ? 'visible' : 'none' }, paint: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.92, 'raster-contrast': 0.18 } },
            // Imagerie satellite assombrie : lisible sous les calques de données.
            { id: 'satellite', type: 'raster', source: 'sat', layout: { visibility: propsRef.current.basemap === 'sat' || propsRef.current.basemap === undefined ? 'visible' : 'none' }, paint: {
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
                  0, MAP_TOKENS.buildings[0], 8, MAP_TOKENS.buildings[1], 25, MAP_TOKENS.buildings[2], 60, MAP_TOKENS.buildings[3]],
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.9,
              },
            },
            {
              id: 'dep',
              type: 'fill',
              source: 'dep',
              paint: { 'fill-color': MAP_TOKENS.density, 'fill-opacity': depDensityOpacity(countOrgsByDept(propsRef.current.orgs)) },
            },
            {
              id: 'dep-outline',
              type: 'line',
              source: 'dep',
              paint: { 'line-color': MAP_TOKENS.depLine, 'line-opacity': 0.55, 'line-width': 1 },
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
              paint: { 'text-color': MAP_TOKENS.label, 'text-halo-color': MAP_TOKENS.labelHalo, 'text-halo-width': 1.5 },
            },
            {
              id: 'orgs-clusters',
              type: 'circle',
              source: 'orgs',
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': MAP_TOKENS.surface3,
                'circle-opacity': 0.88,
                'circle-stroke-color': MAP_TOKENS.density,
                'circle-stroke-opacity': 0.45,
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
              paint: { 'text-color': MAP_TOKENS.label },
            },
            {
              id: 'orgs',
              type: 'circle',
              source: 'orgs',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 6],
                'circle-color': neutralColor(),
                'circle-stroke-color': MAP_TOKENS.labelHalo,
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
              paint: { 'text-color': MAP_TOKENS.label, 'text-halo-color': MAP_TOKENS.labelHalo, 'text-halo-width': 1.5 },
            },
          ],
    }) as unknown as maplibregl.StyleSpecification

    const applyBasemap = () => {
      const current = map
      if (!current?.getLayer('osm') || !current.getLayer('satellite')) return
      const base = propsRef.current.basemap ?? 'sat'
      try {
        current.setLayoutProperty('satellite', 'visibility', base === 'sat' ? 'visible' : 'none')
        current.setLayoutProperty('osm', 'visibility', base === 'plan' ? 'visible' : 'none')
      } catch { /* style pas encore prêt */ }
    }

    /**
     * Dernier recours : sans WebGL2, MapLibre ne peut pas créer de canevas,
     * même avec le style embarqué. On garde un fond lisible et un message,
     * sans laisser une exception traverser la chaîne d'initialisation.
     */
    const showStaticFallback = (motif: string) => {
      if (disposed || !ref.current || webglFailed) return
      webglFailed = true
      console.warn(`[carte] rendu WebGL indisponible (${motif}) : fond statique embarqué`)
      stopLive()
      stopPulse()
      clearCityMarkers()
      const failed = map
      if (failed && debugWindow.__radarMap === failed) delete debugWindow.__radarMap
      map = null
      mapRef.current = null
      renderRef.current = null
      popup?.remove()
      popup = null
      if (!disposed) setMapUnavailable(true)
    }

    const onMapError = (event: maplibregl.ErrorEvent) => {
      if (disposed) return
      const message = String(event?.error?.message ?? '')
      if (/webgl|gpu/i.test(message)) {
        showStaticFallback(message)
        return
      }
      if (degraded) return
      const now = Date.now()
      if (now - tileErrorAt > 60_000) {
        tileErrorAt = now
        tileErrors = 0
      }
      tileErrors += 1
      // Le TileJSON peut venir du cache du SW : ce sont les échecs de tuiles
      // réels qui déclenchent le repli, pas l'échec du seul document JSON.
      if (tileErrors >= 3) degrade('tuiles ou style indisponibles')
    }

    const buildMap = (
      style: maplibregl.StyleSpecification,
      options: { center?: [number, number]; zoom?: number } = {},
    ) => {
      if (disposed || !ref.current) return
      stopLive()
      stopPulse()
      clearCityMarkers()
      invalidateCache()
      if (map !== null) {
        popup?.remove()
        map.remove()
        if (debugWindow.__radarMap === map) delete debugWindow.__radarMap
        map = null
        popup = null
        renderRef.current = null
        mapRef.current = null
      }
      ensurePopupStyles()
      try {
        map = new maplibregl.Map({
          container: ref.current,
          style,
          center: options.center ?? [-0.4, 44.9],
          // Le panneau du fil occupe le tiers gauche : le cadrage précédent
          // posait la région au centre du canevas et laissait un tiers d'océan.
          zoom: options.zoom ?? 6.7,
          maxPitch: 70,
          attributionControl: { compact: true },
        })
        map.on('error', onMapError)
        map.on('move', placeCityMarkers)
        if (liveWanted) startLive()
        setupMap()
      } catch (error) {
        showStaticFallback(error instanceof Error ? error.message : 'initialisation MapLibre')
      }
    }

    const setupMap = () => {
      const carte = map
      if (!carte) return
      debugWindow.__radarMap = carte

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
        const current = map
        const { orgs, events, families } = propsRef.current
        const stroke = MAP_TOKENS.labelHalo
        const active = families && families.length > 0 ? new Set(families) : null
        const familiesKey = active ? [...active].sort().join('|') : ''
        const visible = active ? events.filter((e) => active!.has(e.family)) : events
        const located = visible.filter((e) => e.lat != null && e.lon != null && Number.isFinite(e.lat) && Number.isFinite(e.lon))
        const aggregate = located.length > MAX_POINTS
        const cellDeg = cellSizeDeg(current.getZoom())
        const unchanged = dataCache.orgs === orgs && dataCache.events === events
          && dataCache.families === familiesKey && dataCache.cellDeg === cellDeg

        if (!unchanged) {
          const eventFeatures = buildEventFeatures(visible, cellDeg, aggregate, stroke)
          const orgFeatures = orgCollection(orgs)
          const deptCounts = countOrgsByDept(orgs)
          const depFeatures = DEP_FEATURES.map((f) => ({
            type: 'Feature' as const,
            geometry: f.geometry,
            properties: { ...f.properties, count: deptCounts.get(f.properties.code) ?? 0 },
          }))
          const hotOrgs = new Set(visible.filter((e) => e.orgId != null).map((e) => e.orgId as number))
          const hotFeatures = orgs.flatMap((o) => {
            if (o.lat == null || o.lon == null || !Number.isFinite(o.lat) || !Number.isFinite(o.lon) || !hotOrgs.has(o.id)) return []
            return [{
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] as [number, number] },
              properties: { color: neutralColor() },
            }]
          })
          ;(current.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: eventFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
          ;(current.getSource('orgs') as maplibregl.GeoJSONSource | undefined)?.setData(orgFeatures as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
          ;(current.getSource('dep') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: depFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
          ;(current.getSource('hot') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: hotFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
          try { current.setPaintProperty('dep', 'fill-opacity', depDensityOpacity(deptCounts)) } catch { /* style pas prête */ }
          dataCache.orgs = orgs
          dataCache.events = events
          dataCache.families = familiesKey
          dataCache.cellDeg = cellDeg
          dataCache.eventFeatures = eventFeatures
          dataCache.orgFeatures = orgFeatures
          dataCache.depFeatures = depFeatures
          dataCache.hotFeatures = hotFeatures
        }

        // Une pulsation sans point chaud est une boucle GPU à vide.
        if (dataCache.hotFeatures && dataCache.hotFeatures.length > 0) startPulse()
        else stopPulse()

        const orgById = new Map(orgs.map((o) => [o.id, o]))
        // Les arcs de flux (org → point d'hébergement, ou org → centroïde en
        // repli) priment ; sinon on retombe sur les liaisons org → événement.
        // Un seul tracé par destination : 284 arcs vers 12 villes donnaient
        // 568 polylignes pour un dessin illisible.
        const drafts: ArcDraft[] = flowsRef.current.length > 0
          ? flowsRef.current.map((f) => ({
              key: arcKey(f.to.lon, f.to.lat),
              from: [f.from.lon, f.from.lat] as [number, number],
              to: [f.to.lon, f.to.lat] as [number, number],
              family: f.family,
              nature: f.nature ?? null,
              severity: f.severity,
            }))
          : visible.flatMap((e) => {
              if (e.lat == null || e.lon == null || e.orgId == null) return []
              const org = orgById.get(e.orgId)
              if (!org || org.lat == null || org.lon == null) return []
              return [{
                key: arcKey(e.lon, e.lat),
                from: [org.lon, org.lat] as [number, number],
                to: [e.lon, e.lat] as [number, number],
                family: e.family,
                nature: null,
                severity: e.severity ?? 0,
              }]
            })
        // Clé bon marché : 33 points par arc ne sont reconstruits que si une
        // extrémité, une famille ou une sévérité change réellement.
        const arcSignature = drafts.map((d) =>
          `${d.key}|${d.from[0]}|${d.from[1]}|${d.to[0]}|${d.to[1]}|${d.family}|${d.nature}|${d.severity}`).join(';')
        if (arcSignature !== dataCache.arcKey) {
          const arcFeatures = aggregateArcs(drafts)
          ;(current.getSource('arcs') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: arcFeatures } as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0])
          dataCache.arcKey = arcSignature
          dataCache.arcFeatures = arcFeatures
        }
      }
      renderRef.current = renderData

      const syncTheme = () => {
        invalidateCache()
        applyBasemap()
        applyMapTheme(map!)
        renderData()
      }
      carte.on('load', syncTheme)

      mapRef.current = map

      carte.on('style.load', () => {
        // Brume et lumière sont reposées à chaque rechargement du style.
        invalidateCache()
        applyMapTheme(map!)
        applyBasemap()
        try { map?.setTerrain({ source: 'dem', exaggeration: 1.8 }) } catch { /* style déjà prêt */ }
      })
      carte.once('load', () => {
        applyBasemap()
        map?.resize()
      })

      // La taille de cellule dépend du zoom : on ré-agrège à la fin du zoom.
      carte.on('zoomend', () => {
        clearTimeout(zoomTimer)
        zoomTimer = setTimeout(() => renderRef.current?.(), 120)
      })


      carte.on('mousemove', 'events', (e) => {
        const feature = e.features?.[0]
        setHover(feature?.id != null ? feature.id : null)
        map?.getCanvas().style.setProperty('cursor', 'pointer')
      })
      carte.on('mouseleave', 'events', () => {
        setHover(null)
        map?.getCanvas().style.setProperty('cursor', '')
      })
      carte.on('mousemove', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', 'pointer') })
      carte.on('mouseleave', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', '') })
      carte.on('mousemove', 'orgs-clusters', () => { map?.getCanvas().style.setProperty('cursor', 'pointer') })
      carte.on('mouseleave', 'orgs-clusters', () => { map?.getCanvas().style.setProperty('cursor', '') })

      // Un groupe n'est pas un objet : il ne s'ouvre pas, il se traverse.
      carte.on('click', 'orgs-clusters', (e) => {
        const feature = e.features?.[0]
        const clusterId = feature?.properties?.cluster_id
        const geometry = feature?.geometry
        if (typeof clusterId !== 'number' || geometry == null || geometry.type !== 'Point') return
        const center = geometry.coordinates as [number, number]
        const source = map?.getSource('orgs') as maplibregl.GeoJSONSource | undefined
        const target = map
        source?.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (disposed || map !== target) return
          target?.easeTo({ center, zoom, duration: 450 })
        }).catch(() => { /* source remplacée entre-temps */ })
      })

      carte.on('click', 'events', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const properties = (feature.properties ?? {}) as FeatureProperties
        if (properties.kind === 'cell') {
          showPopup(e.lngLat, cellPopupContent(properties))
          return
        }
        showPopup(e.lngLat, eventPopupContent(properties))
        if (properties.id != null) onSelectEventRef.current?.(String(properties.id))
      })
      carte.on('click', 'orgs', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const properties = (feature.properties ?? {}) as FeatureProperties
        if (properties.id == null) return
        showPopup(e.lngLat, orgPopupContent(properties))
        onSelectRef.current?.(`org:${properties.id}`)
      })

      // Le thème et les données sont appliqués par l'événement load, une fois
      // le style MapLibre réellement prêt.
    }

    const observer = new ResizeObserver(() => map?.resize())
    observer.observe(ref.current)

    /**
     * Repli hors ligne : le TileJSON peut être servi du cache du SW alors que
     * les tuiles, elles, ne le sont pas — les erreurs de tuiles (`onMapError`)
     * ou un navigateur hors ligne déclenchent donc aussi ce style embarqué.
     * `buildMap` est réutilisé : la carte de secours a les mêmes sources,
     * handlers et boucle de rendu que la carte normale.
     */
    const degrade = (motif: string, silencieux = false) => {
      if (disposed || !ref.current || webglFailed) return
      if (!silencieux) console.warn(`[carte] service de tuiles indisponible (${motif}) : fond vectoriel embarqué`)
      degraded = true
      const centre = map?.getCenter?.() ?? { lng: 0.6, lat: 45.2 }
      const zoom = map?.getZoom?.() ?? 5.4
      const style = styleSecours(
        { type: 'FeatureCollection', features: DEP_FEATURES },
        cityFeatures as unknown as { type: 'FeatureCollection'; features: unknown[] },
      ) as unknown as maplibregl.StyleSpecification
      buildMap(style, { center: [centre.lng, centre.lat], zoom })
      // Aucune police n'est embarquée : les villes sont des marqueurs DOM
      // stylés avec les jetons du pont, pas une couche `symbol` orpheline.
      if (map) showCityMarkers()
    }

    const onOffline = () => degrade('navigateur hors ligne')
    window.addEventListener('offline', onOffline)

    if (MOCK_MODE) {
      // Aucun appel réseau en démo : ni TileJSON, ni glyphs, ni tuiles OFM.
      degrade('mode démonstration', true)
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      degrade('navigateur hors ligne')
    } else {
      tileAbort = new AbortController()
      const signal = tileAbort.signal
      fetch(OFM_TILEJSON, { signal })
        .then((r) => {
          if (disposed || signal.aborted) throw new Error('requête annulée')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((json: { tiles?: string[] }) => {
          if (disposed || signal.aborted) return
          const url = json.tiles?.[0]
          if (url) buildMap(onlineStyle(url))
          else degrade('sans url de tuiles')
        })
        .catch((error: unknown) => {
          if (disposed || signal.aborted) return
          degrade(error instanceof Error ? error.message : 'réseau')
        })
    }

    return () => {
      disposed = true
      stopLive()
      stopPulse()
      liveControlRef.current = null
      if (debugWindow.__radarMap === map) delete debugWindow.__radarMap
      tileAbort?.abort()
      window.removeEventListener('offline', onOffline)
      observer.disconnect()
      clearTimeout(zoomTimer)
      clearCityMarkers()
      popup?.remove()
      popup = null
      map?.remove()
      map = null
      mapRef.current = null
      renderRef.current = null
    }
  }, [])

  // Démarrage et arrêt complets du flux live, indépendamment de la création
  // de la carte (le TileJSON peut arriver après un changement de prop).
  useEffect(() => {
    if (props.live) liveControlRef.current?.start()
    else liveControlRef.current?.stop()
    return () => { liveControlRef.current?.stop() }
  }, [props.live])

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
    {mapUnavailable ? (
      <div
        className="radar-map-unavailable"
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, textAlign: 'center', background: 'var(--bg, #0b0f14)', color: 'var(--text, #e6edf3)' }}
      >
        <strong>Carte interactive indisponible</strong>
        <span>Cet appareil ne prend pas en charge WebGL2. Les données restent consultables dans les autres panneaux.</span>
        <span>{CITY_LABELS.map(([name]) => name).join(' · ')}</span>
      </div>
    ) : null}
    {props.live ? <div className="live-map-badge" role="status">LIVE · {liveStatus?.count ?? 0} attacks · {liveStatus?.fps ?? 0} fps</div> : null}
    <Badge label="Nouvelle-Aquitaine" className="map3d__badge" style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 2, pointerEvents: 'none' }} />
  </div>
}
