// --- CARGOS & CONTEXTO VIP ---
const ADMIN_USER = "steiner777";
const VIP_ROOM_NAME = "nosso-cantinho";

// Prefixo dos IDs no servidor do PeerJS (evita colisão com outros apps)
const PEER_PREFIX = "space777-";
const HEARTBEAT_MS = 2000;            // ping a cada 2s
const HEARTBEAT_TIMEOUT_MS = 8000;    // sem sinal por 8s = a pessoa caiu
const GUEST_CONNECT_TIMEOUT_MS = 9000;
const JOIN_VERIFY_TIMEOUT_MS = 20000; // tempo máximo para confirmar a senha antes de desistir

let currentUser = JSON.parse(localStorage.getItem('app_logged_user')) || null;
let currentRoomName = '';
let currentRoomPin = '';
let inRoom = false;
let roomSession = 0;          // muda a cada entrada/saída: invalida tentativas antigas
let roomEntered = false;      // já passou da tela de senha e está dentro da sala
let joinOrigin = 'join';      // de onde veio o pedido: 'join' | 'create' | 'list'
let joinTrusted = false;      // senha já conhecida/confirmada (sala sua ou já visitada)
let joinBusy = false;         // verificando a senha
let joinTimeoutTimer = null;
let myPeerId = '';
let targetPeerId = null;
let peer = null;
let isMicMuted = true;
let isHostInstance = false;
let remoteVerified = false;   // o outro lado já provou que sabe o PIN
let lastSeen = 0;

let reconnectTimer = null;
let guestConnectTimer = null;
let heartbeatTimer = null;
let callTimerInterval = null;
let callStartedAt = 0;

let micStream = null;
let camStream = null;
let camCall = null;           // câmera que EU envio
let incomingCamCall = null;   // câmera que EU assisto
let screenStream = null;
let mainCall = null;
let screenCall = null;          // transmissão que EU envio
let incomingScreenCall = null;  // transmissão que EU assisto
let dataConn = null;

const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%235865f2'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M22 80c0-15 12-25 28-25s28 10 28 25z' fill='%23ffffff'/></svg>";

let myProfile = {
  name: localStorage.getItem('profile_name') || '',
  avatar: defaultAvatar,
  status: '🟢 Disponível'
};

function makeEmptyRemoteProfile() {
  return { name: 'Convidado', avatar: defaultAvatar, status: 'Aguardando...' };
}
let remoteProfile = makeEmptyRemoteProfile();

// ---------------------------------------------------------------------------
// ELEMENTOS DA PÁGINA
// ---------------------------------------------------------------------------
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const userWelcomeText = document.getElementById('user-welcome-text');
const adminBadge = document.getElementById('admin-badge');
const myRoomsList = document.getElementById('my-rooms-list');
const sidebarUserName = document.getElementById('sidebar-user-name');
const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
const btnEditDisplayName = document.getElementById('btn-edit-display-name');
const lobbyTitle = document.getElementById('lobby-title');
const lobbyHint = document.getElementById('lobby-hint');
const tabJoin = document.getElementById('tab-join');
const tabCreate = document.getElementById('tab-create');
const panelJoin = document.getElementById('panel-join');
const panelCreate = document.getElementById('panel-create');

const btnOpenAdmin = document.getElementById('btn-open-admin');
const adminDrawer = document.getElementById('admin-drawer');
const adminScrim = document.getElementById('admin-scrim');
const btnCloseAdmin = document.getElementById('btn-close-admin');
const tabAdminUsers = document.getElementById('tab-admin-users');
const tabAdminRooms = document.getElementById('tab-admin-rooms');
const adminSearch = document.getElementById('admin-search');
const adminList = document.getElementById('admin-list');
const adminAddRow = document.getElementById('admin-add-row');
const adminAddVip = document.getElementById('admin-add-vip');
const btnAdminAddVip = document.getElementById('btn-admin-add-vip');

const createRoomName = document.getElementById('create-room-name');
const createRoomPin = document.getElementById('create-room-pin');
const btnCreateRoom = document.getElementById('btn-create-room');
const joinRoomName = document.getElementById('join-room-name');
const joinRoomPin = document.getElementById('join-room-pin');
const btnJoinRoom = document.getElementById('btn-join-room');

const statusBadge = document.getElementById('status-badge');
const callTimerEl = document.getElementById('call-timer');
const mainStream = document.getElementById('main-stream');
const camsContainer = document.getElementById('cams-container');
const containerScreenVolume = document.getElementById('container-screen-volume');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const muteIndicatorLocal = document.getElementById('mute-indicator-local');
const screenPickerModal = document.getElementById('screen-picker-modal');
const screenSourcesList = document.getElementById('screen-sources-list');

const remoteVoiceAudio = document.getElementById('remote-voice-audio');
const remoteMicVolumeSlider = document.getElementById('remote-mic-volume');
const micVolValueLabel = document.getElementById('mic-vol-value');
const remoteScreenAudio = document.getElementById('remote-screen-audio');
const remoteScreenVolumeSlider = document.getElementById('remote-screen-volume');
const screenVolValueLabel = document.getElementById('screen-vol-value');

const chatDrawer = document.getElementById('chat-drawer');
const btnOpenChat = document.getElementById('btn-open-chat');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const chatMessagesList = document.getElementById('chat-messages-list');
const chatUnreadDot = document.getElementById('chat-unread-dot');

const joinError = document.getElementById('join-error');
const createError = document.getElementById('create-error');

const btnToggleCam = document.getElementById('btn-toggle-cam');
const localCam = document.getElementById('local-cam');
const remoteCam = document.getElementById('remote-cam');
const avatarLocalBox = document.getElementById('avatar-local');
const avatarRemoteBox = document.getElementById('avatar-remote');

const settingsModal = document.getElementById('settings-modal');
const micSelect = document.getElementById('mic-select');
const camSelect = document.getElementById('camera-select');
const speakerSelect = document.getElementById('speaker-select');

const pwCurrent = document.getElementById('pw-current');
const pwNew = document.getElementById('pw-new');
const pwConfirm = document.getElementById('pw-confirm');
const pwMessage = document.getElementById('pw-message');
const btnChangePassword = document.getElementById('btn-change-password');

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mesmo nome usado no banco local e no ID do PeerJS
function normalizeRoomName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function safeClose(x) {
  try { if (x) x.close(); } catch (e) {}
}

function setStatus(text, connected = false) {
  statusBadge.innerText = text;
  statusBadge.classList.toggle('connected', connected);
}

function isAdminUser() {
  return !!currentUser && currentUser.username.toLowerCase() === ADMIN_USER.toLowerCase();
}

// ---------------------------------------------------------------------------
// VIPs, SALAS (banco local) E TEMA
// ---------------------------------------------------------------------------
function getVipUsers() {
  return JSON.parse(localStorage.getItem('app_vip_users') || '[]');
}

function toggleUserVip(username) {
  let vips = getVipUsers();
  const index = vips.indexOf(username);
  if (index >= 0) vips.splice(index, 1);
  else vips.push(username);
  localStorage.setItem('app_vip_users', JSON.stringify(vips));
  renderAdminPanel();
  renderMyRooms();
}

function addCustomVipUser() {
  const username = adminAddVip.value.trim();
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
  adminAddVip.value = '';
  renderAdminPanel();
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
  const existing = db[name];
  db[name] = {
    pin: String(pin).trim(),
    owner: owner,
    created: existing && existing.created ? existing.created : Date.now()
  };
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
}

function deleteRoomFromDb(name) {
  const db = getRoomsDatabase();
  delete db[name];
  localStorage.setItem('app_rooms_db', JSON.stringify(db));
  renderMyRooms();
  renderAdminPanel();
}

// Entra de novo numa sala salva (sem digitar o PIN)
function enterSavedRoom(name) {
  const info = getRoomsDatabase()[name];
  if (!info) return showToast('Sala não encontrada.');
  joinRoom(name, info.pin, 'list');
}

