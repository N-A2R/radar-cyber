import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'

type Org = { id: number; name: string; slug: string; kind: string; city: string | null; lat: number | null; lon: number | null }
type Event = { id: string; title: string; family: string; assertionType: string; orgId: number | null; lat: number | null; lon: number | null }

const KIND_COLORS: Record<string, string> = {
  entreprise: '#38bdf8',
  collectivite: '#f59e0b',
  sante: '#ec4899',
  enseignement: '#10b981',
  recherche: '#22c55e',
  operateur_critique: '#ef4444',
  ess: '#8b5cf6',
}
const FAMILY_COLORS: Record<string, string> = {
  ransomware: '#ef4444',
  vuln: '#f59e0b',
  phishing: '#a855f7',
  malware: '#ec4899',
  cert_fr: '#38bdf8',
  cert: '#22d3ee',
  typosquat: '#facc15',
  reputation: '#94a3b8',
  cti: '#64748b',
}

const CITY_LABELS: [string, number, number][] = [
  ['Bordeaux', -0.5792, 44.8378], ['La Rochelle', -1.152, 46.1591], ['Poitiers', 0.3404, 46.5802],
  ['Limoges', 1.2611, 45.8336], ['Pau', -0.3708, 43.2951], ['Bayonne', -1.4748, 43.4929],
  ['Angoulême', 0.1562, 45.6484], ['Niort', -0.4588, 46.3238], ['Agen', 0.6211, 44.2022],
  ['Périgueux', 0.7213, 45.1841], ['Bergerac', 0.4831, 44.8531], ['Arcachon', -1.1688, 44.6586],
  ['Cognac', -0.3294, 45.6959], ['Rochefort', -0.9667, 45.9421], ['Saintes', -0.6333, 45.7466],
  ['Brive-la-Gaillarde', 1.5333, 45.15], ['Guéret', 1.8703, 46.1706], ['Tulle', 1.7672, 45.2667],
  ['Mont-de-Marsan', -0.4997, 43.8907], ['Dax', -1.0536, 43.7102],
]

// Bâtiments 3D : tuiles vectorielles OpenFreeMap (OSM, hauteurs incluses, sans clé).
const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet'

// Habillage de la carte selon la variante de design (data-theme sur <html>).
const MAP_THEMES: Record<string, { tiles: string[]; raster: Record<string, number>; buildings: string[]; label: string; labelHalo: string; orgStroke: string }> = {
  clair: {
    tiles: ['https://tiles.basemaps.cartocdn.com/light_all/{z}/{x}{r}.png'],
    raster: { 'raster-brightness-max': 1, 'raster-saturation': 0, 'raster-contrast': 0 },
    buildings: ['#e8e4dd', '#dcd6cb', '#cfc6b8', '#bdb2a1'],
    label: '#1f2937', labelHalo: '#ffffff', orgStroke: '#ffffff',
  },
}
const MAP_THEME_DARK = {
  raster: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.92, 'raster-contrast': 0.18 },
  buildings: ['#1b2230', '#2b3542', '#3d4a5c', '#5a6b82'],
  label: '#e6ebf2', labelHalo: '#080b10', orgStroke: '#080b10',
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

type OrgCollection = { type: 'FeatureCollection'; features: Record<string, unknown>[] }

function orgCollection(orgs: Org[]): OrgCollection {
  return {
    type: 'FeatureCollection',
    features: orgs.flatMap((o) => {
      if (o.lat == null || o.lon == null) return []
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.lon, o.lat] as [number, number] },
        properties: { id: o.id, name: o.name, kind: o.kind, color: KIND_COLORS[o.kind] ?? '#cbd5e1' },
      }]
    }),
  }
}

