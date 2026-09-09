import { EventEmitter } from 'events'

/** Main-process-wide event bus decoupling the store, sync engine, AI services and IPC layer. */
export const bus = new EventEmitter()
bus.setMaxListeners(100)