// ---------------------------------------------------------------------------
// MINHAS SALAS (lista lateral do lobby)
// Mostra as salas que você criou + as que já visitou, para voltar com 1 clique
// ---------------------------------------------------------------------------
function recentsKey() {
  return `app_recent_rooms:${currentUser ? currentUser.username : ''}`;
}

function getRecentRooms() {
  try { return JSON.parse(localStorage.getItem(recentsKey()) || '[]'); }
  catch (e) { return []; }
}

function rememberRoom(name, pin) {
  if (!currentUser) return;
  const list = getRecentRooms().filter(r => r.name !== name);
  list.unshift({ name, pin: String(pin), last: Date.now() });
  localStorage.setItem(recentsKey(), JSON.stringify(list.slice(0, 20)));
}

function forgetRoom(name) {
  if (!currentUser) return;
  const list = getRecentRooms().filter(r => r.name !== name);
  localStorage.setItem(recentsKey(), JSON.stringify(list));
}

function getMyRooms() {
  if (!currentUser) return [];
  const db = getRoomsDatabase();
  const rooms = [];
  const seen = new Set();

  getRecentRooms().forEach(r => {
    seen.add(r.name);
    const info = db[r.name];
    rooms.push({
      name: r.name,
      pin: info ? info.pin : r.pin,   // se a sala é sua, vale o PIN atual
      last: r.last,
      owned: !!info && info.owner === currentUser.username
    });
  });

  Object.keys(db).forEach(n => {
    if (!seen.has(n) && db[n].owner === currentUser.username) {
      seen.add(n);
      rooms.push({ name: n, pin: db[n].pin, last: 0, owned: true });
    }
  });

  const isVipUser = isUserVipOrAdmin();
  rooms.forEach(r => { r.vip = (r.name === VIP_ROOM_NAME && isVipUser); });
  if (isVipUser && !seen.has(VIP_ROOM_NAME)) {
    rooms.push({ name: VIP_ROOM_NAME, pin: '7777', last: 0, owned: false, vip: true });
  }

  rooms.sort((a, b) => (b.vip ? 1 : 0) - (a.vip ? 1 : 0) || b.last - a.last);
  return rooms;
}

function formatLastUsed(ts) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'usada hoje';
  if (days === 1) return 'usada ontem';
  return `usada há ${days} dias`;
}

function renderMyRooms() {
  if (!myRoomsList) return;
  const rooms = getMyRooms();

  if (rooms.length === 0) {
    myRoomsList.innerHTML = '<p class="lobby-empty">Você ainda não tem salas. Crie uma ou entre na sala de um amigo; ela fica salva aqui.</p>';
    return;
  }

  myRoomsList.innerHTML = rooms.map(r => {
    const kind = r.vip ? 'Sala exclusiva' : (r.owned ? 'Criada por você' : 'Visitada');
    const when = formatLastUsed(r.last);
    const sub = when ? `${kind} · ${when}` : kind;
    const name = escapeHtml(r.name);
    return `
      <div class="room-card-row${r.vip ? ' vip' : ''}">
        <div class="room-card-info">
          <strong>${name}</strong>
          <span>${escapeHtml(sub)}</span>
        </div>
        <button class="btn-enter-room" data-action="enter-listed" data-name="${name}">Entrar</button>
        ${r.name === VIP_ROOM_NAME ? '' : `<button class="btn-remove-room" data-action="remove-listed" data-name="${name}" aria-label="Remover ${name} da lista" title="Remover da lista">✕</button>`}
      </div>
    `;
  }).join('');
}

function enterListedRoom(name) {
  const item = getMyRooms().find(r => r.name === name);
  if (!item) return showToast('Sala não encontrada.');
  if (name === VIP_ROOM_NAME && !getRoomsDatabase()[name]) {
    saveRoomToDb(VIP_ROOM_NAME, '7777', 'Exclusiva');
  }
  joinRoom(item.name, item.pin, 'list');
}

function removeListedRoom(name) {
  const info = getRoomsDatabase()[name];
  const owned = !!info && !!currentUser && info.owner === currentUser.username;
  if (owned) {
    if (!confirm(`Excluir a sala "${name}" da sua lista?`)) return;
    deleteRoomFromDb(name);
  }
  forgetRoom(name);
  renderMyRooms();
}

myRoomsList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'enter-listed') enterListedRoom(btn.dataset.name);
  else if (btn.dataset.action === 'remove-listed') removeListedRoom(btn.dataset.name);
});

// ---------------------------------------------------------------------------
// PAINEL ADMIN (gaveta lateral, só para a administradora)
// ---------------------------------------------------------------------------
let adminTab = 'users';

function setAdminTab(tab) {
  adminTab = tab;
  tabAdminUsers.classList.toggle('active', tab === 'users');
  tabAdminRooms.classList.toggle('active', tab === 'rooms');
  tabAdminUsers.setAttribute('aria-pressed', String(tab === 'users'));
  tabAdminRooms.setAttribute('aria-pressed', String(tab === 'rooms'));
  adminSearch.placeholder = tab === 'users' ? 'Buscar usuário' : 'Buscar sala';
  renderAdminPanel();
}

function renderAdminPanel() {
  if (!adminList) return;
  adminAddRow.classList.toggle('hidden', adminTab !== 'users');
  if (!isAdminUser()) { adminList.innerHTML = ''; return; }

  const term = adminSearch.value.trim().toLowerCase();
  let html = '';

  if (adminTab === 'users') {
    const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
    const vips = getVipUsers();
    const names = Object.keys(usersDb).filter(u =>
      u.toLowerCase() !== ADMIN_USER.toLowerCase() && u.toLowerCase().includes(term));

    if (names.length === 0) {
      html = '<p class="lobby-empty">Nenhum usuário encontrado.</p>';
    } else {
      names.forEach(u => {
        const isVip = vips.includes(u);
        const name = escapeHtml(u);
        html += `
          <div class="admin-row">
            <span class="mini-avatar">${escapeHtml((u.trim()[0] || '?').toUpperCase())}</span>
            <strong>${name}</strong>
            ${isVip ? '<span class="tag-vip">VIP</span>' : ''}
            <span class="sp"></span>
            <button class="sw${isVip ? ' on' : ''}" data-action="toggle-vip" data-name="${name}" aria-pressed="${isVip}" aria-label="VIP de ${name}"></button>
          </div>
        `;
      });
    }
  } else {
    const db = getRoomsDatabase();
    const names = Object.keys(db).filter(n => n.includes(term));

    if (names.length === 0) {
      html = '<p class="lobby-empty">Nenhuma sala encontrada.</p>';
    } else {
      names.forEach(n => {
        const name = escapeHtml(n);
        html += `
          <div class="admin-row">
            <div class="room-card-info">
              <strong>${name}</strong>
              <span>dono: ${escapeHtml(db[n].owner)}</span>
            </div>
            <button class="btn-enter-room" data-action="enter-room" data-name="${name}">Entrar</button>
            <button class="btn-danger-sm" data-action="delete-room" data-name="${name}">Excluir</button>
          </div>
        `;
      });
    }
  }

  adminList.innerHTML = html;
}

function openAdminPanel() {
  if (!isAdminUser()) return;
  renderAdminPanel();
  adminDrawer.classList.add('open');
  adminScrim.classList.add('active');
}

function closeAdminPanel() {
  adminDrawer.classList.remove('open');
  adminScrim.classList.remove('active');
}

adminList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const name = btn.dataset.name;
  if (btn.dataset.action === 'toggle-vip') toggleUserVip(name);
  else if (btn.dataset.action === 'enter-room') enterSavedRoom(name);
  else if (btn.dataset.action === 'delete-room') {
    if (confirm(`Excluir a sala "${name}"?`)) deleteRoomFromDb(name);
  }
});

btnOpenAdmin.addEventListener('click', openAdminPanel);
btnCloseAdmin.addEventListener('click', closeAdminPanel);
adminScrim.addEventListener('click', closeAdminPanel);
tabAdminUsers.addEventListener('click', () => setAdminTab('users'));
tabAdminRooms.addEventListener('click', () => setAdminTab('rooms'));
adminSearch.addEventListener('input', renderAdminPanel);
btnAdminAddVip.addEventListener('click', addCustomVipUser);
adminAddVip.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomVipUser(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAdminPanel(); });


