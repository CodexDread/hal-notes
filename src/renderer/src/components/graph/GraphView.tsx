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
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hovered, setHovered] = useState<string | null>(null)
  const dragRef = useRef<{ mode: 'pan' | 'node'; nodeId?: string; lastX: number; lastY: number } | null>(null)

  useEffect(() => {
    void hal.graphData().then(setData).catch(() => setData(null))
  }, [snapshotVersion])

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
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k }
  }

  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = Math.exp(-e.deltaY * 0.0012)
    const k = Math.min(3, Math.max(0.15, view.k * factor))
    setView({ k, x: mx - ((mx - view.x) * k) / view.k, y: my - ((my - view.y) * k) / view.k })
  }

  const onPointerDown = (e: React.PointerEvent, nodeId?: string): void => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { mode: nodeId ? 'node' : 'pan', nodeId, lastX: e.clientX, lastY: e.clientY }
    if (nodeId) simRef.current?.alphaTarget(0.25).restart()
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'pan') {
      setView((v) => ({ ...v, x: v.x + e.clientX - drag.lastX, y: v.y + e.clientY - drag.lastY }))
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      return
    }
    const node = nodesRef.current.find((n) => n.id === drag.nodeId)
    if (!node) return
    const world = toWorld(e.clientX, e.clientY)
    node.fx = world.x
    node.fy = world.y
    drag.lastX = e.clientX
    drag.lastY = e.clientY
  }

  const onPointerUp = (): void => {
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
  }

  const openNote = (node: SimNode): void => {
    if (node.unresolved) return
    toggleGraph()
    void open(node.id)
  }

  if (!data) {
    return <div className="grid h-full place-items-center text-sm text-zinc-600">Building graph…</div>
  }

  if (data.nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl">🕸️</div>
          <p className="mt-3 text-sm text-zinc-400">No notes to graph yet.</p>
          <p className="mt-1.5 text-xs leading-5 text-zinc-600">
            Write a few notes and connect them with <span className="text-violet-400">[[wiki links]]</span> — the graph
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
    <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-zinc-950">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        onWheel={onWheel}
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragRef.current?.mode === 'pan' ? 'grabbing' : 'default' }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
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
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onPointerDown(e, n.id)
                }}
                onPointerUp={onPointerUp}
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
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-500">
        {data.nodes.filter((n) => !n.unresolved).length} notes · {data.edges.length} links ·{" "}
        {data.nodes.filter((n) => n.unresolved).length} unresolved
      </div>
    </div>
  )
}
