import { broadcast } from './windows'

export interface ConsoleLine {
  seq: number
  t: number
  level: 'log' | 'warn' | 'error'
  text: string
}

const MAX_LINES = 500
const buffer: ConsoleLine[] = []
let seq = 0

function push(level: ConsoleLine['level'], args: unknown[]): void {
  const text = args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
    .slice(0, 4000)
  const line: ConsoleLine = { seq: ++seq, t: Date.now(), level, text }
  buffer.push(line)
  if (buffer.length > MAX_LINES) buffer.shift()
  broadcast('console:line', line)
}

/** Wraps the main-process console so everything the app logs is observable in-app. */
export function initConsoleCapture(): void {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  }
  console.log = (...args: unknown[]) => {
    original.log(...args)
    push('log', args)
  }
  console.warn = (...args: unknown[]) => {
    original.warn(...args)
    push('warn', args)
  }
  console.error = (...args: unknown[]) => {
    original.error(...args)
    push('error', args)
  }
  process.on('unhandledRejection', (reason) => {
    push('error', [`unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`])
  })
}

export function getConsoleLines(): ConsoleLine[] {
  return [...buffer]
}

export function clearConsoleLines(): void {
  buffer.length = 0
}
