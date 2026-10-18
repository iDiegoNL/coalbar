const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("coalbar", {
  invoke: (action, payload) => ipcRenderer.invoke("coalbar", action, payload),
  subscribe: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
});
