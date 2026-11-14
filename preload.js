const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('vrp', {
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  openDropped: file => ipcRenderer.invoke('register-file', webUtils.getPathForFile(file)),
  onOpenFile: cb => ipcRenderer.on('open-file', (_e, info) => cb(info)),
  ready: () => ipcRenderer.invoke('renderer-ready'),
  setFullscreen: on => ipcRenderer.send('set-fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen')
});
