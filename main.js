const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

let mainWindow;

// Se você renomear o app, a pasta de dados muda e as contas/salas salvas "somem".
// Para manter tudo, coloque aqui o nome da pasta antiga (veja em %APPDATA%).
const LEGACY_DATA_FOLDER = ''; // ex.: 'nosso-cantinho'
if (LEGACY_DATA_FOLDER) {
  app.setPath('userData', path.join(app.getPath('appData'), LEGACY_DATA_FOLDER));
}

// Mantém a chamada firme mesmo com a janela minimizada ou coberta por outro app
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// ---------------------------------------------------------------------------
// FORMATO DO ÁUDIO QUE A LIB ENTREGA (PCM cru)
// Se a transmissão sair com som acelerado, grave ou chiado, o problema é aqui:
// ajuste sampleRate / channels / bits / float até o som ficar normal.
// ---------------------------------------------------------------------------
const APP_AUDIO_FORMAT = {
  sampleRate: 44100, // tente 48000 se o som ficar errado
  channels: 2,
  bits: 16,          // 16 = inteiro com sinal | 32 = float32
  float: false       // true se for float32 (bits: 32)
};

// ---------------------------------------------------------------------------
// CAPTURA DE ÁUDIO POR APLICATIVO (somente Windows 10 build 19041+)
// ---------------------------------------------------------------------------
let capture = null;

function loadLoopback() {
  const mod = require('loopback-capture');
  const lib = mod.default || mod;
  return lib.LoopbackCapture || mod.LoopbackCapture;
}

// "window:HWND:0" -> PID dono da janela (via user32.GetWindowThreadProcessId)
function getPidFromWindowSourceId(sourceId) {
  return new Promise((resolve, reject) => {
    const parts = String(sourceId).split(':');
    if (parts[0] !== 'window' || !/^\d+$/.test(parts[1] || '')) {
      return reject(new Error('Fonte não é uma janela.'));
    }
    const hwnd = parts[1];

    const script =
      `Add-Type -Namespace Native -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);'; ` +
      `$p = [uint32]0; ` +
      `[Native.Win]::GetWindowThreadProcessId([IntPtr][int64]${hwnd}, [ref]$p) | Out-Null; ` +
      `Write-Output $p`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) return reject(err);
        const pid = parseInt(String(stdout).trim(), 10);
        if (!pid) return reject(new Error('PID não encontrado.'));
        resolve(pid);
      }
    );
  });
}

function stopAppAudio() {
  if (capture) {
    try { capture.stop(); } catch (e) { console.warn('Erro ao parar captura:', e); }
    capture = null;
  }
}

ipcMain.handle('START_APP_AUDIO', async (event, sourceId) => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Áudio por aplicativo só funciona no Windows.' };
  }

  try {
    stopAppAudio();

    const pid = await getPidFromWindowSourceId(sourceId);
    const LoopbackCapture = loadLoopback();
    const sender = event.sender;

    capture = new LoopbackCapture();

    const onData = (chunk) => {
      if (!sender.isDestroyed()) sender.send('APP_AUDIO_CHUNK', chunk);
    };

    try {
      // Versão nova da lib: start(pid, includeProcessTree, onData)
      // true = inclui a árvore de processos (navegadores e jogos tocam o som
      // em processos filhos)
      capture.start(pid, true, onData);
    } catch (e) {
      if (String(e.message).includes('Expected start(processId')) {
        // Versão antiga da lib: start(pid, onData)
        capture.start(pid, onData);
      } else {
        throw e;
      }
    }

    return { ok: true, pid, format: APP_AUDIO_FORMAT };
  } catch (err) {
    console.error('Erro ao iniciar captura de áudio do app:', err);
    stopAppAudio();
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('STOP_APP_AUDIO', () => {
  stopAppAudio();
  return true;
});

// ---------------------------------------------------------------------------
// FONTES DE TELA / JANELA
// ---------------------------------------------------------------------------
ipcMain.handle('GET_SOURCES', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 480, height: 270 }
    });

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  } catch (err) {
    console.error('Erro no desktopCapturer:', err);
    return [];
  }
});

// ---------------------------------------------------------------------------
// JANELA
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Com o app minimizado (jogando, por exemplo) o Chromium atrasa os
      // temporizadores; isso faria a outra pessoa achar que você saiu da sala.
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile('index.html');
}

// ---------------------------------------------------------------------------
// ATUALIZAÇÃO AUTOMÁTICA (só no app instalado; usa os Releases do GitHub)
// ---------------------------------------------------------------------------
function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('UPDATE_STATUS', status);
  }
}

function setupAutoUpdate() {
  if (!app.isPackaged) return; // em desenvolvimento (npm start) não procura atualização

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.warn('electron-updater não instalado:', err.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se você só fechar o app, ele atualiza ao sair

  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'available', version: info.version }));
  autoUpdater.on('download-progress', (p) => sendUpdateStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => console.warn('Erro na atualização:', err && err.message));

  ipcMain.handle('INSTALL_UPDATE', () => autoUpdater.quitAndInstall());

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000); // confere de novo a cada 4 horas
}

ipcMain.handle('GET_APP_VERSION', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', stopAppAudio);

app.on('window-all-closed', () => {
  stopAppAudio();
  if (process.platform !== 'darwin') app.quit();
});