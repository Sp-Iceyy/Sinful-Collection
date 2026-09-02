const { contextBridge, webUtils, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openMediaLocation: () => ipcRenderer.invoke('open-media-location'),
    showMediaInFolder: (payload) => ipcRenderer.invoke('show-media-in-folder', payload),
  changeMediaLocation: () => ipcRenderer.invoke('change-media-location'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});