// ---------------------------------------------------------------------------
// LOGIN / CADASTRO
// ---------------------------------------------------------------------------
function updateSidebarUser() {
  const name = myProfile.name || (currentUser ? currentUser.username : '');
  sidebarUserName.innerText = name;
  sidebarUserAvatar.innerText = (name.trim()[0] || '?').toUpperCase();
}

function updateAuthUI() {
  if (currentUser) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    userWelcomeText.innerText = `@${currentUser.username}`;

    adminBadge.classList.toggle('hidden', !isAdminUser());
    btnOpenAdmin.classList.toggle('hidden', !isAdminUser());

    if (!myProfile.name) myProfile.name = currentUser.username;
    updateSidebarUser();
    updateProfileUI();
    renderMyRooms();
    renderAdminPanel();
  } else {
    closeAdminPanel();
    authScreen.classList.remove('hidden');
    lobbyScreen.classList.add('hidden');
  }
}

btnLogin.addEventListener('click', () => {
  const typed = authUsername.value.trim();
  const pass = authPassword.value.trim();
  if (!typed || !pass) return showToast('Preencha usuário e senha!');

  // A administradora sempre usa o mesmo nome, não importa maiúsculas/minúsculas
  const user = typed.toLowerCase() === ADMIN_USER.toLowerCase() ? ADMIN_USER : typed;
  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');

  const okByDb = !!usersDb[user] && usersDb[user] === pass;
  // A senha padrão da admin só vale enquanto ela não trocar a senha no perfil
  const okAdminDefault = user === ADMIN_USER && !usersDb[user] && pass === "777";

  if (okByDb || okAdminDefault) {
    currentUser = { username: user };
    localStorage.setItem('app_logged_user', JSON.stringify(currentUser));
    updateAuthUI();
  } else {
    showToast('Usuário ou senha incorretos!');
  }
});

btnRegister.addEventListener('click', () => {
  const user = authUsername.value.trim();
  const pass = authPassword.value.trim();
  if (!user || !pass) return showToast('Digite usuário e senha para cadastrar!');

  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  if (usersDb[user] || user.toLowerCase() === ADMIN_USER.toLowerCase()) {
    return showToast('Esse usuário já existe. Use "Entrar" (a senha pode ser trocada no Perfil).');
  }

  usersDb[user] = pass;
  localStorage.setItem('app_users_db', JSON.stringify(usersDb));

  currentUser = { username: user };
  localStorage.setItem('app_logged_user', JSON.stringify(currentUser));
  showToast('Conta criada com sucesso!');
  updateAuthUI();
});

btnLogout.addEventListener('click', () => {
  localStorage.removeItem('app_logged_user');
  currentUser = null;
  updateAuthUI();
});

// Nome de exibição: editado pelo botão "Editar" da lateral (abre o modal de perfil)
function applyDisplayName(val) {
  if (!val) return;
  myProfile.name = val.slice(0, 40);
  localStorage.setItem('profile_name', myProfile.name);
  const profileInput = document.getElementById('profile-name-input');
  if (profileInput) profileInput.value = myProfile.name;
  updateSidebarUser();
  updateProfileUI();
  if (remoteVerified) sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
  showToast('Nome de exibição atualizado!');
}

btnEditDisplayName.addEventListener('click', openProfileModal);

const btnSaveProfile = document.getElementById('btn-save-profile');
if (btnSaveProfile) {
  btnSaveProfile.addEventListener('click', () => {
    applyDisplayName(document.getElementById('profile-name-input').value.trim());
    closeProfileModal();
  });
}

// ---------------------------------------------------------------------------
// LOBBY: ABAS "ENTRAR" / "CRIAR SALA" (só um formulário por vez)
// ---------------------------------------------------------------------------
function setLobbyTab(tab) {
  const isJoin = tab === 'join';
  panelJoin.classList.toggle('hidden', !isJoin);
  panelCreate.classList.toggle('hidden', isJoin);
  tabJoin.classList.toggle('active', isJoin);
  tabCreate.classList.toggle('active', !isJoin);
  tabJoin.setAttribute('aria-pressed', String(isJoin));
  tabCreate.setAttribute('aria-pressed', String(!isJoin));
  lobbyTitle.innerText = isJoin ? 'Entrar numa sala' : 'Criar uma sala';
  lobbyHint.innerText = isJoin
    ? 'Use o nome e a senha que seu amigo passou. As salas que você já usou ficam na lista ao lado.'
    : 'Escolha um nome e um PIN. Depois é só voltar pela lista ao lado, sem criar de novo.';
}

tabJoin.addEventListener('click', () => setLobbyTab('join'));
tabCreate.addEventListener('click', () => setLobbyTab('create'));

btnCreateRoom.addEventListener('click', () => {
  if (joinBusy) return;
  clearFormErrors();
  const room = normalizeRoomName(createRoomName.value);
  const pin = createRoomPin.value.trim();
  if (!room) return showFormError('create', 'Digite um nome válido (letras, números, - ou _).', createRoomName);
  if (!pin) return showFormError('create', 'Defina uma senha/PIN para a sala.', createRoomPin);

  const existing = getRoomsDatabase()[room];
  if (existing && existing.owner !== currentUser.username && !isAdminUser()) {
    return showFormError('create', 'Já existe uma sala com esse nome. Escolha outro nome ou use "Entrar".', createRoomName);
  }

  // Se a sala já é sua, "criar" só atualiza o PIN e entra: não precisa recriar sempre
  saveRoomToDb(room, pin, existing ? existing.owner : currentUser.username);
  joinRoom(room, pin, 'create');
});

btnJoinRoom.addEventListener('click', () => {
  if (joinBusy) return;
  clearFormErrors();
  const room = normalizeRoomName(joinRoomName.value);
  const pin = joinRoomPin.value.trim();
  if (!room) return showFormError('join', 'Digite o nome da sala.', joinRoomName);
  if (!pin) return showFormError('join', 'Digite a senha da sala.', joinRoomPin);

  // Sala conhecida neste computador: confere aqui mesmo, sem tentar conectar
  const roomData = getRoomsDatabase()[room];
  if (roomData && String(roomData.pin).trim() !== pin) {
    return showFormError('join', '❌ Senha incorreta. Confira com quem criou a sala.', joinRoomPin);
  }

  joinRoom(room, pin, 'join');
});

[joinRoomName, joinRoomPin, createRoomName, createRoomPin].forEach(el => {
  el.addEventListener('input', clearFormErrors);
});
createRoomPin.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnCreateRoom.click(); });
joinRoomPin.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnJoinRoom.click(); });

// ===========================================================================
// SALAS: ENTRAR, SAIR E VOLTAR
//
// Não existe mais "host fixo". Quem chega primeiro assume o ID da sala
// (vira anfitrião); quem chega depois conecta nele. Se o anfitrião sai, quem
// ficou assume a sala sozinho e espera a próxima pessoa. Assim qualquer um
// pode sair e voltar, e a sala funciona em outro dia sem recriar nada.
// ===========================================================================
function getHostPeerId() {
  return `${PEER_PREFIX}${currentRoomName}-host`;
}

