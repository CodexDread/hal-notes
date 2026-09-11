import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import type { GraphData, GraphNode } from '@shared/types'
import { hal } from '@/lib/ipc'
import { useUi } from '@/state/ui'
import { useVault } from '@/state/vault'

interface SimNode extends SimulationNodeDatum, GraphNode {}

interface SimLink extends SimulationLinkDatum<SimNode> {}

interface ViewTransform {
  k: number
  x: number
  y: number
}

export function GraphView() {
  const snapshotVersion = useVault((s) => s.snapshot.notes.length + s.snapshot.notes.reduce((a, n) => a + n.updatedAt, 0))
  const open = useVault((s) => s.open)
  const toggleGraph = useUi((s) => s.toggleGraph)
  const [data, setData] = useState<GraphData | null>(null)
  const [, setTick] = useState(0)
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  // Source of truth for the pan/zoom transform — written straight to the DOM;
  // the mirrored state exists only for the stats readout.
  const viewRef = useRef<ViewTransform>({ k: 1, x: 0, y: 0 })
  const [view, setView] = useState<ViewTransform>({ k: 1, x: 0, y: 0 })
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef<{ mode: 'pan' | 'node'; nodeId?: string; startX: number; startY: number; lastX: number; lastY: number } | null>(null)
  const wasDragRef = useRef(false)

  useEffect(() => {
    void hal.graphData().then(setData).catch(() => setData(null))
  }, [snapshotVersion])

  const applyView = (): void => {
    const v = viewRef.current
    gRef.current?.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`)
    setView({ ...v })
  }

  // Center the world origin in the viewport once the canvas has size —
  // the simulation pulls nodes toward (0,0), which is the SVG's top-left corner.
  const centeredRef = useRef(false)
  useEffect(() => {
    if (!data || centeredRef.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    centeredRef.current = true
    viewRef.current = { k: 1, x: rect.width / 2, y: rect.height / 2 }
    applyView()
  }, [data])

  useEffect(() => {
    if (!data) return
    const nodes: SimNode[] = data.nodes.map((n, i) => ({
      ...n,
      x: Math.cos((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * 150,
      y: Math.sin((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * 150
    }))
    const links: SimLink[] = data.edges.map((e) => ({ source: e.source, target: e.target }))
    nodesRef.current = nodes
    linksRef.current = links
    const sim = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(110).strength(0.25))
      .force('charge', forceManyBody<SimNode>().strength(-260))
      .force('collide', forceCollide<SimNode>(30))
      .force('x', forceX<SimNode>(0).strength(0.045))
      .force('y', forceY<SimNode>(0).strength(0.06))
      .on('tick', () => setTick((t) => t + 1))
    simRef.current = sim
    return () => {
      sim.stop()
      simRef.current = null
    }
  }, [data])

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (a: string, b: string): void => {
      if (!map.has(a)) map.set(a, new Set())
      map.get(a)!.add(b)
    }
    for (const l of data?.edges ?? []) {
      add(l.source, l.target)
      add(l.target, l.source)
    }
    return map
  }, [data])

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const v = viewRef.current
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k }
  }

  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const v = viewRef.current
    const factor = Math.exp(-e.deltaY * 0.0012)
    const k = Math.min(3, Math.max(0.15, v.k * factor))
    viewRef.current = { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
    applyView()
  }

  // Window-level mouse listeners while a drag is live, so fast travel off the
  // node or off the canvas never stalls the gesture. Mouse events deliberately —
  // pointer events never fired on this SVG surface in this Electron build.
  const beginDrag = (e: React.MouseEvent, nodeId?: string): void => {
    e.preventDefault()
    dragRef.current = { mode: nodeId ? 'node' : 'pan', nodeId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY }
    if (nodeId) simRef.current?.alphaTarget(0.25).restart()

    const onMove = (ev: MouseEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dist = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY)
      if (dist > 4) wasDragRef.current = true
      if (drag.mode === 'pan') {
        const v = viewRef.current
        viewRef.current = { ...v, x: v.x + ev.clientX - drag.lastX, y: v.y + ev.clientY - drag.lastY }
        applyView()
        drag.lastX = ev.clientX
        drag.lastY = ev.clientY
        return
      }
      const node = nodesRef.current.find((n) => n.id === drag.nodeId)
      if (!node) return
      const world = toWorld(ev.clientX, ev.clientY)
      node.fx = world.x
      node.fy = world.y
      drag.lastX = ev.clientX
      drag.lastY = ev.clientY
    }

    const onUp = (): void => {
      const drag = dragRef.current
      if (drag?.mode === 'node') {
        const node = nodesRef.current.find((n) => n.id === drag.nodeId)
        if (node) {
          node.fx = null
          node.fy = null
        }
        simRef.current?.alphaTarget(0)
      }
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const openNote = (node: SimNode): void => {
    if (node.unresolved) return
    if (wasDragRef.current) {
      wasDragRef.current = false
      return
    }
    toggleGraph()
    void open(node.id)
  }

  if (!data) {
    return <div className="grid h-full place-items-center text-sm text-[var(--hal-dim)] opacity-80">Building graph…</div>
  }

  if (data.nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl">🕸️</div>
          <p className="mt-3 text-sm text-[var(--hal-dim)]">No notes to graph yet.</p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--hal-dim)] opacity-80">
            Write a few notes and connect them with <span className="text-[var(--hal-amber)]">[[wiki links]]</span> — the graph
            grows as your vault connects.
          </p>
        </div>
      </div>
    )
  }

  const isDimmed = (id: string): boolean => {
    if (!hovered) return false
    if (id === hovered) return false
    return !(neighbors.get(hovered)?.has(id) ?? false)
  }

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-[var(--hal-ground)]">
      <svg
        ref={svgRef}
        className="h-full w-full select-none"
        onWheel={onWheel}
        onMouseDown={(e) => beginDrag(e)}
        style={{ cursor: 'grab' }}
      >
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" pointer-events="all" />
        <g ref={gRef}>
          {linksRef.current.map((l, i) => {
            const s = l.source as SimNode
            const t = l.target as SimNode
            const dim = hovered ? isDimmed(s.id) || isDimmed(t.id) : false
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="var(--color-zinc-700)"
                strokeWidth={1 / view.k}
                opacity={dim ? 0.08 : 0.5}
              />
            )
          })}
          {nodesRef.current.map((n) => {
            const dim = isDimmed(n.id)
            const r = 5 + Math.min(11, Math.sqrt(n.degree) * 2.4)
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.15 : 1}
                style={{ cursor: n.unresolved ? 'default' : 'pointer' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  beginDrag(e, n.id)
                }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  openNote(n)
                }}
              >
                <circle
                  r={r}
                  fill={n.unresolved ? 'var(--color-zinc-600)' : 'var(--color-violet-400)'}
                  stroke="var(--color-zinc-950)"
                  strokeWidth={1.5}
                />
                <text
                  y={r + 4 / view.k + 8}
                  textAnchor="middle"
                  fontSize={11 / view.k}
                  fill={n.unresolved ? 'var(--color-zinc-500)' : 'var(--color-zinc-300)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {n.name.length > 28 ? `${n.name.slice(0, 27)}…` : n.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-[var(--hal-plate)] px-2.5 py-1 text-[11px] text-[var(--hal-dim)]">
        {data.nodes.filter((n) => !n.unresolved).length} notes · {data.edges.length} links ·{" "}
        {data.nodes.filter((n) => n.unresolved).length} unresolved · view {Math.round(view.x)},{Math.round(view.y)} ×
        {view.k.toFixed(1)}
      </div>
    </div>
  )
}
