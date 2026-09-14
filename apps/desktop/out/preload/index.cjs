"use strict";
const electron = require("electron");
const devhub = {
  feed: (cat, limit) => electron.ipcRenderer.invoke("feed", cat, limit),
  saved: (limit) => electron.ipcRenderer.invoke("saved", limit),
  search: (q, limit) => electron.ipcRenderer.invoke("search", q, limit),
  article: (id) => electron.ipcRenderer.invoke("article", id),
  toggleSaved: (id) => electron.ipcRenderer.invoke("toggleSaved", id),
  recordRead: (id) => electron.ipcRenderer.invoke("recordRead", id),
  ingest: () => electron.ipcRenderer.invoke("ingest"),
  sources: () => electron.ipcRenderer.invoke("sources"),
  getSetting: (k) => electron.ipcRenderer.invoke("getSetting", k),
  setSetting: (k, v) => electron.ipcRenderer.invoke("setSetting", k, v),
  openExternal: (url) => electron.ipcRenderer.invoke("openExternal", url)
};
electron.contextBridge.exposeInMainWorld("devhub", devhub);