function createPeer(id) {
  return new Peer(id, {
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
}

function isCurrentPeer(p, session) {
  return inRoom && session === roomSession && peer === p;
}

function destroyPeer() {
  if (peer) {
    const old = peer;
    peer = null;
    try { old.destroy(); } catch (e) {}
  }
}

function closeRemoteConnections() {
  const dc = dataConn, mc = mainCall, sc = screenCall, isc = incomingScreenCall, cc = camCall, icc = incomingCamCall;
  dataConn = null; mainCall = null; screenCall = null; incomingScreenCall = null; camCall = null; incomingCamCall = null;
  targetPeerId = null;
  remoteVerified = false;
  [mc, sc, isc, cc, icc].forEach(safeClose);
  safeClose(dc);
}

// Uma senha é "confiável" quando já foi confirmada antes (sala sua ou já visitada)
function isPinTrusted(room, pin, origin) {
  if (origin === 'create') return true;
  const dbInfo = getRoomsDatabase()[room];
  if (dbInfo && String(dbInfo.pin).trim() === pin) return true;
  const recent = getRecentRooms().find(r => r.name === room);
  return !!recent && String(recent.pin) === pin;
}

function clearFormErrors() {
  [joinError, createError].forEach(el => { el.classList.add('hidden'); el.innerText = ''; });
  [joinRoomName, joinRoomPin, createRoomName, createRoomPin].forEach(el => el.classList.remove('input-error'));
}

function showFormError(kind, msg, field) {
  setLobbyTab(kind); // 'join' | 'create'
  const box = kind === 'create' ? createError : joinError;
  box.innerText = msg;
  box.classList.remove('hidden');
  if (field) { field.classList.add('input-error'); field.focus(); }
}

function showJoinError(origin, room, msg) {
  if (origin === 'create') return showFormError('create', msg, createRoomPin);
  if (origin === 'list') { joinRoomName.value = room; joinRoomPin.value = ''; }
  showFormError('join', msg, joinRoomPin);
}

function setJoinBusy(busy) {
  joinBusy = busy;
  btnJoinRoom.disabled = busy;
  btnCreateRoom.disabled = busy;
  btnJoinRoom.innerText = (busy && joinOrigin === 'join') ? '⏳ Verificando...' : '🔌 Entrar na sala';
  btnCreateRoom.innerText = (busy && joinOrigin === 'create') ? '⏳ Verificando...' : '🚀 Criar e entrar';
  myRoomsList.classList.toggle('busy', busy);
}

// Pede para entrar. A tela do lobby só some depois que a senha for confirmada;
// se estiver errada, o erro aparece no próprio formulário.
function joinRoom(roomName, pin, origin = 'join') {
  if (joinBusy) return;
  leaveRoom({ silent: true });
  closeAdminPanel();

  const name = normalizeRoomName(roomName);
  const cleanPin = String(pin).trim();
  if (!name) return showJoinError(origin, roomName, 'Nome de sala inválido.');

  currentRoomName = name;
  currentRoomPin = cleanPin;
  joinOrigin = origin;
  joinTrusted = isPinTrusted(name, cleanPin, origin);
  roomEntered = false;
  clearFormErrors();

  inRoom = true;
  roomSession++;
  const session = roomSession;

  setJoinBusy(true);
  setStatus('Conectando...');
  heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_MS);
  joinTimeoutTimer = setTimeout(() => {
    if (session === roomSession && !roomEntered) {
      failJoin('Não foi possível conectar à sala. Confira o nome e sua internet e tente de novo.');
    }
  }, JOIN_VERIFY_TIMEOUT_MS);

  connectToRoom(session);
}

// Senha confirmada: agora sim entra na sala (some o lobby, liga o microfone)
async function enterRoomUI(session) {
  if (session !== roomSession || !inRoom) return;

  if (!roomEntered) {
    roomEntered = true;
    clearTimeout(joinTimeoutTimer);
    setJoinBusy(false);
    rememberRoom(currentRoomName, currentRoomPin);
    clearFormErrors();
    [joinRoomName, joinRoomPin, createRoomName, createRoomPin].forEach(el => { el.value = ''; });

    const isVipRoom = (currentRoomName === VIP_ROOM_NAME);
    document.querySelectorAll('.vip-only').forEach(el => el.classList.toggle('hidden', !isVipRoom));
    document.getElementById('room-name-display').innerText = `🔒 Sala: ${currentRoomName}`;
    lobbyScreen.classList.add('hidden');

    isMicMuted = true;
    applyMicButtonState();
    applySpeakerToAudioElements();
  }

  await startMicrophone();
}

// Não deu para entrar: volta para o formulário mostrando o motivo
function failJoin(msg) {
  const origin = joinOrigin;
  const room = currentRoomName;
  leaveRoom({ silent: true });
  showJoinError(origin, room, msg);
}

function leaveRoom({ silent = false } = {}) {
  if (inRoom && roomEntered) sendDataMessage({ type: 'BYE' });

  inRoom = false;
  roomEntered = false;
  roomSession++;
  clearTimeout(reconnectTimer);
  clearTimeout(guestConnectTimer);
  clearTimeout(joinTimeoutTimer);
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  setJoinBusy(false);

  stopScreenShare();
  stopCamera();

  // Solta tudo; o fechamento real espera 200ms para o aviso (BYE) chegar
  const oldPeer = peer; peer = null;
  const dc = dataConn, mc = mainCall, sc = screenCall, isc = incomingScreenCall, icc = incomingCamCall;
  dataConn = null; mainCall = null; screenCall = null; incomingScreenCall = null; incomingCamCall = null;
  targetPeerId = null;
  remoteVerified = false;
  setTimeout(() => {
    [mc, sc, isc, icc].forEach(safeClose);
    safeClose(dc);
    try { if (oldPeer) oldPeer.destroy(); } catch (e) {}
  }, 200);

  stopCallTimer();
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  isMicMuted = true;
  applyMicButtonState();

  chatDrawer.classList.remove('open');
  chatMessagesList.innerHTML = '';
  chatUnreadDot.classList.add('hidden');

  resetRemoteState();
  setStatus('Aguardando...');

  if (!silent) updateAuthUI();
}

function connectToRoom(session) {
  if (session !== roomSession || !inRoom) return;
  clearTimeout(reconnectTimer);
  clearTimeout(guestConnectTimer);
  destroyPeer();
  closeRemoteConnections();
  setStatus('Conectando...');
  tryBecomeHost(session);
}

// Passo 1: tenta ser o anfitrião (ID da sala livre = a sala está vazia)
function tryBecomeHost(session) {
  const hostId = getHostPeerId();
  const p = createPeer(hostId);
  peer = p;

  p.on('open', () => {
    if (!isCurrentPeer(p, session)) return;
    isHostInstance = true;
    myPeerId = hostId;
    setStatus('Aguardando...');

    if (!roomEntered) {
      if (joinTrusted) enterRoomUI(session);
      else failJoin('Ninguém está nessa sala agora, então não dá para conferir a senha. Peça para o dono entrar primeiro ou crie a sala em "Criar sala".');
    }
  });

  p.on('connection', conn => {
    if (!isCurrentPeer(p, session)) { safeClose(conn); return; }

    // Sala já ocupada por alguém conectado de verdade
    if (dataConn && dataConn.open && Date.now() - lastSeen < HEARTBEAT_TIMEOUT_MS) {
      const sendFull = () => {
        try { conn.send({ type: 'ROOM_FULL' }); } catch (e) {}
        setTimeout(() => safeClose(conn), 300);
      };
      if (conn.open) sendFull(); else conn.on('open', sendFull);
      return;
    }

    // Conexão anterior morta/fantasma: troca pela nova
    if (dataConn) closeRemoteConnections();
    setupDataConnection(conn, session);
  });

  p.on('call', call => handleIncomingCall(call));

  p.on('error', err => {
    if (!isCurrentPeer(p, session)) return;
    if (err.type === 'unavailable-id') {
      // Já tem anfitrião: então eu entro como convidado
      destroyPeer();
      becomeGuest(session);
    } else {
      handlePeerError(err, session);
    }
  });

  p.on('disconnected', () => handlePeerDisconnected(p, session));
}

// Passo 2: já existe anfitrião, conecta nele
function becomeGuest(session) {
  if (session !== roomSession || !inRoom) return;
  isHostInstance = false;

  const hostId = getHostPeerId();
  const guestId = `${PEER_PREFIX}${currentRoomName}-guest-${Math.random().toString(36).substring(2, 8)}`;
  const p = createPeer(guestId);
  peer = p;
  myPeerId = guestId;

  p.on('open', () => {
    if (!isCurrentPeer(p, session)) return;
    setStatus('Entrando na sala...');
    const conn = p.connect(hostId, { reliable: true });
    setupDataConnection(conn, session);

    // Anfitrião fantasma (caiu sem avisar): desiste e tenta de novo
    clearTimeout(guestConnectTimer);
    guestConnectTimer = setTimeout(() => {
      if (!isCurrentPeer(p, session) || remoteVerified) return;
      scheduleReconnect(session, 500);
    }, GUEST_CONNECT_TIMEOUT_MS);
  });

  p.on('call', call => handleIncomingCall(call));

  p.on('error', err => {
    if (!isCurrentPeer(p, session)) return;
    if (err.type === 'peer-unavailable') {
      // Ninguém na sala (o anfitrião saiu): tenta assumir a sala
      scheduleReconnect(session, 1500);
    } else {
      handlePeerError(err, session);
    }
  });

  p.on('disconnected', () => handlePeerDisconnected(p, session));
}

function scheduleReconnect(session, delay = 3000) {
  if (session !== roomSession || !inRoom) return;
  clearTimeout(reconnectTimer);
  clearTimeout(guestConnectTimer);
  destroyPeer();
  closeRemoteConnections();
  setStatus('Reconectando...');
  reconnectTimer = setTimeout(() => connectToRoom(session), delay);
}

function handlePeerError(err, session) {
  console.warn('Erro do PeerJS:', err.type, err);
  const signalingErrors = ['network', 'server-error', 'socket-error', 'socket-closed'];
  if (!signalingErrors.includes(err.type)) return;
  // Se a chamada P2P já está de pé, ela segue funcionando sem o servidor
  if (dataConn && dataConn.open && remoteVerified) return;
  scheduleReconnect(session, 3000);
}

function handlePeerDisconnected(p, session) {
  if (!isCurrentPeer(p, session)) return;
  // Perdeu o servidor de sinalização (não a chamada): tenta religar mantendo o ID
  setTimeout(() => {
    if (isCurrentPeer(p, session) && p.disconnected && !p.destroyed) {
      try { p.reconnect(); } catch (e) {}
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// CHAMADAS DE ÁUDIO / TELA RECEBIDAS
// ---------------------------------------------------------------------------
function handleIncomingCall(call) {
  const type = call.metadata && call.metadata.type;

  // Anfitrião só atende quem já provou o PIN; convidado só atende o anfitrião
  const trusted = isHostInstance
    ? (dataConn && remoteVerified && call.peer === dataConn.peer)
    : (call.peer === getHostPeerId());
  if (!trusted) { safeClose(call); return; }

  if (type === 'screen') {
    const prev = incomingScreenCall;
    incomingScreenCall = call;
    if (prev) safeClose(prev);

    call.answer();
    call.on('stream', stream => {
      mainStream.srcObject = stream;
      remoteScreenAudio.srcObject = stream; // áudio só do app compartilhado
      mainStream.classList.remove('hidden');
      camsContainer.classList.add('hidden');
      containerScreenVolume.classList.remove('hidden');
    });
    call.on('close', () => {
      if (incomingScreenCall === call) {
        incomingScreenCall = null;
        resetRemoteScreenView();
      }
    });
  } else if (type === 'cam') {
    const prev = incomingCamCall;
    incomingCamCall = call;
    if (prev) safeClose(prev);

    call.answer();
    call.on('stream', stream => {
      remoteCam.srcObject = stream;
      remoteCam.classList.remove('hidden');
      avatarRemoteBox.classList.add('hidden');
    });
    call.on('close', () => {
      if (incomingCamCall === call) {
        incomingCamCall = null;
        hideRemoteCam();
      }
    });
  } else {
    if (mainCall) safeClose(mainCall);
    mainCall = call;
    call.answer(getMainCallStream());
    attachMainCallEvents(call);
  }
}

function attachMainCallEvents(call) {
  call.on('stream', stream => {
    remoteVoiceAudio.srcObject = stream;
  });
  call.on('close', () => {
    if (mainCall === call) {
      mainCall = null;
      remoteVoiceAudio.srcObject = null;
    }
  });
  call.on('error', e => console.warn('Erro na chamada de voz:', e));
}

// Quem ASSISTE: volta para as câmeras quando a transmissão acaba
function resetRemoteScreenView() {
  remoteScreenAudio.srcObject = null;
  if (!screenStream) {
    mainStream.srcObject = null;
    mainStream.classList.add('hidden');
    camsContainer.classList.remove('hidden');
    containerScreenVolume.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// CONEXÃO DE DADOS (PIN, perfil, chat, batimento)
// ---------------------------------------------------------------------------
function setupDataConnection(conn, session) {
  dataConn = conn;
  targetPeerId = conn.peer;
  remoteVerified = false;
  lastSeen = Date.now();

  const onOpen = () => {
    if (dataConn !== conn) return;
    lastSeen = Date.now();
    if (!isHostInstance) sendDataMessage({ type: 'HANDSHAKE_PIN', pin: currentRoomPin });
  };

  if (conn.open) onOpen(); else conn.on('open', onOpen);

  conn.on('data', data => {
    if (dataConn !== conn) return;
    lastSeen = Date.now();
    handleDataMessage(data, session);
  });

  conn.on('close', () => { if (dataConn === conn) handleRemoteLeft(session); });
  conn.on('error', err => {
    console.warn('Erro na conexão de dados:', err);
    if (dataConn === conn) handleRemoteLeft(session);
  });
}

function sanitizeProfile(p) {
  p = p || {};
  const name = typeof p.name === 'string' ? p.name.slice(0, 40).trim() : '';
  const avatar = (typeof p.avatar === 'string' && p.avatar.startsWith('data:image/')) ? p.avatar : defaultAvatar;
  const status = typeof p.status === 'string' ? p.status.slice(0, 40) : 'Conectado';
  return { name: name || 'Convidado', avatar, status };
}

function handleDataMessage(data, session) {
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'PING':
      break;

    case 'BYE':
      handleRemoteLeft(session);
      break;

    case 'HANDSHAKE_PIN': // chega no anfitrião
      if (!isHostInstance) break;
      if (String(data.pin).trim() !== currentRoomPin) {
        sendDataMessage({ type: 'PIN_REJECTED' });
        const c = dataConn;
        setTimeout(() => safeClose(c), 300);
      } else {
        remoteVerified = true;
        remoteProfile = { name: 'Convidado', avatar: defaultAvatar, status: 'Conectado' };
        sendDataMessage({ type: 'PIN_OK' });
        sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
        onRemoteJoined();
        if (screenStream) sendScreenCall(); // quem entrou depois já recebe a transmissão
        if (camStream) sendCamCall();
      }
      break;

    case 'PIN_OK': // chega no convidado: só agora ele entra de verdade na sala
      if (isHostInstance || !peer) break;
      remoteVerified = true;
      remoteProfile = { name: 'Convidado', avatar: defaultAvatar, status: 'Conectado' };
      clearTimeout(guestConnectTimer);
      (async () => {
        await enterRoomUI(session);
        if (session !== roomSession || !peer || !dataConn || !remoteVerified) return;
        sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
        onRemoteJoined();
        mainCall = peer.call(getHostPeerId(), getMainCallStream(), { metadata: { type: 'main' } });
        attachMainCallEvents(mainCall);
        if (screenStream) sendScreenCall();
        if (camStream) sendCamCall();
      })();
      break;

    case 'PIN_REJECTED': // senha errada: volta para o formulário e mostra o erro lá
      if (roomEntered) break;
      if (joinOrigin === 'list') failJoin('A senha dessa sala mudou ou está incorreta. Digite a senha atual.');
      else if (joinOrigin === 'create') failJoin('Já existe uma sala ativa com esse nome e outra senha. Escolha outro nome.');
      else failJoin('❌ Senha incorreta. Confira com quem criou a sala.');
      break;

    case 'ROOM_FULL':
      showToast('A sala está ocupada. Tentando de novo...');
      scheduleReconnect(session, 4000);
      break;

    case 'PROFILE_UPDATE':
      if (!remoteVerified) break;
      remoteProfile = sanitizeProfile(data.profile);
      updateProfileUI();
      break;

    case 'CHAT_MSG':
      if (!remoteVerified) break;
      appendChatMessage(String(data.author || 'Convidado').slice(0, 40), String(data.text || '').slice(0, 2000), true);
      break;
  }
}

function sendDataMessage(data) {
  if (dataConn && dataConn.open) {
    try { dataConn.send(data); } catch (e) {}
  }
}

function onRemoteJoined() {
  setStatus('🟢 Conectados', true);
  startCallTimer();
  updateProfileUI();
}

function handleRemoteLeft(session) {
  if (session !== roomSession || !inRoom) return;
  if (!dataConn && !mainCall) return;

  const wasVerified = remoteVerified;
  closeRemoteConnections();
  resetRemoteState();
  stopCallTimer();
  if (wasVerified) showToast('A outra pessoa saiu da sala.');

  if (isHostInstance) {
    setStatus('Aguardando...');   // a sala continua aberta para quem voltar
  } else {
    scheduleReconnect(session, 1500); // o anfitrião saiu: eu assumo a sala
  }
}

function resetRemoteState() {
  remoteProfile = makeEmptyRemoteProfile();
  remoteVoiceAudio.srcObject = null;
  resetRemoteScreenView();
  hideRemoteCam();
  updateProfileUI();
}

// Batimento: detecta quem caiu sem avisar (queda de internet, app fechado)
function heartbeatTick() {
  if (!inRoom) return;
  if (dataConn && dataConn.open) {
    sendDataMessage({ type: 'PING' });
    if (Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS) handleRemoteLeft(roomSession);
  }
}

// ---------------------------------------------------------------------------
// CRONÔMETRO DA CALL
// ---------------------------------------------------------------------------
function renderCallTimer() {
  const s = Math.floor((Date.now() - callStartedAt) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  callTimerEl.innerText = `⏱️ ${hh}:${mm}:${ss}`;
}

function startCallTimer() {
  if (callTimerInterval) return;
  callStartedAt = Date.now();
  renderCallTimer();
  callTimerInterval = setInterval(renderCallTimer, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  callTimerEl.innerText = '⏱️ 00:00:00';
}

// ---------------------------------------------------------------------------
// PERFIL, VOLUME E MICROFONE
// ---------------------------------------------------------------------------
function updateProfileUI() {
  const avatarLocal = document.getElementById('avatar-img-local');
  const nameLocal = document.getElementById('avatar-name-local');
  const tagLocal = document.getElementById('name-tag-local');
  const statusLocal = document.getElementById('avatar-status-local');

  const avatarRemote = document.getElementById('avatar-img-remote');
  const nameRemote = document.getElementById('avatar-name-remote');
  const tagRemote = document.getElementById('name-tag-remote');
  const statusRemote = document.getElementById('avatar-status-remote');

  if (avatarLocal) avatarLocal.src = myProfile.avatar || defaultAvatar;
  if (nameLocal) nameLocal.innerText = myProfile.name || 'Você';
  if (tagLocal) tagLocal.innerText = `${myProfile.name || 'Você'} (Você)`;
  if (statusLocal) statusLocal.innerText = myProfile.status || 'Disponível';

  if (avatarRemote) avatarRemote.src = remoteProfile.avatar || defaultAvatar;
  if (nameRemote) nameRemote.innerText = remoteProfile.name || 'Convidado';
  if (tagRemote) tagRemote.innerText = remoteProfile.name || 'Convidado';
  if (statusRemote) statusRemote.innerText = remoteProfile.status || '';
}

remoteMicVolumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  remoteVoiceAudio.volume = val;
  micVolValueLabel.innerText = `${Math.round(val * 100)}%`;
});

remoteScreenVolumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  remoteScreenAudio.volume = val;
  screenVolValueLabel.innerText = `${Math.round(val * 100)}%`;
});

function getMainCallStream() {
  const tracks = [];
  if (micStream && micStream.getAudioTracks()[0]) tracks.push(micStream.getAudioTracks()[0]);
  return new MediaStream(tracks);
}

async function openMicStream() {
  const micId = getPref('app_mic_id');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : true,
      video: false
    });
  } catch (err) {
    if (!micId) throw err;
    setPref('app_mic_id', ''); // o microfone salvo sumiu: usa o padrão
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

async function startMicrophone() {
  if (micStream) return;
  try {
    micStream = await openMicStream();
    micStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  } catch (e) { console.warn('Sem mic:', e); }
}

// Troca de microfone no meio da call, sem derrubar a chamada
async function switchMicrophone() {
  if (!micStream) return;
  try {
    const newStream = await openMicStream();
    const newTrack = newStream.getAudioTracks()[0];
    newTrack.enabled = !isMicMuted;

    if (mainCall && mainCall.peerConnection) {
      const sender = mainCall.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
    }
    micStream.getTracks().forEach(t => t.stop());
    micStream = newStream;
  } catch (e) {
    console.warn('Erro ao trocar de microfone:', e);
    showToast('Não foi possível trocar o microfone.');
  }
}

function applyMicButtonState() {
  btnToggleMic.innerText = isMicMuted ? '🔇' : '🎤';
  btnToggleMic.classList.toggle('btn-danger', isMicMuted);
  muteIndicatorLocal.classList.toggle('hidden', !isMicMuted);
}

btnToggleMic.addEventListener('click', () => {
  isMicMuted = !isMicMuted;
  if (micStream) {
    micStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  }
  applyMicButtonState();
});

// ===========================================================================
// ÁUDIO SOMENTE DO APLICATIVO COMPARTILHADO (Electron + Windows)
//
// main.js captura o áudio do processo da janela escolhida (WASAPI process
// loopback) e manda PCM cru pra cá. Aqui o PCM vira uma track de áudio que
// entra no stream da transmissão no lugar do áudio do sistema inteiro.
// ===========================================================================
const PCM_WORKLET_CODE = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ch = options.processorOptions.channels;
    this.cap = Math.floor(sampleRate * 2);              // buffer circular de 2s
    this.buf = new Float32Array(this.cap * this.ch);
    this.r = 0; this.w = 0; this.count = 0;
    this.playing = false;
    this.prebuffer = Math.floor(sampleRate * 0.06);     // 60ms antes de tocar
    this.maxLatency = Math.floor(sampleRate * 0.4);     // acima disso, corta o atraso
    this.keep = Math.floor(sampleRate * 0.12);
    this.port.onmessage = (e) => this.push(e.data);
  }
  push(data) {
    const ch = this.ch;
    const frames = Math.floor(data.length / ch);
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) this.buf[this.w * ch + c] = data[i * ch + c];
      this.w = (this.w + 1) % this.cap;
      if (this.count < this.cap) this.count++;
      else this.r = (this.r + 1) % this.cap;
    }
    if (this.count > this.maxLatency) {
      const drop = this.count - this.keep;
      this.r = (this.r + drop) % this.cap;
      this.count = this.keep;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const ch = this.ch;
    if (!this.playing && this.count >= this.prebuffer) this.playing = true;
    for (let i = 0; i < n; i++) {
      if (this.playing && this.count > 0) {
        for (let c = 0; c < out.length; c++) {
          out[c][i] = this.buf[this.r * ch + Math.min(c, ch - 1)];
        }
        this.r = (this.r + 1) % this.cap;
        this.count--;
      } else {
        for (let c = 0; c < out.length; c++) out[c][i] = 0;
        if (this.playing) this.playing = false;
      }
    }
    return true;
  }
}
registerProcessor('pcm-player', PcmPlayer);
`;

let appAudioCtx = null;
let appAudioNode = null;
let appAudioFormat = null;
let appAudioPending = null;       // sobra de bytes que não fecharam um frame
let removeAppAudioListener = null;

function pcmToFloat32(chunk, fmt) {
  let data = new Uint8Array(chunk);

  if (appAudioPending && appAudioPending.length) {
    const merged = new Uint8Array(appAudioPending.length + data.length);
    merged.set(appAudioPending, 0);
    merged.set(data, appAudioPending.length);
    data = merged;
  }

  const bytesPerSample = fmt.bits / 8;
  const frameBytes = bytesPerSample * fmt.channels;
  const usable = data.length - (data.length % frameBytes);
  appAudioPending = data.slice(usable);
  if (usable === 0) return null;

  const view = new DataView(data.buffer, data.byteOffset, usable);
  const total = usable / bytesPerSample;
  const out = new Float32Array(total);

  if (fmt.float) {
    for (let i = 0; i < total; i++) out[i] = view.getFloat32(i * 4, true);
  } else {
    for (let i = 0; i < total; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

// Retorna as tracks de áudio do app (ou [] se não for possível)
async function startAppAudio(sourceId) {
  if (!window.electronAPI || !window.electronAPI.startAppAudio) return [];

  if (!sourceId.startsWith('window:')) {
    showToast('Para enviar áudio, compartilhe uma JANELA (tela inteira fica sem áudio).');
    return [];
  }

  stopAppAudio();

  // Registra o listener antes de iniciar para não perder os primeiros chunks
  removeAppAudioListener = window.electronAPI.onAppAudioChunk((chunk) => {
    if (!appAudioNode || !appAudioFormat) return;
    const floats = pcmToFloat32(chunk, appAudioFormat);
    if (floats) appAudioNode.port.postMessage(floats, [floats.buffer]);
  });

  const res = await window.electronAPI.startAppAudio(sourceId);
  if (!res || !res.ok) {
    console.warn('Áudio do app indisponível:', res && res.error);
    showToast('Áudio: ' + (res && res.error ? res.error : 'erro desconhecido') + ' — transmitindo sem áudio.');
    stopAppAudio();
    return [];
  }

  try {
    appAudioFormat = res.format;
    appAudioPending = null;

    appAudioCtx = new AudioContext({ sampleRate: res.format.sampleRate });
    const blobUrl = URL.createObjectURL(new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' }));
    await appAudioCtx.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);

    appAudioNode = new AudioWorkletNode(appAudioCtx, 'pcm-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { channels: res.format.channels }
    });

    const dest = appAudioCtx.createMediaStreamDestination();
    appAudioNode.connect(dest);
    await appAudioCtx.resume();

    return dest.stream.getAudioTracks();
  } catch (err) {
    console.error('Erro ao montar o áudio do app:', err);
    showToast('Erro ao preparar o áudio. Transmitindo sem áudio.');
    stopAppAudio();
    return [];
  }
}

function stopAppAudio() {
  if (removeAppAudioListener) { removeAppAudioListener(); removeAppAudioListener = null; }
  if (window.electronAPI && window.electronAPI.stopAppAudio) window.electronAPI.stopAppAudio();
  if (appAudioNode) { try { appAudioNode.disconnect(); } catch (e) {} appAudioNode = null; }
  if (appAudioCtx) { appAudioCtx.close().catch(() => {}); appAudioCtx = null; }
  appAudioFormat = null;
  appAudioPending = null;
}

// ===========================================================================
// TRANSMISSÃO DE TELA
// ===========================================================================
function sendScreenCall() {
  if (!screenStream || !peer || !remoteVerified || !targetPeerId) return;
  if (screenCall) safeClose(screenCall);
  screenCall = peer.call(targetPeerId, screenStream, { metadata: { type: 'screen' } });
}

function stopScreenShare() {
  stopAppAudio();

  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  if (screenCall) {
    safeClose(screenCall);
    screenCall = null;
  }

  mainStream.srcObject = null;
  mainStream.classList.add('hidden');
  camsContainer.classList.remove('hidden');
  containerScreenVolume.classList.add('hidden');
}

function beginScreenShare(stream) {
  screenStream = stream;
  mainStream.srcObject = stream;
  mainStream.muted = true; // você não precisa ouvir o eco da própria transmissão
  mainStream.classList.remove('hidden');
  camsContainer.classList.add('hidden');

  stream.getVideoTracks()[0].onended = stopScreenShare;
  sendScreenCall(); // se ainda não há ninguém na sala, vai quando a pessoa entrar
}

async function startScreenShare() {
  if (screenStream) {
    stopScreenShare();
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
        showToast('Nenhuma janela encontrada.');
        return;
      }

      sources.forEach(source => {
        const card = document.createElement('div');
        card.className = 'source-item-card';
        card.innerHTML = `
          <img src="${source.thumbnail}">
          <span></span>
        `;
        card.querySelector('span').textContent = source.name;

        card.addEventListener('click', async () => {
          screenPickerModal.classList.remove('active');
          try {
            // Vídeo SEM áudio do sistema: o áudio vem só do app escolhido
            const videoStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: source.id,
                  maxWidth: width,
                  maxHeight: height,
                  maxFrameRate: fps
                }
              }
            });

            let audioTracks = [];
            if (includeAudio) audioTracks = await startAppAudio(source.id);

            beginScreenShare(new MediaStream([
              ...videoStream.getVideoTracks(),
              ...audioTracks
            ]));
          } catch (err) {
            console.error('Erro ao capturar fonte:', err);
            stopAppAudio();
            showToast('Não foi possível capturar esta janela.');
          }
        });
        screenSourcesList.appendChild(card);
      });

      screenPickerModal.classList.add('active');
    } catch (err) {
      console.error('Erro no Electron getSources:', err);
      showToast('Erro ao carregar janelas.');
    }
  } else {
    // Navegador comum (sem Electron): usa o seletor nativo
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: width }, height: { max: height }, frameRate: { max: fps } },
        audio: includeAudio
      });
      beginScreenShare(stream);
    } catch (e) {}
  }
}

document.getElementById('btn-screen').addEventListener('click', startScreenShare);
document.getElementById('btn-close-screen-picker').addEventListener('click', () => screenPickerModal.classList.remove('active'));
const btnCloseTop = document.getElementById('btn-close-screen-picker-top');
if (btnCloseTop) btnCloseTop.addEventListener('click', () => screenPickerModal.classList.remove('active'));

// ===========================================================================
// CHAT (com bolinha de mensagem nova)
// ===========================================================================
btnOpenChat.addEventListener('click', (e) => {
  e.stopPropagation();
  chatDrawer.classList.toggle('open');
  if (chatDrawer.classList.contains('open')) {
    chatUnreadDot.classList.add('hidden');
    chatInput.focus();
  }
});
btnCloseChat.addEventListener('click', () => chatDrawer.classList.remove('open'));

function appendChatMessage(author, text, fromRemote = false) {
  const row = document.createElement('div');
  row.className = 'chat-msg-row';

  const authorEl = document.createElement('span');
  authorEl.className = 'chat-msg-author';
  authorEl.textContent = `${author}:`;

  const textEl = document.createElement('span');
  textEl.textContent = ` ${text}`;

  row.appendChild(authorEl);
  row.appendChild(textEl);
  chatMessagesList.appendChild(row);
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;

  // Mensagem do outro lado com o chat fechado: acende a bolinha no ícone 💬
  if (fromRemote && !chatDrawer.classList.contains('open')) {
    chatUnreadDot.classList.remove('hidden');
  }
}

btnSendChat.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!remoteVerified) {
    showToast('Ainda não há ninguém conectado na sala.');
    return;
  }
  appendChatMessage(myProfile.name || 'Você', text);
  sendDataMessage({ type: 'CHAT_MSG', author: myProfile.name || 'Você', text: text });
  chatInput.value = '';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSendChat.click();
});

// ===========================================================================
// CÂMERA
// ===========================================================================
function updateCamButton() {
  btnToggleCam.classList.toggle('btn-highlight', !!camStream);
  btnToggleCam.title = camStream ? 'Desligar câmera' : 'Ligar câmera';
}

function hideRemoteCam() {
  remoteCam.srcObject = null;
  remoteCam.classList.add('hidden');
  avatarRemoteBox.classList.remove('hidden');
}

function sendCamCall() {
  if (!camStream || !peer || !remoteVerified || !targetPeerId) return;
  if (camCall) safeClose(camCall);
  camCall = peer.call(targetPeerId, camStream, { metadata: { type: 'cam' } });
}

async function startCamera() {
  if (camStream || !roomEntered) return;
  const camId = getPref('app_cam_id');
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

  try {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: camId ? { ...base, deviceId: { exact: camId } } : base
      });
    } catch (err) {
      if (!camId) throw err;
      setPref('app_cam_id', ''); // a câmera salva sumiu: usa a padrão
      camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: base });
    }
  } catch (err) {
    console.warn('Erro ao ligar a câmera:', err);
    camStream = null;
    showToast('Não foi possível ligar a câmera.');
    return;
  }

  localCam.srcObject = camStream;
  localCam.classList.remove('hidden');
  avatarLocalBox.classList.add('hidden');
  camStream.getVideoTracks()[0].onended = stopCamera;
  updateCamButton();
  sendCamCall();
  refreshDeviceLists();
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  if (camCall) {
    safeClose(camCall);
    camCall = null;
  }
  localCam.srcObject = null;
  localCam.classList.add('hidden');
  avatarLocalBox.classList.remove('hidden');
  updateCamButton();
}

btnToggleCam.addEventListener('click', () => {
  if (camStream) stopCamera();
  else startCamera();
});

// ===========================================================================
// DISPOSITIVOS: microfone, câmera e fone/caixa de som (headset)
// ===========================================================================
const SINK_SUPPORTED = 'setSinkId' in HTMLMediaElement.prototype;
let deviceLabelsRequested = false;

function getPref(key) { return localStorage.getItem(key) || ''; }
function setPref(key, value) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

// Escolhe a saída de áudio (fone) das duas fontes de som da outra pessoa
function applySpeakerToAudioElements() {
  if (!SINK_SUPPORTED) return;
  const id = getPref('app_speaker_id') || 'default';
  [remoteVoiceAudio, remoteScreenAudio].forEach(el => {
    el.setSinkId(id).catch(err => {
      console.warn('Saída de áudio indisponível:', err);
      setPref('app_speaker_id', '');
      el.setSinkId('default').catch(() => {});
    });
  });
}

function fillDeviceSelect(select, devices, unlabeledName, savedId) {
  select.innerHTML = '';
  select.appendChild(new Option('Padrão do sistema', ''));
  let n = 0;
  devices.forEach(d => {
    if (d.deviceId === 'default' || d.deviceId === 'communications') return;
    n++;
    select.appendChild(new Option(d.label || `${unlabeledName} ${n}`, d.deviceId));
  });
  select.value = Array.from(select.options).some(o => o.value === savedId) ? savedId : '';
}

async function refreshDeviceLists() {
  let devices;
  try { devices = await navigator.mediaDevices.enumerateDevices(); }
  catch (e) { return; }

  fillDeviceSelect(micSelect, devices.filter(d => d.kind === 'audioinput'), 'Microfone', getPref('app_mic_id'));
  fillDeviceSelect(camSelect, devices.filter(d => d.kind === 'videoinput'), 'Câmera', getPref('app_cam_id'));
  if (SINK_SUPPORTED) {
    fillDeviceSelect(speakerSelect, devices.filter(d => d.kind === 'audiooutput'), 'Saída', getPref('app_speaker_id'));
  } else {
    speakerSelect.closest('.form-group').classList.add('hidden');
  }
}

// Os nomes dos aparelhos só aparecem depois de uma permissão de uso
async function ensureDeviceLabels() {
  if (deviceLabelsRequested) return;
  deviceLabelsRequested = true;
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch (e) { return; }

  const needAudio = devices.some(d => d.kind === 'audioinput' && !d.label);
  const needVideo = devices.some(d => d.kind === 'videoinput' && !d.label);
  const kinds = [];
  if (needAudio) kinds.push('audio');
  if (needVideo) kinds.push('video');

  for (const kind of kinds) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ [kind]: true });
      s.getTracks().forEach(tr => tr.stop());
    } catch (e) {}
  }
}

async function openSettings() {
  settingsModal.classList.add('active');
  await ensureDeviceLabels();
  await refreshDeviceLists();
}

micSelect.addEventListener('change', () => {
  setPref('app_mic_id', micSelect.value);
  switchMicrophone();
});

camSelect.addEventListener('change', async () => {
  setPref('app_cam_id', camSelect.value);
  if (camStream) {
    stopCamera();
    await startCamera();
  }
});

speakerSelect.addEventListener('change', () => {
  setPref('app_speaker_id', speakerSelect.value);
  applySpeakerToAudioElements();
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (settingsModal.classList.contains('active')) refreshDeviceLists();
  });
}

// ===========================================================================
// PERFIL: trocar a própria senha
// ===========================================================================
function showPwMessage(msg, ok = false) {
  pwMessage.innerText = msg;
  pwMessage.classList.remove('hidden');
  pwMessage.classList.toggle('success', ok);
}

function resetPasswordForm() {
  [pwCurrent, pwNew, pwConfirm].forEach(i => { i.value = ''; });
  pwMessage.classList.add('hidden');
  pwMessage.classList.remove('success');
  pwMessage.innerText = '';
}

function openProfileModal() {
  document.getElementById('profile-name-input').value = myProfile.name || '';
  resetPasswordForm();
  document.getElementById('profile-modal').classList.add('active');
}

function closeProfileModal() {
  resetPasswordForm();
  document.getElementById('profile-modal').classList.remove('active');
}

function changePassword() {
  if (!currentUser) return;
  const user = currentUser.username;
  const current = pwCurrent.value.trim();
  const next = pwNew.value.trim();
  const confirmValue = pwConfirm.value.trim();

  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  // A admin ainda sem senha própria usa a padrão ("777") como senha atual
  const knownPass = usersDb[user] !== undefined ? usersDb[user] : (isAdminUser() ? '777' : null);

  if (knownPass === null || current !== knownPass) return showPwMessage('Senha atual incorreta.');
  if (next.length < 4) return showPwMessage('A nova senha precisa ter pelo menos 4 caracteres.');
  if (next !== confirmValue) return showPwMessage('A confirmação não é igual à nova senha.');
  if (next === current) return showPwMessage('A nova senha precisa ser diferente da atual.');

  usersDb[user] = next;
  localStorage.setItem('app_users_db', JSON.stringify(usersDb));
  resetPasswordForm();
  showPwMessage('✅ Senha alterada com sucesso!', true);
}

btnChangePassword.addEventListener('click', changePassword);
[pwCurrent, pwNew, pwConfirm].forEach(i => {
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') changePassword(); });
});

// ---------------------------------------------------------------------------
// MODAIS, GAVETAS E SAÍDA
// ---------------------------------------------------------------------------
document.getElementById('btn-open-settings').addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('active'));
document.getElementById('btn-open-profile').addEventListener('click', (e) => { e.stopPropagation(); openProfileModal(); });
document.getElementById('btn-close-profile').addEventListener('click', closeProfileModal);
document.getElementById('btn-open-roulette').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('roulette-modal').classList.add('active'); });
document.getElementById('btn-close-roulette').addEventListener('click', () => document.getElementById('roulette-modal').classList.remove('active'));
document.getElementById('btn-open-bucket').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('bucket-modal').classList.add('active'); });
document.getElementById('btn-close-bucket-top').addEventListener('click', () => document.getElementById('bucket-modal').classList.remove('active'));

// Desligar agora SAI da sala e volta ao lobby (sem recarregar o app)
document.getElementById('btn-hangup').addEventListener('click', () => leaveRoom());

// Fechar a janela: avisa o outro lado e libera o ID da sala o quanto antes
window.addEventListener('beforeunload', () => {
  if (inRoom) sendDataMessage({ type: 'BYE' });
  stopAppAudio();
  try { if (peer) peer.destroy(); } catch (e) {}
});

applySpeakerToAudioElements();
updateAuthUI();