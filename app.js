// --- SISTEMA DE AUTENTICAÇÃO E PERMISSÕES (ADMIN / USER) ---
const ADMIN_USER = "steiner777"; // Seu usuário de Administradora

let currentUser = JSON.parse(localStorage.getItem('app_logged_user')) || null;
let currentRoomName = '';
let currentRoomPin = '';
let myPeerId = '';
let targetPeerId = null;
let peer = null;

const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%235865f2'><circle cx='50' cy='50' r='50'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M22 80c0-15 12-25 28-25s28 10 28 25z' fill='%23ffffff'/></svg>";

let myProfile = {
  name: localStorage.getItem('profile_name') || '',
  avatar: defaultAvatar,
  status: '🟢 Disponível'
};

let remoteProfile = { name: 'Convidado', avatar: defaultAvatar, status: 'Aguardando...' };

// Sistema de Gerenciamento de Salas (Local Storage Banco Simulado)
function getRoomsDatabase() {
  return JSON.parse(localStorage.getItem('app_rooms_db') || '{}');
}

function saveRoomToDb(name, pin, owner) {
  const db = getRoomsDatabase();
  db[name] = { pin: pin, owner: owner, created: Date.now() };
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
}

function deleteRoomFromDb(name) {
  const db = getRoomsDatabase();
  delete db[name];
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
  renderRoomsManagerList();
}

// Renderiza a Lista de Salas no Lobby com as permissões corretas
function renderRoomsManagerList() {
  const container = document.getElementById('rooms-list-container');
  if (!container) return;
  container.innerHTML = '';

  const db = getRoomsDatabase();
  const rooms = Object.keys(db);

  if (rooms.length === 0) {
    container.innerHTML = '<span style="font-size:12px; color:#949ba4;">Nenhuma sala criada no momento.</span>';
    return;
  }

  const isAdmin = currentUser && currentUser.username.toLowerCase() === ADMIN_USER.toLowerCase();

  rooms.forEach(roomName => {
    const roomInfo = db[roomName];
    const isOwner = currentUser && currentUser.username === roomInfo.owner;

    const row = document.createElement('div');
    row.className = 'room-item-row';
    row.innerHTML = `
      <span>🔒 <strong>${roomName}</strong> (Criador: ${roomInfo.owner})</span>
      ${(isAdmin || isOwner) ? `<button class="btn-delete-room" onclick="deleteRoomFromDb('${roomName}')">Excluir</button>` : '<span style="font-size:10px; color:#6d727a;">Protegida</span>'}
    `;
    container.appendChild(row);
  });
}

// LÓGICA DE TEMA
let currentTheme = localStorage.getItem('app_theme') || 'streamer';
function applyTheme(themeName) {
  currentTheme = themeName;
  localStorage.setItem('app_theme', themeName);
  document.body.classList.remove('theme-streamer', 'theme-minimalist');
  document.body.classList.add(`theme-${themeName}`);
}
applyTheme(currentTheme);

// DOM Auth & Lobby
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const userWelcomeText = document.getElementById('user-welcome-text');
const adminBadge = document.getElementById('admin-badge');
const displayNameInput = document.getElementById('display-name-input');
const btnSaveDisplayName = document.getElementById('btn-save-display-name');

function updateAuthUI() {
  if (currentUser) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    userWelcomeText.innerText = `Olá, ${currentUser.username}!`;

    const isAdmin = currentUser.username.toLowerCase() === ADMIN_USER.toLowerCase();
    adminBadge.classList.toggle('hidden', !isAdmin);

    if (!myProfile.name) myProfile.name = currentUser.username;
    displayNameInput.value = myProfile.name;
    renderRoomsManagerList();
  } else {
    authScreen.classList.remove('hidden');
    lobbyScreen.classList.add('hidden');
  }
}

btnLogin.addEventListener('click', () => {
  const user = authUsername.value.trim();
  const pass = authPassword.value.trim();
  if (!user || !pass) return alert('Preencha usuário e senha!');

  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  if (usersDb[user] && usersDb[user] === pass) {
    currentUser = { username: user };
    localStorage.setItem('app_logged_user', JSON.stringify(currentUser));
    updateAuthUI();
  } else if (user.toLowerCase() === ADMIN_USER.toLowerCase() && pass === "777") {
    // Senha padrão para sua conta de Admin
    currentUser = { username: user };
    localStorage.setItem('app_logged_user', JSON.stringify(currentUser));
    updateAuthUI();
  } else {
    alert('Usuário ou senha incorretos!');
  }
});

btnRegister.addEventListener('click', () => {
  const user = authUsername.value.trim();
  const pass = authPassword.value.trim();
  if (!user || !pass) return alert('Digite usuário e senha para cadastrar!');

  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  usersDb[user] = pass;
  localStorage.setItem('app_users_db', JSON.stringify(usersDb));

  currentUser = { username: user };
  localStorage.setItem('app_logged_user', JSON.stringify(currentUser));
  alert('Conta criada com sucesso!');
  updateAuthUI();
});

