// @vitest-environment jsdom
/**
 * Régressions de la vue Carte : fond visible au premier rendu, repli hors ligne
 * complet, arrêt du flux live et absence de fuite au démontage.
 * MapLibre est simulé : c'est le contrat observable (style, layout, sources,
 * abonnements) qui est testé, pas le moteur WebGL.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Map3D, { type Map3DProps } from '../src/map/Map3D'
import { styleSecours } from '../src/offline'
import { clearTokenCache, resolveTokenColor } from '../src/map/arcs'

const TILEJSON = 'https://tiles.openfreemap.org/planet'

type Listener = (value: unknown) => void
type FakeLayer = { id: string; type?: string; layout?: Record<string, unknown> }
type FakeStyle = {
  layers: FakeLayer[]
  sources: Record<string, unknown>
  glyphs?: unknown
  sprite?: unknown
}
type MockCall = { mock: { calls: unknown[][] } }
type FakeSourceLike = { setData: MockCall; getClusterExpansionZoom: () => Promise<number> }
type FakeMapLike = {
  style: FakeStyle
  removed: boolean
  zoom: number
  layers: Map<string, FakeLayer>
  layouts: Map<string, Record<string, unknown>>
  sources: Map<string, FakeSourceLike>
  getLayer(id: string): FakeLayer | undefined
  getLayoutProperty(id: string, property: string): unknown
  setLayoutProperty(id: string, property: string, value: unknown): void
  getSource(id: string): FakeSourceLike | undefined
  setZoom(value: number): void
  fire(type: string, payload?: unknown): void
  remove(): void
}
type FakeMapOptions = { style: FakeStyle; zoom?: number }


vi.mock('../src/map/departements-na.geojson?raw', () => ({
  default: '{"type":"FeatureCollection","features":[]}',
}))
const rig = vi.hoisted(() => ({
  maps: [] as FakeMapLike[],
  eventSources: [] as Array<{ url: string; closed: boolean }>,
  fetchCalls: [] as Array<{ url: string; init?: RequestInit }>,
  rafCallbacks: new Map<number, () => void>(),
  nextRaf: 1,
  fetchImpl: null as null | ((url: string, init?: RequestInit) => Promise<unknown>),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => {
  class FakeSource {
    setData = vi.fn()
    getClusterExpansionZoom = vi.fn().mockResolvedValue(8)
  }
  class FakeMap {
    style: FakeStyle
    layers = new Map<string, FakeLayer>()
    layouts = new Map<string, Record<string, unknown>>()
    sources = new Map<string, FakeSourceLike>()
    listeners = new Map<string, Listener[]>()
    customLayers: FakeLayer[] = []
    removed = false
    zoom: number

    constructor(options: FakeMapOptions) {
      this.style = options.style
      this.zoom = options.zoom ?? 6.7
      for (const layer of options.style.layers ?? []) {
        this.layers.set(layer.id, layer)
        if (layer.layout) this.layouts.set(layer.id, { ...layer.layout })
      }
      for (const id of Object.keys(options.style.sources ?? {})) this.sources.set(id, new FakeSource())
      rig.maps.push(this)
    }
    getLayer(id: string) { return this.layers.get(id) }
    getLayoutProperty(id: string, property: string) { return this.layouts.get(id)?.[property] }
    setLayoutProperty(id: string, property: string, value: unknown) {
      const layout = this.layouts.get(id) ?? {}
      layout[property] = value
      this.layouts.set(id, layout)
    }
    getSource(id: string) { return this.sources.get(id) }
    setPaintProperty() { return this }
    setSky() { return this }
    setLight() { return this }
    setTerrain() { return this }
    setZoom(value: number) { this.zoom = value }
    getZoom() { return this.zoom }
    getCenter() { return { lng: 0.6, lat: 45.2 } }
    project() { return { x: 10, y: 20 } }
    resize() { return this }
    triggerRepaint() { return this }
    getCanvas() { return { style: { setProperty() {} } } }
    setFeatureState() {}
    removeFeatureState() {}
    easeTo() { return this }
    addLayer(layer: FakeLayer) { this.customLayers.push(layer); this.layers.set(layer.id, layer) }
    removeLayer(id: string) {
      this.layers.delete(id)
      this.customLayers = this.customLayers.filter((item) => item.id !== id)
    }
    on(type: string, layerOrHandler: unknown, maybeHandler?: unknown) {
      const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler
      if (typeof handler === 'function') this.listen(type, handler as Listener)
      return this
    }
    once(type: string, handler: Listener) {
      const wrapped: Listener = (value) => { this.off(type, wrapped); handler(value) }
      this.listen(type, wrapped)
      return this
    }
    off(type: string, handler: Listener) {
      const list = this.listeners.get(type)
      if (!list) return
      const at = list.indexOf(handler)
      if (at >= 0) list.splice(at, 1)
    }
    private listen(type: string, handler: Listener) {
      const list = this.listeners.get(type) ?? []
      list.push(handler)
      this.listeners.set(type, list)
    }
    fire(type: string, payload: unknown = {}) {
      for (const handler of [...(this.listeners.get(type) ?? [])]) handler(payload)
    }
    remove() { this.removed = true; this.listeners.clear(); this.customLayers = [] }
  }
  class FakePopup {
    setLngLat() { return this }
    setDOMContent() { return this }
    addTo() { return this }
    isOpen() { return false }
    remove() {}
  }
  return { Map: FakeMap, Popup: FakePopup, setWorkerUrl: rig.setWorkerUrl }
})

function fakeFetch(url: string, init?: RequestInit): Promise<unknown> {
  rig.fetchCalls.push({ url, init })
  if (rig.fetchImpl) return rig.fetchImpl(url, init)
  if (url === TILEJSON) return Promise.resolve({ ok: true, json: async () => ({ tiles: ['https://tuiles.test/{z}/{x}/{y}'] }) })
  if (url === '/api/live-map') return Promise.resolve({ ok: true, json: async () => ({ attacks: [] }) })
  return Promise.reject(new Error(`fetch inattendu : ${url}`))
}

class FakeEventSource {
  closed = false
  listeners = new Map<string, Listener>()
  constructor(public url: string) { rig.eventSources.push(this) }
  addEventListener(type: string, callback: Listener) { this.listeners.set(type, callback) }
  close() { this.closed = true }
}

const baseProps: Map3DProps = {
  orgs: [{ id: 1, name: 'CHU', slug: 'chu', kind: 'sante', city: 'Bordeaux', lat: 44.84, lon: -0.58 }],
  events: [{ id: 'e1', title: 'Incident', family: 'ransomware', assertionType: 'claim', severity: 3, orgId: 1, lat: 44.9, lon: -0.5 }],
}

const debugWindow = window as unknown as { __radarMap?: unknown }
let container: HTMLDivElement | undefined
let root: Root | undefined

function render(next: Partial<Map3DProps> = {}) {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  const props = { ...baseProps, ...next }
  act(() => { root?.render(<Map3D {...props} />) })
}

function unmount() {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  globals.IS_REACT_ACT_ENVIRONMENT = true
  rig.maps = []
  rig.eventSources = []
  rig.fetchCalls = []
  rig.rafCallbacks.clear()
  rig.nextRaf = 1
  rig.fetchImpl = null
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: () => void) => {
    const id = rig.nextRaf++
    rig.rafCallbacks.set(id, callback)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { rig.rafCallbacks.delete(id) }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  if (root) unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearTokenCache()
  delete debugWindow.__radarMap
})

describe('E2 — fond de carte au premier affichage', () => {
  it('active « plan » dès la création, avant tout changement de prop', async () => {
    render({ basemap: 'plan' })
    await settle()
    expect(rig.maps).toHaveLength(1)
    expect(rig.maps[0]!.getLayoutProperty('osm', 'visibility')).toBe('visible')
    expect(rig.maps[0]!.getLayoutProperty('satellite', 'visibility')).toBe('none')
  })

  it('active l’imagerie satellite quand c’est le fond demandé', async () => {
    render({ basemap: 'sat' })
    await settle()
    expect(rig.maps[0]!.getLayoutProperty('satellite', 'visibility')).toBe('visible')
    expect(rig.maps[0]!.getLayoutProperty('osm', 'visibility')).toBe('none')
  })
})

describe('E3 — repli hors ligne', () => {
  it('n’abandonne pas une carte créée après démontage et annule le fetch', async () => {
    const gate = Promise.withResolvers<unknown>()
    rig.fetchImpl = (url, init) => {
      rig.fetchCalls.push({ url, init })
      if (url === TILEJSON) return gate.promise
      return fakeFetch(url, init)
    }
    render()
    const tileCall = rig.fetchCalls.find((call) => call.url === TILEJSON)
    expect(tileCall?.init?.signal?.aborted).toBe(false)
    unmount()
    expect(tileCall?.init?.signal?.aborted).toBe(true)
    await act(async () => {
      gate.resolve({ ok: true, json: async () => ({ tiles: ['https://tuiles.test/{z}/{x}/{y}'] }) })
      await Promise.resolve()
    })
    expect(rig.maps).toHaveLength(0)
    expect(debugWindow.__radarMap).toBeUndefined()
  })

  it('construit un style de secours complet et des libellés DOM sans glyphs', async () => {
    rig.fetchImpl = (url, init) => {
      rig.fetchCalls.push({ url, init })
      if (url === TILEJSON) return Promise.reject(new Error('réseau absent'))
      return fakeFetch(url, init)
    }
    render()
    await settle()
    expect(rig.maps).toHaveLength(1)
    const style = rig.maps[0]!.style
    const ids = style.layers.map((layer) => layer.id)
    for (const id of ['fond', 'dep', 'orgs', 'hot', 'arcs', 'events']) expect(ids).toContain(id)
    expect(style.glyphs).toBeUndefined()
    expect(style.sprite).toBeUndefined()
    expect(style.layers.some((layer) => layer.type === 'symbol')).toBe(false)
    expect(container?.querySelectorAll('.radar-map-city').length).toBeGreaterThan(0)
    act(() => { rig.maps[0]!.fire('load') })
    expect(rig.maps[0]!.getSource('events')?.setData).toHaveBeenCalled()
    expect(rig.maps[0]!.getSource('arcs')?.setData).toHaveBeenCalled()
    unmount()
    expect(container).toBeUndefined()
  })

  it('le style de secours exporté contient toutes les couches utiles', () => {
    const style = styleSecours(
      { type: 'FeatureCollection', features: [] },
      { type: 'FeatureCollection', features: [] },
    )
    const ids = style.layers.map((layer) => layer.id)
    expect(ids).toEqual(expect.arrayContaining(['fond', 'dep', 'orgs', 'hot', 'arcs', 'events']))
    expect(style.sources.orgs?.cluster).toBe(true)
    expect(style.layers.every((layer) => layer.type !== 'symbol')).toBe(true)
    expect(JSON.stringify(style)).not.toContain('http')
  })
})

describe('M2 — TileJSON en cache mais tuiles indisponibles', () => {
  it('active le repli après plusieurs erreurs de tuiles', async () => {
    render()
    await settle()
    expect(rig.maps).toHaveLength(1)
    const online = rig.maps[0]!
    act(() => {
      for (let i = 0; i < 3; i += 1) {
        online.fire('error', { error: new Error('Failed to load tile'), tile: {} })
      }
    })
    expect(rig.maps).toHaveLength(2)
    expect(online.removed).toBe(true)
    const fallback = rig.maps[1]!
    expect(fallback.style.layers.map((layer) => layer.id)).toContain('fond')
    expect(debugWindow.__radarMap).toBe(fallback)
    unmount()
    expect(debugWindow.__radarMap).toBeUndefined()
  })
})

describe('M3 — flux live réactif et sans fuite', () => {
  it('démarre et arrête complètement EventSource et la boucle rAF', async () => {
    render({ live: false })
    await settle()
    expect(rig.eventSources).toHaveLength(0)
    render({ live: true })
    act(() => { rig.maps[0]!.fire('load') })
    expect(rig.eventSources).toHaveLength(1)
    expect(rig.fetchCalls.some((call) => call.url === '/api/live-map')).toBe(true)
    const source = rig.eventSources[0]!
    render({ live: false })
    expect(source.closed).toBe(true)
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(debugWindow.__radarMap).toBe(rig.maps[0])
    unmount()
    expect(debugWindow.__radarMap).toBeUndefined()
  })

  it('ne pulse pas sans point chaud et arrête la pulsation au démontage', async () => {
    render({ events: [{ ...baseProps.events[0]!, orgId: null }] })
    await settle()
    act(() => { rig.maps[0]!.fire('load') })
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    render({ events: baseProps.events })
    act(() => { rig.maps[0]!.fire('load') })
    expect(requestAnimationFrame).toHaveBeenCalled()
    const callback = [...rig.rafCallbacks.values()][0]!
    unmount()
    expect(() => callback()).not.toThrow()
  })

  it('ne reconstruit pas la géométrie des arcs quand seul le zoom change', async () => {
    vi.useFakeTimers()
    const flow = {
      id: 'f1',
      from: { lat: 44.84, lon: -0.58, label: 'Bordeaux' },
      to: { lat: 45.77, lon: 1.26, label: 'Limoges' },
      family: 'ransomware',
      severity: 3,
    }
    render({ flows: [flow] })
    await settle()
    act(() => { rig.maps[0]!.fire('load') })
    const arcs = rig.maps[0]!.getSource('arcs')!.setData
    const events = rig.maps[0]!.getSource('events')!.setData
    const beforeArcs = arcs.mock.calls.length
    const beforeEvents = events.mock.calls.length
    act(() => {
      rig.maps[0]!.setZoom(8)
      rig.maps[0]!.fire('zoomend')
      vi.advanceTimersByTime(150)
    })
    expect(events.mock.calls.length).toBeGreaterThan(beforeEvents)
    expect(arcs.mock.calls.length).toBe(beforeArcs)
  })

  it('résout chaque jeton de couleur une seule fois', () => {
    clearTokenCache()
    const spy = vi.spyOn(window, 'getComputedStyle')
    expect(resolveTokenColor('--accent')).toBe(resolveTokenColor('--accent'))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
