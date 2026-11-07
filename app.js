// --- CARGOS & CONTEXTO VIP ---
const ADMIN_USER = "steiner777";
const VIP_ROOM_NAME = "nosso-cantinho";

let currentUser = JSON.parse(localStorage.getItem('app_logged_user')) || null;
let currentRoomName = '';
let currentRoomPin = '';
let myPeerId = '';
let targetPeerId = null;
let peer = null;
let isMicMuted = true;
let isHostInstance = false;

const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%235865f2'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M22 80c0-15 12-25 28-25s28 10 28 25z' fill='%23ffffff'/></svg>";

let myProfile = {
  name: localStorage.getItem('profile_name') || '',
  avatar: defaultAvatar,
  status: '🟢 Disponível'
};

let remoteProfile = { name: 'Convidado', avatar: defaultAvatar, status: 'Aguardando...' };

function getVipUsers() {
  return JSON.parse(localStorage.getItem('app_vip_users') || '[]');
}

function toggleUserVip(username) {
  let vips = getVipUsers();
  const index = vips.indexOf(username);
  if (index >= 0) vips.splice(index, 1);
  else vips.push(username);
  localStorage.setItem('app_vip_users', JSON.stringify(vips));
  renderRoomsManagerList();
}

function addCustomVipUser() {
  const input = document.getElementById('input-add-vip');
  if (!input) return;
  const username = input.value.trim();
  if (!username) return;

  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  if (!usersDb[username]) {
    usersDb[username] = "123456";
    localStorage.setItem('app_users_db', JSON.stringify(usersDb));
  }

  let vips = getVipUsers();
  if (!vips.includes(username)) {
    vips.push(username);
    localStorage.setItem('app_vip_users', JSON.stringify(vips));
  }
  input.value = '';
  renderRoomsManagerList();
}

function isUserVipOrAdmin() {
  if (!currentUser) return false;
  const user = currentUser.username.toLowerCase();
  const vips = getVipUsers().map(v => v.toLowerCase());
  return user === ADMIN_USER.toLowerCase() || vips.includes(user);
}

function getRoomsDatabase() {
  return JSON.parse(localStorage.getItem('app_rooms_db') || '{}');
}

function saveRoomToDb(name, pin, owner) {
  const db = getRoomsDatabase();
  db[name] = { pin: String(pin).trim(), owner: owner, created: Date.now() };
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
}

function deleteRoomFromDb(name) {
  const db = getRoomsDatabase();
  delete db[name];
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
  renderRoomsManagerList();
}