btnLogout.addEventListener('click', () => {
  localStorage.removeItem('app_logged_user');
  currentUser = null;
  updateAuthUI();
});

btnSaveDisplayName.addEventListener('click', () => {
  const val = displayNameInput.value.trim();
  if (val) {
    myProfile.name = val;
    localStorage.setItem('profile_name', val);
    alert('Nome de exibição atualizado!');
  }
});

// PEERJS & CONEXÃO COM VALIDAÇÃO REAL DE PIN
const createRoomName = document.getElementById('create-room-name');
const createRoomPin = document.getElementById('create-room-pin');
const btnCreateRoom = document.getElementById('btn-create-room');
const joinRoomName = document.getElementById('join-room-name');
const joinRoomPin = document.getElementById('join-room-pin');
const btnJoinRoom = document.getElementById('btn-join-room');

btnCreateRoom.addEventListener('click', () => {
  const room = createRoomName.value.trim();
  const pin = createRoomPin.value.trim();
  if (!room) return alert('Digite um nome para a sala!');
  if (!pin) return alert('Defina uma senha/PIN para a sala!');

  saveRoomToDb(room, pin, currentUser.username);
  initPeerConnection(room, pin, true);
});

btnJoinRoom.addEventListener('click', () => {
  const room = joinRoomName.value.trim();
  const pin = joinRoomPin.value.trim();
  if (!room || !pin) return alert('Digite o nome e a senha da sala!');

  const db = getRoomsDatabase();
  if (db[room] && db[room].pin !== pin) {
    return alert('❌ Senha incorreta para esta sala!');
  }

  initPeerConnection(room, pin, false);
});

function initPeerConnection(roomName, pin, isHost) {
  currentRoomName = roomName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  currentRoomPin = pin;
  const randomId = Math.random().toString(36).substring(2, 7);
  myPeerId = isHost ? `room-${currentRoomName}-host` : `room-${currentRoomName}-guest-${randomId}`;

  peer = new Peer(myPeerId, {
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });

  peer.on('open', () => {
    lobbyScreen.classList.add('hidden');
    document.getElementById('room-name-display').innerText = `🔒 Sala: ${currentRoomName}`;
    startMicrophone().then(() => {
      if (!isHost) initiateCallToHost();
    });
  });

  peer.on('connection', conn => setupDataConnection(conn));

  peer.on('call', call => {
    if (call.metadata && call.metadata.type === 'screen') {
      call.answer();
      call.on('stream', stream => {
        mainStream.srcObject = stream;
        updateStageLayoutMode();
      });
    } else {
      mainCall = call;
      call.answer(getMainCallStream());
      attachMainCallEvents(call);
    }
  });
}

function initiateCallToHost() {
  const targetHostId = `room-${currentRoomName}-host`;
  targetPeerId = targetHostId;
  const conn = peer.connect(targetHostId);
  setupDataConnection(conn);
  mainCall = peer.call(targetHostId, getMainCallStream(), { metadata: { type: 'main' } });
  attachMainCallEvents(mainCall);
}

// TRANSMISSÃO DE TELA E MEDIA
let micStream = null; let screenStream = null; let mainCall = null; let screenCall = null; let dataConn = null;
const mainStream = document.getElementById('main-stream');
const stageEl = document.getElementById('stage');

function sendScreenCall() {
  if (!screenStream || !peer) return;
  const targetId = targetPeerId || (dataConn ? dataConn.peer : null);
  if (targetId) screenCall = peer.call(targetId, screenStream, { metadata: { type: 'screen' } });
}

function setupDataConnection(conn) {
  dataConn = conn;
  targetPeerId = conn.peer;
  dataConn.on('open', () => {
    sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
  });
  dataConn.on('data', data => {
    if (data.type === 'PROFILE_UPDATE') {
      remoteProfile = data.profile;
      document.getElementById('avatar-name-remote').innerText = remoteProfile.name;
    }
  });
}

function sendDataMessage(data) { if (dataConn && dataConn.open) dataConn.send(data); }

function getMainCallStream() {
  const tracks = [];
  if (micStream) tracks.push(micStream.getAudioTracks()[0]);
  return new MediaStream(tracks);
}

async function startMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) { console.warn('Sem mic:', e); }
}

function updateStageLayoutMode() {
  const hasScreen = !!mainStream.srcObject;
  stageEl.classList.toggle('camera-focus-mode', !hasScreen);
}

function attachMainCallEvents(call) {
  call.on('stream', stream => {
    document.getElementById('remote-voice-audio').srcObject = stream;
  });
}

// Configurações & Temas
document.getElementById('theme-select').addEventListener('change', (e) => applyTheme(e.target.value));
document.getElementById('btn-open-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.add('active'));
document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('active'));

document.getElementById('btn-screen').addEventListener('click', async () => {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    mainStream.srcObject = screenStream;
    sendScreenCall();
    updateStageLayoutMode();
  } catch(e) {}
});

document.getElementById('btn-hangup').addEventListener('click', () => window.location.reload());

updateAuthUI();