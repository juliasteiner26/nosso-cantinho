const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  togglePipMode: (enable) => ipcRenderer.send('toggle-pip-mode', enable)
});