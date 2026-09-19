import { contextBridge } from 'electron'

// The typed bridge between the main process and the sandboxed renderer.
// It grows with the features; the renderer never gets more than what is listed here.
const api = {
  platform: process.platform
} as const

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