export default function Map3D(props: { orgs: Org[]; events: Event[]; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect

  // Création unique de la carte.
  useEffect(() => {
    if (!ref.current) return
    let disposed = false
    let map: maplibregl.Map | null = null
    let raf = 0
    let themeObserver: MutationObserver | null = null

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
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {
            osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 },
            dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium' },
            ofm: { type: 'vector', tiles: [ofmUrl], minzoom: 0, maxzoom: 14 },
            orgs: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            hot: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            cities: { type: 'geojson', data: cityFeatures },
            arcs: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-brightness-max': 0.42, 'raster-saturation': -0.92, 'raster-contrast': 0.18 } },
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
              id: 'arcs-glow',
              type: 'line',
              source: 'arcs',
              paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': 0.12 },
            },
            {
              id: 'arcs',
              type: 'line',
              source: 'arcs',
              paint: { 'line-color': ['get', 'color'], 'line-width': 1.8, 'line-opacity': 0.9 },
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
              id: 'orgs',
              type: 'circle',
              source: 'orgs',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 13, 11],
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#080b10',
                'circle-stroke-width': 2,
              },
            },
          ],
        },
        center: [-0.5792, 44.8378],
        zoom: 6.5,
        maxPitch: 70,
      })

      debugWindow.__radarMap = map
      const syncTheme = () => applyMapTheme(map!, document.documentElement.dataset.theme ?? 'observatoire')
      map.on('load', syncTheme)
      themeObserver = new MutationObserver(syncTheme)
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      syncTheme()

      map.on('style.load', () => {
        try { map?.setTerrain({ source: 'dem', exaggeration: 1.8 }) } catch { /* style déjà prêt */ }
      })
      map.once('load', () => map?.resize())

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

      map.on('click', 'orgs', (e) => {
        const id = e.features?.[0]?.properties?.id
        if (id != null) onSelectRef.current?.(`org:${id}`)
      })
      map.on('mouseenter', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', 'pointer') })
      map.on('mouseleave', 'orgs', () => { map?.getCanvas().style.setProperty('cursor', '') })
    }

    const observer = new ResizeObserver(() => map?.resize())
    observer.observe(ref.current)

    fetch(OFM_TILEJSON)
      .then((r) => r.json())
      .then((json: { tiles?: string[] }) => {
        const url = json.tiles?.[0]
        if (url) buildMap(url)
      })
      .catch(() => { /* pas de bâtiments si le service est indisponible */ })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      themeObserver?.disconnect()
      map?.remove()
    }
  }, [])

  // Mise à jour des données sans recréer la carte (le zoom est préservé).
  useEffect(() => {
    const map = debugWindow.__radarMap as maplibregl.Map | undefined
    if (!map) return

    const orgs = orgCollection(props.orgs)
    ;(map.getSource('orgs') as maplibregl.GeoJSONSource)?.setData(orgs)

    const hotOrgs = new Set(props.events.filter((e) => e.orgId != null).map((e) => e.orgId as number))
    const hot = {
      type: 'FeatureCollection',
      features: props.orgs.flatMap((o) => {
        if (o.lat == null || o.lon == null || !hotOrgs.has(o.id)) return []
        return [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [o.lon, o.lat] },
          properties: { color: KIND_COLORS[o.kind] ?? '#cbd5e1' },
        }]
      }),
    }
    ;(map.getSource('hot') as maplibregl.GeoJSONSource)?.setData(hot)

    const orgById = new Map(props.orgs.map((o) => [o.id, o]))
    const arcs = {
      type: 'FeatureCollection',
      features: props.events.flatMap((e) => {
        if (e.lat == null || e.lon == null || e.orgId == null) return []
        const org = orgById.get(e.orgId)
        if (!org || org.lat == null || org.lon == null) return []
        return [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: arcPoints([org.lon, org.lat], [e.lon, e.lat]) },
          properties: { family: e.family, color: FAMILY_COLORS[e.family] ?? '#cbd5e1' },
        }]
      }),
    }
    ;(map.getSource('arcs') as maplibregl.GeoJSONSource)?.setData(arcs)
  }, [props.orgs, props.events])

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
