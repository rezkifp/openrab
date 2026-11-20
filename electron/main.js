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
            reject(new Error('Server tidak merespons dalam 30 detik.'));
          } else {
            setTimeout(check, 300);
          }
        });
    };
    check();
  });
}

function showStatusHtml(title, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: system-ui, sans-serif; background: #fafaf9; color: #1c1917; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .box { max-width: 480px; padding: 32px; background: #fff; border: 1px solid #d6d3d1; border-radius: 8px; text-align: center; }
          h2 { margin: 0 0 8px; font-size: 18px; }
          p { margin: 0; font-size: 13px; color: #57534e; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>${title}</h2>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function startNextServer() {
  const isPackaged = app.isPackaged;
  const standaloneDir = isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.join(__dirname, '..', '.next', 'standalone');

  const serverScript = path.join(standaloneDir, 'server.js');
  const dataDir = path.join(app.getPath('userData'), 'openrab-data');

  let stderrLog = '';

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
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stderr?.on('data', (chunk) => {
    stderrLog += chunk.toString();
  });

  serverProcess.on('error', (err) => {
    showStatusHtml('Gagal Menyalakan Server', err.message);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      showStatusHtml('Server Berhenti (Exit ' + code + ')', stderrLog || 'Terjadi kesalahan internal.');
    }
  });
}

async function createWindow() {
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

  showStatusHtml('Mempersiapkan OpenRAB...', 'Sedang menyalakan database lokal dan server aplikasi...');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  startNextServer();
  const url = `http://127.0.0.1:${PORT}`;
  try {
    await waitForServer(url);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(url);
    }
  } catch (err) {
    showStatusHtml('Gagal Membuka OpenRAB', err.message);
  }
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
