const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('restaurantDesktop', {
  getSettings: () => ipcRenderer.invoke('restaurant:get-settings'),
  saveSettings: value => ipcRenderer.invoke('restaurant:save-settings', value),
  testServer: value => ipcRenderer.invoke('restaurant:test-server', value)
});
