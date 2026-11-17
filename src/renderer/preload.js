const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set(['gb:state', 'gb:log', 'gb:import-progress', 'gb:dotb-progress', 'gb:morning']);

contextBridge.exposeInMainWorld('gb', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => {
    if (!EVENTS.has(channel)) return () => {};
    const h = (_, data) => fn(data);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
