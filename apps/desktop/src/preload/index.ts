import { contextBridge, ipcRenderer } from 'electron'

/**
 * Única ponte entre o renderer e o sistema. Expõe funções nomeadas, não
 * o ipcRenderer cru — assim o renderer não consegue inventar canais.
 */
const devhub = {
  feed: (cat: string | null, limit: number) => ipcRenderer.invoke('feed', cat, limit),
  saved: (limit: number) => ipcRenderer.invoke('saved', limit),
  search: (q: string, limit: number) => ipcRenderer.invoke('search', q, limit),
  article: (id: string) => ipcRenderer.invoke('article', id),
  toggleSaved: (id: string) => ipcRenderer.invoke('toggleSaved', id),
  recordRead: (id: string) => ipcRenderer.invoke('recordRead', id),
  ingest: () => ipcRenderer.invoke('ingest'),
  sources: () => ipcRenderer.invoke('sources'),
  getSetting: (k: string) => ipcRenderer.invoke('getSetting', k),
  setSetting: (k: string, v: string) => ipcRenderer.invoke('setSetting', k, v),
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
}

contextBridge.exposeInMainWorld('devhub', devhub)

export type DevHubBridge = typeof devhub
