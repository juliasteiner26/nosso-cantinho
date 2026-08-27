const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,AudioServiceSandbox');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      webSecurity: true
    }
  });

  const ONLINE_APP_URL = 'https://juliasteiner26.github.io/nosso-cantinho/';

  if (ONLINE_APP_URL.includes('SEU_USUARIO')) {
    mainWindow.loadFile('index.html');
  } else { 
    mainWindow.loadURL(ONLINE_APP_URL).catch(() => {
      mainWindow.loadFile('index.html');
    });
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.webContents.reloadIgnoringCache();
    }
  });
}

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

ipcMain.on('toggle-pip-mode', (event, enable) => {
  if (!mainWindow) return;
  if (enable) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setMinimumSize(240, 135);
    mainWindow.setSize(320, 180);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(900, 600);
    mainWindow.setSize(1280, 750);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});