function renderRoomsManagerList() {
  const container = document.getElementById('rooms-list-container');
  if (!container) return;
  container.innerHTML = '';

  const db = getRoomsDatabase();
  const rooms = Object.keys(db);
  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  const isAdmin = currentUser && currentUser.username.toLowerCase() === ADMIN_USER.toLowerCase();

  let html = '';

  if (isAdmin) {
    html += `
      <div style="margin-bottom:8px; font-weight:bold; font-size:12px; color:#5865f2;">👑 Gerenciar Usuários VIPs:</div>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="text" id="input-add-vip" placeholder="Digitar nome de usuário..." style="flex:1; background:#111214; border:1px solid #2b2d31; color:#fff; padding:4px 8px; border-radius:4px; font-size:12px;">
        <button class="btn-sm" style="padding:4px 10px; font-size:11px;" onclick="addCustomVipUser()">Tornar VIP</button>
      </div>
    `;

    const userKeys = Object.keys(usersDb);
    if (userKeys.length === 0) {
      html += '<span style="font-size:11px; color:#949ba4;">Nenhum usuário cadastrado ainda.</span>';
    } else {
      userKeys.forEach(u => {
        if (u.toLowerCase() !== ADMIN_USER.toLowerCase()) {
          const isVip = getVipUsers().includes(u);
          html += `
            <div class="room-item-row" style="margin-bottom:4px;">
              <span>👤 <strong>${u}</strong> ${isVip ? '⭐ VIP' : ''}</span>
              <button class="btn-sm" style="padding:2px 8px; font-size:10px; background:${isVip ? '#ed4245' : '#3ba55d'};" onclick="toggleUserVip('${u}')">
                ${isVip ? 'Remover VIP' : 'Tornar VIP'}
              </button>
            </div>
          `;
        }
      });
    }

    html += '<div style="margin:10px 0 6px 0; font-weight:bold; font-size:12px; color:#5865f2;">🔒 Salas Ativas:</div>';
  }

  if (rooms.length === 0) {
    html += '<span style="font-size:12px; color:#949ba4;">Nenhuma sala ativa.</span>';
  } else {
    rooms.forEach(roomName => {
      const roomInfo = db[roomName];
      const isOwner = currentUser && currentUser.username === roomInfo.owner;
      html += `
        <div class="room-item-row">
          <span>🔒 <strong>${roomName}</strong> (${roomInfo.owner})</span>
          ${(isAdmin || isOwner) ? `<button class="btn-delete-room" onclick="deleteRoomFromDb('${roomName}')">Excluir</button>` : '<span style="font-size:10px; color:#6d727a;">Protegida</span>'}
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

let currentTheme = localStorage.getItem('app_theme') || 'streamer';
function applyTheme(themeName) {
  currentTheme = themeName;
  localStorage.setItem('app_theme', themeName);
  document.body.classList.remove('theme-streamer', 'theme-minimalist');
  document.body.classList.add(`theme-${themeName}`);
}
applyTheme(currentTheme);

const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const userWelcomeText = document.getElementById('user-welcome-text');
const adminBadge = document.getElementById('admin-badge');
const vipShortcutBox = document.getElementById('vip-shortcut-box');
const btnEnterVipRoom = document.getElementById('btn-enter-vip-room');
const displayNameInput = document.getElementById('display-name-input');
const btnSaveDisplayName = document.getElementById('btn-save-display-name');

function updateAuthUI() {
  if (currentUser) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    userWelcomeText.innerText = `Olá, ${currentUser.username}!`;

    const isAdmin = currentUser.username.toLowerCase() === ADMIN_USER.toLowerCase();
    adminBadge.classList.toggle('hidden', !isAdmin);

    const isVip = isUserVipOrAdmin();
    vipShortcutBox.classList.toggle('hidden', !isVip);

    if (!myProfile.name) myProfile.name = currentUser.username;
    displayNameInput.value = myProfile.name;
    updateProfileUI();
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
    updateProfileUI();
    alert('Nome de exibição atualizado!');
  }
});

btnEnterVipRoom.addEventListener('click', () => {
  saveRoomToDb(VIP_ROOM_NAME, '7777', 'Exclusiva');
  initPeerConnection(VIP_ROOM_NAME, '7777', true);
});

const createRoomName = document.getElementById('create-room-name');
const createRoomPin = document.getElementById('create-room-pin');
const btnCreateRoom = document.getElementById('btn-create-room');
const joinRoomName = document.getElementById('join-room-name');
const joinRoomPin = document.getElementById('join-room-pin');
const btnJoinRoom = document.getElementById('btn-join-room');

btnCreateRoom.addEventListener('click', () => {
  const room = createRoomName.value.trim().toLowerCase();
  const pin = createRoomPin.value.trim();
  if (!room) return alert('Digite um nome para a sala!');
  if (!pin) return alert('Defina uma senha/PIN para a sala!');

  saveRoomToDb(room, pin, currentUser.username);
  initPeerConnection(room, pin, true);
});

btnJoinRoom.addEventListener('click', () => {
  const room = joinRoomName.value.trim().toLowerCase();
  const pin = joinRoomPin.value.trim();
  if (!room) return alert('Digite o nome da sala!');
  if (!pin) return alert('Digite a senha da sala!');

  const db = getRoomsDatabase();
  const roomData = db[room];

  if (roomData && String(roomData.pin).trim() !== String(pin).trim()) {
    return alert('❌ Senha incorreta! Digite a senha certa para entrar.');
  }

  initPeerConnection(room, pin, false);
});

function initPeerConnection(roomName, pin, isHost) {
  currentRoomName = roomName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  currentRoomPin = String(pin).trim();
  isHostInstance = isHost;
  const randomId = Math.random().toString(36).substring(2, 7);
  myPeerId = isHost ? `room-${currentRoomName}-host` : `room-${currentRoomName}-guest-${randomId}`;

  const isVipRoom = (currentRoomName === VIP_ROOM_NAME);
  document.querySelectorAll('.vip-only').forEach(el => el.classList.toggle('hidden', !isVipRoom));

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

let micStream = null; let screenStream = null; let mainCall = null; let screenCall = null; let dataConn = null;
const mainStream = document.getElementById('main-stream');
const stageEl = document.getElementById('stage');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const muteIndicatorLocal = document.getElementById('mute-indicator-local');
const screenPickerModal = document.getElementById('screen-picker-modal');
const screenSourcesList = document.getElementById('screen-sources-list');

function sendScreenCall() {
  if (!screenStream || !peer) return;
  const targetId = targetPeerId || (dataConn ? dataConn.peer : null);
  if (targetId) screenCall = peer.call(targetId, screenStream, { metadata: { type: 'screen' } });
}

function setupDataConnection(conn) {
  dataConn = conn;
  targetPeerId = conn.peer;

  dataConn.on('open', () => {
    sendDataMessage({ type: 'HANDSHAKE_PIN', pin: currentRoomPin });
    sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
  });

  dataConn.on('data', data => {
    if (data.type === 'HANDSHAKE_PIN') {
      if (isHostInstance && String(data.pin).trim() !== String(currentRoomPin).trim()) {
        sendDataMessage({ type: 'PIN_REJECTED' });
        setTimeout(() => { if (conn) conn.close(); }, 300);
      }
    } else if (data.type === 'PIN_REJECTED') {
      alert('❌ Senha da sala incorreta! Acesso negado pelo Host.');
      window.location.reload();
    } else if (data.type === 'PROFILE_UPDATE') {
      remoteProfile = data.profile;
      updateProfileUI();
      document.getElementById('status-badge').innerText = '🟢 Conectados';
      document.getElementById('status-badge').classList.add('connected');
    } else if (data.type === 'CHAT_MSG') {
      appendChatMessage(data.author, data.text);
    }
  });
}

function sendDataMessage(data) { if (dataConn && dataConn.open) dataConn.send(data); }

function updateProfileUI() {
  const avatarLocal = document.getElementById('avatar-img-local');
  const nameLocal = document.getElementById('avatar-name-local');
  const tagLocal = document.getElementById('name-tag-local');

  const avatarRemote = document.getElementById('avatar-img-remote');
  const nameRemote = document.getElementById('avatar-name-remote');
  const tagRemote = document.getElementById('name-tag-remote');

  if (avatarLocal) avatarLocal.src = myProfile.avatar || defaultAvatar;
  if (nameLocal) nameLocal.innerText = myProfile.name || 'Você';
  if (tagLocal) tagLocal.innerText = `${myProfile.name || 'Você'} (Você)`;

  if (avatarRemote) avatarRemote.src = remoteProfile.avatar || defaultAvatar;
  if (nameRemote) nameRemote.innerText = remoteProfile.name || 'Convidado';
  if (tagRemote) tagRemote.innerText = remoteProfile.name || 'Convidado';
}

function getMainCallStream() {
  const tracks = [];
  if (micStream) tracks.push(micStream.getAudioTracks()[0]);
  return new MediaStream(tracks);
}

async function startMicrophone() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream.getAudioTracks().forEach(t => t.enabled = false);
  } catch (e) { console.warn('Sem mic:', e); }
}

btnToggleMic.addEventListener('click', () => {
  isMicMuted = !isMicMuted;
  if (micStream) {
    micStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  }
  btnToggleMic.innerText = isMicMuted ? '🔇' : '🎤';
  btnToggleMic.classList.toggle('btn-danger', isMicMuted);
  muteIndicatorLocal.classList.toggle('hidden', !isMicMuted);
});

// FUNÇÃO DE TRANSMISSÃO COM ÁUDIO DO SISTEMA E SELEÇÃO DE QUALIDADE (RESOLUÇÃO/FPS)
async function startScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    mainStream.srcObject = null;
    updateStageLayoutMode();
    return;
  }

  const qualityVal = document.getElementById('screen-quality-select').value;
  const includeAudio = document.getElementById('screen-include-audio').checked;

  let width = 1280, height = 720, fps = 60;
  if (qualityVal === '1080p60') { width = 1920; height = 1080; fps = 60; }
  else if (qualityVal === '1080p30') { width = 1920; height = 1080; fps = 30; }

  if (window.electronAPI && window.electronAPI.getSources) {
    try {
      const sources = await window.electronAPI.getSources();
      screenSourcesList.innerHTML = '';

      if (!sources || sources.length === 0) {
        alert('Nenhuma janela de aplicativo encontrada para compartilhar.');
        return;
      }

      sources.forEach(source => {
        const card = document.createElement('div');
        card.className = 'source-item-card';
        card.innerHTML = `
          <img src="${source.thumbnail}">
          <span>${source.name}</span>
        `;
        card.addEventListener('click', async () => {
          screenPickerModal.classList.remove('active');
          try {
            const constraints = {
              audio: includeAudio ? {
                mandatory: {
                  chromeMediaSource: 'desktop'
                }
              } : false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: source.id,
                  maxWidth: width,
                  maxHeight: height,
                  maxFrameRate: fps
                }
              }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            screenStream = stream;
            mainStream.srcObject = screenStream;

            stream.getVideoTracks()[0].onended = () => {
              screenStream = null;
              mainStream.srcObject = null;
              updateStageLayoutMode();
            };

            sendScreenCall();
            updateStageLayoutMode();
          } catch (err) {
            console.error('Erro ao capturar fonte:', err);
            alert('Não foi possível capturar esta janela.');
          }
        });
        screenSourcesList.appendChild(card);
      });

      screenPickerModal.classList.add('active');
    } catch (err) {
      console.error('Erro no Electron getSources:', err);
      alert('Erro ao carregar fontes de tela.');
    }
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: width }, height: { max: height }, frameRate: { max: fps } },
        audio: includeAudio
      });
      mainStream.srcObject = screenStream;

      screenStream.getVideoTracks()[0].onended = () => {
        screenStream = null;
        mainStream.srcObject = null;
        updateStageLayoutMode();
      };

      sendScreenCall();
      updateStageLayoutMode();
    } catch(e) {}
  }
}

document.getElementById('btn-screen').addEventListener('click', startScreenShare);
document.getElementById('btn-close-screen-picker').addEventListener('click', () => screenPickerModal.classList.remove('active'));
const btnCloseTop = document.getElementById('btn-close-screen-picker-top');
if (btnCloseTop) btnCloseTop.addEventListener('click', () => screenPickerModal.classList.remove('active'));

const chatDrawer = document.getElementById('chat-drawer');
const btnOpenChat = document.getElementById('btn-open-chat');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const chatMessagesList = document.getElementById('chat-messages-list');
const chatUnreadDot = document.getElementById('chat-unread-dot');

btnOpenChat.addEventListener('click', (e) => {
  e.stopPropagation();
  chatDrawer.classList.toggle('open');
  if (chatDrawer.classList.contains('open')) chatUnreadDot.classList.add('hidden');
});
btnCloseChat.addEventListener('click', () => chatDrawer.classList.remove('open'));

function appendChatMessage(author, text) {
  const row = document.createElement('div');
  row.className = 'chat-msg-row';
  row.innerHTML = `<span class="chat-msg-author">${author}:</span> <span>${text}</span>`;
  chatMessagesList.appendChild(row);
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;

  if (!chatDrawer.classList.contains('open')) {
    chatUnreadDot.classList.remove('hidden');
  }
}

btnSendChat.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  appendChatMessage(myProfile.name || 'Você', text);
  sendDataMessage({ type: 'CHAT_MSG', author: myProfile.name || 'Você', text: text });
  chatInput.value = '';
});

function updateStageLayoutMode() {
  const hasScreen = !!mainStream.srcObject;
  stageEl.classList.toggle('camera-focus-mode', !hasScreen);
}

function attachMainCallEvents(call) {
  call.on('stream', stream => {
    document.getElementById('remote-voice-audio').srcObject = stream;
    document.getElementById('status-badge').innerText = '🟢 Conectados';
    document.getElementById('status-badge').classList.add('connected');
  });
}

document.getElementById('theme-select').addEventListener('change', (e) => applyTheme(e.target.value));
document.getElementById('btn-open-settings').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('settings-modal').classList.add('active'); });
document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('active'));
document.getElementById('btn-open-profile').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profile-modal').classList.add('active'); });
document.getElementById('btn-close-profile').addEventListener('click', () => document.getElementById('profile-modal').classList.remove('active'));
document.getElementById('btn-open-roulette').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('roulette-modal').classList.add('active'); });
document.getElementById('btn-close-roulette').addEventListener('click', () => document.getElementById('roulette-modal').classList.remove('active'));
document.getElementById('btn-open-bucket').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('bucket-modal').classList.add('active'); });
document.getElementById('btn-close-bucket-top').addEventListener('click', () => document.getElementById('bucket-modal').classList.remove('active'));
document.getElementById('btn-open-notes').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('notes-drawer').classList.toggle('open'); });
document.getElementById('btn-close-notes').addEventListener('click', () => document.getElementById('notes-drawer').classList.remove('open'));

document.getElementById('btn-hangup').addEventListener('click', () => window.location.reload());

updateAuthUI(); 