const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PORT = 3456;
let mainWindow = null;
let serverProcess = null;

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error('Server timeout'));
          } else {
            setTimeout(check, 300);
          }
        });
    };
    check();
  });
}

function startNextServer() {
  const isPackaged = app.isPackaged;
  const standaloneDir = isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.join(__dirname, '..', '.next', 'standalone');

  const serverScript = path.join(standaloneDir, 'server.js');
  const dataDir = path.join(app.getPath('userData'), 'openrab-data');

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      OPENRAB_EMBEDDED_DB: 'true',
      OPENRAB_DATA_DIR: dataDir,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });
}

async function createWindow() {
  startNextServer();
  const url = `http://127.0.0.1:${PORT}`;
  await waitForServer(url);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OpenRAB — Aplikasi Penyusun RAB & BoQ',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
