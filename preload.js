const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('GET_SOURCES'),

  // Áudio somente do aplicativo/janela compartilhada
  startAppAudio: (sourceId) => ipcRenderer.invoke('START_APP_AUDIO', sourceId),
  stopAppAudio: () => ipcRenderer.invoke('STOP_APP_AUDIO'),

  // Atualização automática
  getAppVersion: () => ipcRenderer.invoke('GET_APP_VERSION'),
  installUpdate: () => ipcRenderer.invoke('INSTALL_UPDATE'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('UPDATE_STATUS', (_event, status) => callback(status));
  },

  // Recebe os chunks de PCM. Retorna uma função para remover o listener.
  onAppAudioChunk: (callback) => {
    const handler = (_event, chunk) => callback(chunk);
    ipcRenderer.on('APP_AUDIO_CHUNK', handler);
    return () => ipcRenderer.removeListener('APP_AUDIO_CHUNK', handler);
  }
});