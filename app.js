// --- CARGOS ---
const ADMIN_USER = "steiner777";
const OLD_EXCLUSIVE_ROOM = "nosso-cantinho"; // sala antiga com PIN fixo no código (removida)

// Prefixo dos IDs no servidor do PeerJS (evita colisão com outros apps)
const PEER_PREFIX = "space777-";
const HEARTBEAT_MS = 2000;            // ping a cada 2s
const HEARTBEAT_TIMEOUT_MS = 8000;    // sem sinal por 8s = a pessoa caiu
const PEER_PROBE_TIMEOUT_MS = 5000;   // tempo para uma vaga de ID responder
const JOIN_VERIFY_TIMEOUT_MS = 20000; // tempo máximo para confirmar a senha antes de desistir

// Pessoas por sala (a sala exclusiva é sempre de 2). Como cada pessoa se liga a todas
// as outras (não há servidor no meio), salas grandes pesam na internet de quem transmite.
const MAX_ROOM_SIZE = 8;
const SLOT_COUNT = 12;   // quantas "vagas" de ID são testadas (sobra para vagas de quem caiu)

// Servidores para as pessoas se acharem. Se algum amigo não conseguir conectar (rede muito
// fechada), adicione um servidor TURN aqui, por exemplo:
// { urls: 'turn:SEU_SERVIDOR:3478', username: 'USUARIO', credential: 'SENHA' }
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// Limite de upload (kbps) dividido entre os espectadores da sua tela
const SCREEN_UPLOAD_BUDGET_KBPS = { '1080p60': 12000, '720p60': 8000, '1080p30': 8000 };

let currentUser = JSON.parse(localStorage.getItem('app_logged_user')) || null;
let currentRoomName = '';
let currentRoomPin = '';
let currentRoomExclusive = false; // sala exclusiva: só entra quem sabe nome + senha
let inRoom = false;
let roomSession = 0;          // muda a cada entrada/saída: invalida tentativas antigas
let roomEntered = false;      // já passou da tela de senha e está dentro da sala
let joinOrigin = 'join';      // de onde veio o pedido: 'join' | 'create' | 'list'
let joinTrusted = false;      // senha já conhecida/confirmada (sala sua ou já visitada)
let joinBusy = false;         // verificando a senha
let joinSawFull = false;      // alguém respondeu "sala cheia"
let joinTimeoutTimer = null;
let myPeerId = '';
let mySlot = -1;
let peer = null;
let peers = new Map();        // ID da outra pessoa -> { conn, perfil, chamadas, cartão... }
let probesPending = 0;        // vagas ainda sendo testadas
let isMicMuted = true;

let reconnectTimer = null;
let heartbeatTimer = null;
let callTimerInterval = null;
let callStartedAt = 0;

let micStream = null;
let camStream = null;
let screenStream = null;
let screenQuality = '720p60';
let activeScreenId = null;    // de quem é a transmissão exibida
let masterVoiceVolume = 1;

const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%235865f2'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M22 80c0-15 12-25 28-25s28 10 28 25z' fill='%23ffffff'/></svg>";

let myProfile = {
  name: localStorage.getItem('profile_name') || '',
  avatar: defaultAvatar,
  status: '🟢 Disponível'
};

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
const createExclusive = document.getElementById('create-exclusive');
const rouletteModal = document.getElementById('roulette-modal');
const rouletteInput = document.getElementById('roulette-options-input');
const rouletteResult = document.getElementById('roulette-result-display');

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
const avatarLocalBox = document.getElementById('avatar-local');
const waitingCard = document.getElementById('box-waiting');
const screenSwitcher = document.getElementById('screen-switcher');
const updateBanner = document.getElementById('update-banner');
const updateText = document.getElementById('update-text');
const btnInstallUpdate = document.getElementById('btn-install-update');
const appVersionEl = document.getElementById('app-version');

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
// SALAS (banco local) E CONTAS (admin)
// ---------------------------------------------------------------------------


// Admin: só mexe em contas (redefinir senha / excluir). Não dá acesso a nenhuma sala.
const DEFAULT_RESET_PASSWORD = '123456';

function resetUserPassword(username) {
  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  if (!usersDb[username]) return;
  if (!confirm(`Redefinir a senha de "${username}" para ${DEFAULT_RESET_PASSWORD}?`)) return;
  usersDb[username] = DEFAULT_RESET_PASSWORD;
  localStorage.setItem('app_users_db', JSON.stringify(usersDb));
  showToast(`Senha de ${username} redefinida para ${DEFAULT_RESET_PASSWORD}.`);
}

function deleteUser(username) {
  if (!confirm(`Excluir a conta "${username}" deste computador?`)) return;
  const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
  delete usersDb[username];
  localStorage.setItem('app_users_db', JSON.stringify(usersDb));
  localStorage.removeItem(`app_recent_rooms:${username}`);
  renderAdminPanel();
}





function getRoomsDatabase() {
  return JSON.parse(localStorage.getItem('app_rooms_db') || '{}');
}

function saveRoomToDb(name, pin, owner, exclusive) {
  const db = getRoomsDatabase();
  const existing = db[name];
  db[name] = {
    pin: String(pin).trim(),
    owner: owner,
    exclusive: exclusive === undefined ? !!(existing && existing.exclusive) : !!exclusive,
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

function rememberRoom(name, pin, exclusive = false) {
  if (!currentUser) return;
  const list = getRecentRooms().filter(r => r.name !== name);
  list.unshift({ name, pin: String(pin), last: Date.now(), exclusive: !!exclusive });
  localStorage.setItem(recentsKey(), JSON.stringify(list.slice(0, 20)));
}

// A sala é exclusiva? (vale o que está salvo neste computador)
function lookupRoomExclusive(name) {
  const info = getRoomsDatabase()[name];
  if (info) return !!info.exclusive;
  const recent = getRecentRooms().find(r => r.name === name);
  return !!recent && !!recent.exclusive;
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
      owned: !!info && info.owner === currentUser.username,
      exclusive: info ? !!info.exclusive : !!r.exclusive
    });
  });

  Object.keys(db).forEach(n => {
    if (!seen.has(n) && db[n].owner === currentUser.username) {
      seen.add(n);
      rooms.push({ name: n, pin: db[n].pin, last: 0, owned: true, exclusive: !!db[n].exclusive });
    }
  });

  rooms.sort((a, b) => (b.exclusive ? 1 : 0) - (a.exclusive ? 1 : 0) || b.last - a.last);
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
    const kind = r.exclusive ? 'Sala exclusiva' : (r.owned ? 'Criada por você' : 'Visitada');
    const when = formatLastUsed(r.last);
    const sub = when ? `${kind} · ${when}` : kind;
    const name = escapeHtml(r.name);
    return `
      <div class="room-card-row${r.exclusive ? ' exclusive' : ''}">
        <div class="room-card-info">
          <strong>${r.exclusive ? '💖 ' : ''}${name}</strong>
          <span>${escapeHtml(sub)}</span>
        </div>
        <button class="btn-enter-room" data-action="enter-listed" data-name="${name}">Entrar</button>
        <button class="btn-remove-room" data-action="remove-listed" data-name="${name}" aria-label="Remover ${name} da lista" title="Remover da lista">✕</button>
      </div>
    `;
  }).join('');
}

function enterListedRoom(name) {
  const item = getMyRooms().find(r => r.name === name);
  if (!item) return showToast('Sala não encontrada.');
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
  if (!isAdminUser()) { adminList.innerHTML = ''; return; }

  const term = adminSearch.value.trim().toLowerCase();
  let html = '';

  if (adminTab === 'users') {
    const usersDb = JSON.parse(localStorage.getItem('app_users_db') || '{}');
    const names = Object.keys(usersDb).filter(u =>
      u.toLowerCase() !== ADMIN_USER.toLowerCase() && u.toLowerCase().includes(term));

    html = '<p class="lobby-empty">Contas criadas neste aparelho.</p>';
    if (names.length === 0) {
      html += '<p class="lobby-empty">Nenhum usuário encontrado.</p>';
    } else {
      names.forEach(u => {
        const name = escapeHtml(u);
        html += `
          <div class="admin-row">
            <span class="mini-avatar">${escapeHtml((u.trim()[0] || '?').toUpperCase())}</span>
            <strong>${name}</strong>
            <span class="sp"></span>
            <button class="btn-ghost-sm" data-action="reset-password" data-name="${name}">Redefinir senha</button>
            <button class="btn-danger-sm" data-action="delete-user" data-name="${name}">Excluir</button>
          </div>
        `;
      });
    }
  } else {
    const db = getRoomsDatabase();
    // Salas exclusivas são privadas: nem a admin as vê ou mexe nelas por aqui
    const names = Object.keys(db).filter(n => !db[n].exclusive && n.includes(term));

    html = '<p class="lobby-empty">Salas exclusivas não aparecem aqui.</p>';
    if (names.length === 0) {
      html += '<p class="lobby-empty">Nenhuma sala encontrada.</p>';
    } else {
      names.forEach(n => {
        const name = escapeHtml(n);
        html += `
          <div class="admin-row">
            <div class="room-card-info">
              <strong>${name}</strong>
              <span>dono: ${escapeHtml(db[n].owner)}</span>
            </div>
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
  if (btn.dataset.action === 'reset-password') resetUserPassword(name);
  else if (btn.dataset.action === 'delete-user') deleteUser(name);
  else if (btn.dataset.action === 'delete-room') {
    const info = getRoomsDatabase()[name];
    if (info && info.exclusive) return; // exclusiva: nem a admin mexe
    if (confirm(`Excluir a sala "${name}"?`)) deleteRoomFromDb(name);
  }
});

btnOpenAdmin.addEventListener('click', openAdminPanel);
btnCloseAdmin.addEventListener('click', closeAdminPanel);
adminScrim.addEventListener('click', closeAdminPanel);
tabAdminUsers.addEventListener('click', () => setAdminTab('users'));
tabAdminRooms.addEventListener('click', () => setAdminTab('rooms'));
adminSearch.addEventListener('input', renderAdminPanel);
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
  broadcast({ type: 'PROFILE_UPDATE', profile: myProfile });
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
    ? 'Use o nome e a senha que seu amigo passou. As salas que você já usou ficam salvas em "Minhas salas".'
    : 'Escolha um nome e um PIN. Depois é só voltar por "Minhas salas", sem criar de novo.';
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
  if (existing && existing.owner !== currentUser.username) {
    return showFormError('create', 'Já existe uma sala com esse nome. Escolha outro nome ou use "Entrar".', createRoomName);
  }

  // Se a sala já é sua, "criar" só atualiza o PIN e entra: não precisa recriar sempre
  saveRoomToDb(room, pin, existing ? existing.owner : currentUser.username, createExclusive.checked);
  joinRoom(room, pin, 'create', createExclusive.checked);
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
// SALAS COM VÁRIAS PESSOAS
//
// Não existe anfitrião. Cada pessoa ocupa uma "vaga" (um ID fixo por sala:
// ...-s0, ...-s1, ...). Quem entra pega a primeira vaga livre e liga para todas
// as outras vagas; quem responde é quem já está na sala. Cada par de pessoas
// tem a sua própria conexão (dados, voz, câmera e tela), então ninguém precisa
// "assumir" a sala: qualquer um pode sair e voltar a qualquer momento.
// ===========================================================================
function slotPeerId(k) {
  return `${PEER_PREFIX}${currentRoomName}-s${k}`;
}

function roomCapacity() {
  return currentRoomExclusive ? 2 : MAX_ROOM_SIZE;
}

function createPeer(id) {
  return new Peer(id, { config: { iceServers: ICE_SERVERS } });
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

function verifiedPeers() {
  return Array.from(peers.values()).filter(e => e.verified);
}

function makePeerEntry(id, conn, initiatedByMe) {
  return {
    id,
    conn,
    initiatedByMe,
    verified: false,
    probing: false,
    probeTimer: null,
    lastSeen: Date.now(),
    profile: { name: 'Convidado', avatar: defaultAvatar, status: 'Conectado' },
    voiceCall: null,
    screenOut: null,   // minha tela enviada para essa pessoa
    camOut: null,      // minha câmera enviada para essa pessoa
    screenIn: null,    // tela que essa pessoa transmite
    screenStream: null,
    screenStartedAt: 0,
    camIn: null,       // câmera dessa pessoa
    camStream: null,
    audioEl: null,
    card: null
  };
}

function sendTo(entry, data) {
  if (entry && entry.conn && entry.conn.open) {
    try { entry.conn.send(data); } catch (e) {}
  }
}

function broadcast(data) {
  verifiedPeers().forEach(e => sendTo(e, data));
}

function sanitizeProfile(p) {
  p = p || {};
  const name = typeof p.name === 'string' ? p.name.slice(0, 40).trim() : '';
  const avatar = (typeof p.avatar === 'string' && p.avatar.startsWith('data:image/')) ? p.avatar : defaultAvatar;
  const status = typeof p.status === 'string' ? p.status.slice(0, 40) : 'Conectado';
  return { name: name || 'Convidado', avatar, status };
}

// ---------------------------------------------------------------------------
// ENTRAR NA REDE DA SALA: pegar uma vaga e procurar quem já está lá
// ---------------------------------------------------------------------------
function connectToRoom(session) {
  if (session !== roomSession || !inRoom) return;
  clearTimeout(reconnectTimer);
  destroyPeer();
  clearAllPeers();
  setStatus('Conectando...');
  claimSlot(session, 0);
}

function claimSlot(session, k) {
  if (session !== roomSession || !inRoom) return;

  if (k >= SLOT_COUNT) {
    if (!roomEntered) failJoin('A sala está cheia no momento. Tente de novo em instantes.');
    else scheduleReconnect(session, 4000);
    return;
  }

  const id = slotPeerId(k);
  const p = createPeer(id);
  peer = p;
  let opened = false;

  p.on('open', () => {
    if (!isCurrentPeer(p, session)) return;
    opened = true;
    mySlot = k;
    myPeerId = id;
    p.on('connection', conn => handleIncomingConnection(conn, session));
    p.on('call', call => handleIncomingCall(call));
    probeRoom(session, p);
  });

  p.on('error', err => {
    if (!isCurrentPeer(p, session)) return;
    if (!opened && err.type === 'unavailable-id') {
      destroyPeer();
      claimSlot(session, k + 1); // vaga ocupada: tenta a próxima
      return;
    }
    handlePeerError(err, session);
  });

  p.on('disconnected', () => handlePeerDisconnected(p, session));
  p.on('close', () => {
    if (isCurrentPeer(p, session)) scheduleReconnect(session, 1500);
  });
}

// Liga para todas as outras vagas; só as que estão ocupadas respondem
function probeRoom(session, p) {
  probesPending = 0;
  for (let j = 0; j < SLOT_COUNT; j++) {
    if (j === mySlot) continue;
    const id = slotPeerId(j);
    const conn = p.connect(id, { reliable: true });
    const entry = makePeerEntry(id, conn, true);
    entry.probing = true;
    probesPending++;
    peers.set(id, entry);
    attachConn(entry, conn, session);
    entry.probeTimer = setTimeout(() => finishProbe(session, id), PEER_PROBE_TIMEOUT_MS);
  }
}

// Uma vaga respondeu "ninguém aqui" (ou não respondeu a tempo)
function finishProbe(session, id) {
  if (session !== roomSession || !inRoom) return;
  const entry = peers.get(id);
  if (!entry || !entry.probing) return;
  if (entry.conn && entry.conn.open) return; // respondeu: o resto é com a confirmação da senha
  removePeerEntry(id, { silent: true }); // também chama maybeResolveJoin
}

// Quando todas as vagas foram testadas e ninguém confirmou a senha: a sala está vazia
function maybeResolveJoin(session) {
  if (session !== roomSession || !inRoom || roomEntered) return;
  if (probesPending > 0) return;
  const waiting = Array.from(peers.values()).some(e => e.initiatedByMe && !e.verified);
  if (waiting) return;
  if (joinTrusted) enterRoomUI(session);
  else failJoin('Ninguém está nessa sala agora, então não dá para conferir a senha. Peça para o dono entrar primeiro ou crie a sala em "Criar sala".');
}

function scheduleReconnect(session, delay = 3000) {
  if (session !== roomSession || !inRoom) return;
  clearTimeout(reconnectTimer);
  destroyPeer();
  clearAllPeers();
  setStatus('Reconectando...');
  reconnectTimer = setTimeout(() => connectToRoom(session), delay);
}

function handlePeerError(err, session) {
  if (err.type === 'peer-unavailable') {
    // "Could not connect to peer <id>": a vaga está vazia
    const m = /peer\s+(\S+)/.exec(err.message || '');
    if (m) {
      const e = peers.get(m[1]);
      if (e && e.probing) removePeerEntry(m[1], { silent: true });
    }
    return;
  }
  console.warn('Erro do PeerJS:', err.type, err);
  const signalingErrors = ['network', 'server-error', 'socket-error', 'socket-closed'];
  if (!signalingErrors.includes(err.type)) return;
  // Se já há gente conectada, as chamadas seguem funcionando sem o servidor
  if (verifiedPeers().length > 0) return;
  scheduleReconnect(session, 3000);
}

function handlePeerDisconnected(p, session) {
  if (!isCurrentPeer(p, session)) return;
  // Perdeu o servidor de sinalização (não as chamadas): tenta religar mantendo o ID
  setTimeout(() => {
    if (isCurrentPeer(p, session) && p.disconnected && !p.destroyed) {
      try { p.reconnect(); } catch (e) {}
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// CONEXÃO DE DADOS COM CADA PESSOA (senha, perfil, chat, batimento)
// ---------------------------------------------------------------------------
function handleIncomingConnection(conn, session) {
  if (session !== roomSession || !inRoom) { safeClose(conn); return; }
  const id = conn.peer;
  const existing = peers.get(id);

  if (existing) {
    if (existing.verified) {
      // a pessoa voltou antes de eu perceber que ela tinha caído
      removePeerEntry(id, { silent: true, noResolve: true });
    } else if (existing.initiatedByMe) {
      // as duas pessoas ligaram uma para a outra ao mesmo tempo: vale a conexão iniciada pelo menor ID
      if (id < myPeerId) removePeerEntry(id, { silent: true, noResolve: true });
      else { safeClose(conn); return; }
    } else {
      removePeerEntry(id, { silent: true, noResolve: true });
    }
  }

  const entry = makePeerEntry(id, conn, false);
  peers.set(id, entry);
  attachConn(entry, conn, session);
}

function attachConn(entry, conn, session) {
  const onOpen = () => {
    if (entry.conn !== conn) return;
    entry.lastSeen = Date.now();
    if (entry.probing) {
      entry.probing = false;
      clearTimeout(entry.probeTimer);
      probesPending = Math.max(0, probesPending - 1);
    }
    if (entry.initiatedByMe) {
      sendTo(entry, { type: 'HELLO', pin: currentRoomPin, profile: myProfile });
    }
  };

  if (conn.open) onOpen(); else conn.on('open', onOpen);

  conn.on('data', data => {
    if (entry.conn !== conn) return;
    entry.lastSeen = Date.now();
    handlePeerMessage(entry, data, session);
  });

  const onGone = () => {
    if (entry.conn === conn && peers.get(entry.id) === entry) removePeerEntry(entry.id);
  };
  conn.on('close', onGone);
  conn.on('error', err => { console.warn('Erro na conexão de dados:', err); onGone(); });
}

function handlePeerMessage(entry, data, session) {
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'PING':
      break;

    case 'BYE':
      removePeerEntry(entry.id);
      break;

    case 'HELLO': // quem recebeu a ligação confere a senha
      if (!entry.initiatedByMe && !entry.verified) onHello(entry, data, session);
      break;

    case 'PIN_OK': // quem ligou recebe a confirmação
      if (entry.initiatedByMe && !entry.verified) onPinOk(entry, data, session);
      break;

    case 'PIN_REJECTED':
      if (!entry.initiatedByMe || roomEntered) { removePeerEntry(entry.id, { silent: true }); break; }
      // senha errada: volta para o formulário e mostra o erro lá
      if (joinOrigin === 'list') failJoin('A senha dessa sala mudou ou está incorreta. Digite a senha atual.');
      else if (joinOrigin === 'create') failJoin('Já existe uma sala ativa com esse nome e outra senha. Escolha outro nome.');
      else failJoin('❌ Senha incorreta. Confira com quem criou a sala.');
      break;

    case 'ROOM_FULL':
      if (!entry.initiatedByMe) break;
      if (!roomEntered) {
        joinSawFull = true;
        showToast('A sala está ocupada. Tentando de novo...');
        scheduleReconnect(session, 4000);
      } else {
        removePeerEntry(entry.id, { silent: true });
      }
      break;

    case 'NOT_READY': // a outra pessoa também está chegando agora e ainda não sabe a senha
      removePeerEntry(entry.id, { silent: true });
      break;

    case 'PROFILE_UPDATE':
      if (!entry.verified) break;
      entry.profile = sanitizeProfile(data.profile);
      updatePeerCard(entry);
      updateRoomStatus();
      refreshMainView();
      break;

    case 'CHAT_MSG':
      if (!entry.verified) break;
      appendChatMessage(String(data.author || entry.profile.name).slice(0, 40), String(data.text || '').slice(0, 2000), true);
      break;

    case 'ROULETTE': // sorteio feito por outra pessoa
      if (!entry.verified || !currentRoomExclusive) break;
      if (Array.isArray(data.options) && typeof data.pick === 'string') {
        rouletteInput.value = data.options.slice(0, 50).map(o => String(o).slice(0, 80)).join('\n');
        showRouletteResult(data.pick.slice(0, 80));
        rouletteModal.classList.add('active');
      }
      break;
  }
}

function onHello(entry, data, session) {
  const drop = () => { if (peers.get(entry.id) === entry) removePeerEntry(entry.id, { silent: true }); };
  const reject = (type) => { sendTo(entry, { type }); setTimeout(drop, 300); };

  if (String(data.pin).trim() !== currentRoomPin) return reject('PIN_REJECTED');

  if (!roomEntered) {
    if (!joinTrusted) return reject('NOT_READY');
    enterRoomUI(session); // senha já conhecida: entro e já recebo a pessoa
  }

  if (verifiedPeers().length + 1 >= roomCapacity()) return reject('ROOM_FULL');

  entry.profile = sanitizeProfile(data.profile);
  markVerified(entry, { announce: true });
  sendTo(entry, { type: 'PIN_OK', exclusive: currentRoomExclusive, profile: myProfile });
  if (screenStream) sendScreenCall(entry); // quem entrou depois já recebe a transmissão
  if (camStream) sendCamCall(entry);
}

function onPinOk(entry, data, session) {
  if (!roomEntered) currentRoomExclusive = !!data.exclusive; // quem já estava na sala diz se ela é exclusiva
  entry.profile = sanitizeProfile(data.profile);

  (async () => {
    await enterRoomUI(session); // primeira confirmação: entra de verdade
    if (session !== roomSession || peers.get(entry.id) !== entry) return;
    markVerified(entry, { announce: false });
    startVoiceCall(entry);
    if (screenStream) sendScreenCall(entry);
    if (camStream) sendCamCall(entry);
  })();
}

function markVerified(entry, { announce }) {
  entry.verified = true;
  entry.lastSeen = Date.now();
  addPeerCard(entry);
  updateRoomStatus();
  if (announce) playAlertSound('join'); // só quem já estava na sala ouve
}

// Tira uma pessoa da lista (saiu, caiu ou a vaga estava vazia)
function removePeerEntry(id, { silent = false, noResolve = false } = {}) {
  const entry = peers.get(id);
  if (!entry) return;
  peers.delete(id);

  clearTimeout(entry.probeTimer);
  if (entry.probing) {
    entry.probing = false;
    probesPending = Math.max(0, probesPending - 1);
  }

  const wasVerified = entry.verified;
  entry.verified = false;
  [entry.voiceCall, entry.screenOut, entry.camOut, entry.screenIn, entry.camIn].forEach(safeClose);
  safeClose(entry.conn);
  removePeerCard(entry);
  entry.screenStream = null;
  entry.camStream = null;

  if (wasVerified) {
    if (!silent) {
      showToast(`${entry.profile.name} saiu da sala.`);
      playAlertSound('leave');
    }
    refreshMainView();
    updateRoomStatus();
    applyScreenBitrates();
  }
  if (!noResolve) maybeResolveJoin(roomSession);
}

function clearAllPeers() {
  Array.from(peers.keys()).forEach(id => removePeerEntry(id, { silent: true, noResolve: true }));
}

// Batimento: detecta quem caiu sem avisar (queda de internet, app fechado)
function heartbeatTick() {
  if (!inRoom) return;
  const now = Date.now();
  Array.from(peers.values()).forEach(e => {
    if (!e.conn || !e.conn.open) return;
    try { e.conn.send({ type: 'PING' }); } catch (err) {}
    if (now - e.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      removePeerEntry(e.id, { silent: !e.verified });
    }
  });
}

// ---------------------------------------------------------------------------
// VOZ, CÂMERA E TELA DE CADA PESSOA
// ---------------------------------------------------------------------------
function startVoiceCall(entry) {
  if (!peer) return;
  if (entry.voiceCall) safeClose(entry.voiceCall);
  const call = peer.call(entry.id, getMainCallStream(), { metadata: { type: 'main' } });
  entry.voiceCall = call;
  attachVoiceCall(entry, call);
}

function ensureAudioEl(entry) {
  if (!entry.audioEl) {
    const a = document.createElement('audio');
    a.autoplay = true;
    a.volume = masterVoiceVolume;
    document.body.appendChild(a);
    entry.audioEl = a;
    applySpeakerToElement(a);
  }
  return entry.audioEl;
}

function attachVoiceCall(entry, call) {
  call.on('stream', stream => {
    const a = ensureAudioEl(entry);
    a.srcObject = stream;
    tryPlay(a);
  });
  call.on('close', () => {
    if (entry.voiceCall === call) {
      entry.voiceCall = null;
      if (entry.audioEl) entry.audioEl.srcObject = null;
    }
  });
  call.on('error', e => console.warn('Erro na chamada de voz:', e));
}

function handleIncomingCall(call) {
  const entry = peers.get(call.peer);
  const type = call.metadata && call.metadata.type;

  // Só atende quem já provou a senha, ou quem eu mesmo liguei e está confirmando
  const trusted = !!entry && (entry.verified || entry.initiatedByMe);
  if (!trusted) { safeClose(call); return; }

  if (type === 'screen') {
    if (entry.screenIn) safeClose(entry.screenIn);
    entry.screenIn = call;
    call.answer();
    let announced = false; // o PeerJS pode avisar mais de uma vez; o som toca uma só
    call.on('stream', stream => {
      entry.screenStream = stream;
      if (!announced) {
        announced = true;
        entry.screenStartedAt = Date.now();
        activeScreenId = entry.id; // a transmissão mais recente passa a ser a exibida
        playAlertSound('screen');
      }
      refreshMainView();
    });
    call.on('close', () => {
      if (entry.screenIn === call) {
        entry.screenIn = null;
        entry.screenStream = null;
        refreshMainView();
      }
    });
  } else if (type === 'cam') {
    if (entry.camIn) safeClose(entry.camIn);
    entry.camIn = call;
    call.answer();
    call.on('stream', stream => { entry.camStream = stream; showPeerCam(entry); });
    call.on('close', () => {
      if (entry.camIn === call) {
        entry.camIn = null;
        entry.camStream = null;
        showPeerCam(entry);
      }
    });
  } else {
    if (entry.voiceCall) safeClose(entry.voiceCall);
    entry.voiceCall = call;
    call.answer(getMainCallStream());
    attachVoiceCall(entry, call);
  }
}

function sendScreenCall(entry) {
  if (!screenStream || !peer || !entry.verified) return;
  if (entry.screenOut) safeClose(entry.screenOut);
  entry.screenOut = peer.call(entry.id, screenStream, { metadata: { type: 'screen' } });
  scheduleScreenBitrateUpdate();
}

function sendScreenToAll() {
  verifiedPeers().forEach(sendScreenCall);
}

function sendCamCall(entry) {
  if (!camStream || !peer || !entry.verified) return;
  if (entry.camOut) safeClose(entry.camOut);
  entry.camOut = peer.call(entry.id, camStream, { metadata: { type: 'cam' } });
}

function sendCamToAll() {
  verifiedPeers().forEach(sendCamCall);
}

// Divide o limite de upload entre os espectadores da sua tela
function applyScreenBitrates() {
  if (!screenStream) return;
  const outs = verifiedPeers().filter(e => e.screenOut);
  if (outs.length === 0) return;
  const budget = SCREEN_UPLOAD_BUDGET_KBPS[screenQuality] || 8000;
  const perViewer = Math.max(600, Math.min(8000, Math.floor(budget / outs.length))) * 1000;

  outs.forEach(e => {
    const pc = e.screenOut.peerConnection;
    if (!pc) return;
    pc.getSenders().filter(s => s.track && s.track.kind === 'video').forEach(sender => {
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = perViewer;
        sender.setParameters(params).catch(() => {});
      } catch (err) {}
    });
  });
}

function scheduleScreenBitrateUpdate() {
  setTimeout(applyScreenBitrates, 1500);
  setTimeout(applyScreenBitrates, 5000);
}

// ---------------------------------------------------------------------------
// TELA: um cartão por pessoa, status e qual transmissão está sendo exibida
// ---------------------------------------------------------------------------
function addPeerCard(entry) {
  if (entry.card) return;
  const root = document.createElement('div');
  root.className = 'cam-box streamer-card';
  root.innerHTML = `
    <div class="avatar-placeholder">
      <div class="avatar-circle"><img alt=""></div>
      <span class="avatar-name"></span>
      <span class="avatar-status"></span>
    </div>
    <video autoplay playsinline class="hidden"></video>
    <span class="cam-label"><span class="name-tag"></span></span>
  `;
  camsContainer.appendChild(root);
  entry.card = {
    root,
    avatarBox: root.querySelector('.avatar-placeholder'),
    img: root.querySelector('img'),
    name: root.querySelector('.avatar-name'),
    status: root.querySelector('.avatar-status'),
    tag: root.querySelector('.name-tag'),
    video: root.querySelector('video')
  };
  ensureAudioEl(entry);
  updatePeerCard(entry);
  showPeerCam(entry);
}

function updatePeerCard(entry) {
  if (!entry.card) return;
  entry.card.img.src = entry.profile.avatar || defaultAvatar;
  entry.card.name.textContent = entry.profile.name;
  entry.card.status.textContent = entry.profile.status || '';
  entry.card.tag.textContent = entry.profile.name;
}

function showPeerCam(entry) {
  if (!entry.card) return;
  const on = !!entry.camStream;
  entry.card.video.srcObject = on ? entry.camStream : null;
  entry.card.video.classList.toggle('hidden', !on);
  entry.card.avatarBox.classList.toggle('hidden', on);
}

function removePeerCard(entry) {
  if (entry.card) {
    try { entry.card.video.srcObject = null; } catch (e) {}
    entry.card.root.remove();
    entry.card = null;
  }
  if (entry.audioEl) {
    try { entry.audioEl.pause(); entry.audioEl.srcObject = null; entry.audioEl.remove(); } catch (e) {}
    entry.audioEl = null;
  }
  layoutCards();
}

// Cartões menores quando há mais gente na sala
function layoutCards() {
  const visible = camsContainer.querySelectorAll('.cam-box:not(.hidden)').length;
  let w = 520, h = 320;
  if (visible >= 7) { w = 280; h = 175; }
  else if (visible >= 5) { w = 340; h = 212; }
  else if (visible >= 3) { w = 420; h = 262; }
  camsContainer.style.setProperty('--cam-w', `${w}px`);
  camsContainer.style.setProperty('--cam-h', `${h}px`);
  camsContainer.dataset.dense = visible >= 3 ? '1' : '0';
}

function updateRoomStatus() {
  const others = verifiedPeers();
  waitingCard.classList.toggle('hidden', others.length > 0);

  if (others.length === 0) {
    setStatus('Aguardando...');
    stopCallTimer();
  } else {
    setStatus(`🟢 ${others.length + 1} na sala`, true);
    startCallTimer();
  }
  statusBadge.title = ['Você'].concat(others.map(e => e.profile.name)).join(', ');
  layoutCards();
}

// Decide o que aparece no palco: a sua própria tela, a transmissão de alguém ou as câmeras
function refreshMainView() {
  const incoming = Array.from(peers.values())
    .filter(e => e.screenStream)
    .sort((a, b) => a.screenStartedAt - b.screenStartedAt);

  if (!incoming.some(e => e.id === activeScreenId)) {
    activeScreenId = incoming.length ? incoming[incoming.length - 1].id : null;
  }

  let showing = null;
  if (screenStream) {
    mainStream.srcObject = screenStream;   // prévia da sua própria transmissão
    mainStream.muted = true;
    remoteScreenAudio.srcObject = null;
    showing = 'mine';
  } else if (activeScreenId) {
    const e = peers.get(activeScreenId);
    mainStream.srcObject = e.screenStream;
    mainStream.muted = true;               // o som sai pelo elemento de áudio abaixo (volume próprio)
    remoteScreenAudio.srcObject = e.screenStream;
    tryPlay(remoteScreenAudio);
    showing = 'remote';
  }

  if (showing) {
    mainStream.classList.remove('hidden');
    camsContainer.classList.add('hidden');
  } else {
    mainStream.srcObject = null;
    mainStream.classList.add('hidden');
    camsContainer.classList.remove('hidden');
    remoteScreenAudio.srcObject = null;
  }
  containerScreenVolume.classList.toggle('hidden', showing !== 'remote');
  renderScreenSwitcher(incoming);
}

// Com mais de uma transmissão ao mesmo tempo, aparecem botões para escolher qual assistir
function renderScreenSwitcher(incoming) {
  const show = !screenStream && incoming.length > 1;
  screenSwitcher.classList.toggle('hidden', !show);
  if (!show) { screenSwitcher.innerHTML = ''; return; }
  screenSwitcher.innerHTML = incoming.map(e =>
    `<button class="switch-btn${e.id === activeScreenId ? ' active' : ''}" data-peer="${escapeHtml(e.id)}">🖥️ ${escapeHtml(e.profile.name)}</button>`
  ).join('');
}

screenSwitcher.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-peer]');
  if (!btn) return;
  activeScreenId = btn.dataset.peer;
  refreshMainView();
});

// ---------------------------------------------------------------------------
// SAIR DA SALA
// ---------------------------------------------------------------------------
function leaveRoom({ silent = false } = {}) {
  if (inRoom && roomEntered) broadcast({ type: 'BYE' });

  inRoom = false;
  roomEntered = false;
  roomSession++;
  clearTimeout(reconnectTimer);
  clearTimeout(joinTimeoutTimer);
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  probesPending = 0;
  setJoinBusy(false);

  stopScreenShare();
  stopCamera();

  // Solta tudo; o fechamento real espera 200ms para o aviso (BYE) chegar
  const oldPeer = peer; peer = null;
  const old = Array.from(peers.values());
  peers = new Map();
  activeScreenId = null;
  old.forEach(e => {
    clearTimeout(e.probeTimer);
    removePeerCard(e);
    e.screenStream = null;
    e.camStream = null;
  });
  setTimeout(() => {
    old.forEach(e => {
      [e.voiceCall, e.screenOut, e.camOut, e.screenIn, e.camIn].forEach(safeClose);
      safeClose(e.conn);
    });
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

  audioUnlock.classList.add('hidden');
  releaseWakeLock();

  refreshMainView();
  updateRoomStatus();
  setStatus('Aguardando...');

  if (!silent) updateAuthUI();
}

// ---------------------------------------------------------------------------
// ENTRAR NA SALA: senha, erros no formulário e confirmação
// ---------------------------------------------------------------------------
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

function joinRoom(roomName, pin, origin = 'join', exclusiveFlag = false) {
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
  currentRoomExclusive = origin === 'create' ? !!exclusiveFlag : lookupRoomExclusive(name);
  roomEntered = false;
  joinSawFull = false;
  clearFormErrors();

  inRoom = true;
  roomSession++;
  const session = roomSession;

  setJoinBusy(true);
  setStatus('Conectando...');
  heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_MS);
  joinTimeoutTimer = setTimeout(() => {
    if (session === roomSession && !roomEntered) {
      failJoin(joinSawFull
        ? 'A sala está cheia no momento. Tente de novo em instantes.'
        : 'Não foi possível conectar à sala. Confira o nome e sua internet e tente de novo.');
    }
  }, JOIN_VERIFY_TIMEOUT_MS);

  connectToRoom(session);
}

async function enterRoomUI(session) {
  if (session !== roomSession || !inRoom) return;

  if (!roomEntered) {
    roomEntered = true;
    clearTimeout(joinTimeoutTimer);
    setJoinBusy(false);
    rememberRoom(currentRoomName, currentRoomPin, currentRoomExclusive);
    clearFormErrors();
    [joinRoomName, joinRoomPin, createRoomName, createRoomPin].forEach(el => { el.value = ''; });

    createExclusive.checked = false;
    // Ferramentas extras (sorteador) só aparecem na sala exclusiva
    document.querySelectorAll('.exclusive-only').forEach(el => el.classList.toggle('hidden', !currentRoomExclusive));
    document.getElementById('room-name-display').innerText = `${currentRoomExclusive ? '💖' : '🔒'} Sala: ${currentRoomName}`;
    lobbyScreen.classList.add('hidden');

    isMicMuted = true;
    applyMicButtonState();
    applySpeakerToAudioElements();
    updateRoomStatus();
    requestWakeLock();
  }

  await startMicrophone();
}

function failJoin(msg) {
  const origin = joinOrigin;
  const room = currentRoomName;
  leaveRoom({ silent: true });
  showJoinError(origin, room, msg);
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

  if (avatarLocal) avatarLocal.src = myProfile.avatar || defaultAvatar;
  if (nameLocal) nameLocal.innerText = myProfile.name || 'Você';
  if (tagLocal) tagLocal.innerText = `${myProfile.name || 'Você'} (Você)`;
  if (statusLocal) statusLocal.innerText = myProfile.status || 'Disponível';
}

remoteMicVolumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  masterVoiceVolume = val; // vale para a voz de todas as pessoas
  peers.forEach(p => { if (p.audioEl) p.audioEl.volume = val; });
  micVolValueLabel.innerText = `${Math.round(val * 100)}%`;
});

remoteScreenVolumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  remoteScreenAudio.volume = val;
  screenVolValueLabel.innerText = `${Math.round(val * 100)}%`;
});

let silentTrack = null;
function getSilentAudioTrack() {
  if (!silentTrack) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    silentTrack = ctx.createMediaStreamDestination().stream.getAudioTracks()[0];
  }
  return silentTrack;
}

// Sem microfone (ou antes dele ligar) vai uma faixa muda, para a chamada ainda receber o som dos outros
function getMainCallStream() {
  const mic = micStream && micStream.getAudioTracks()[0];
  return new MediaStream([mic || getSilentAudioTrack()]);
}

// Coloca o microfone atual em todas as chamadas de voz abertas
function syncMicToCalls() {
  const track = micStream && micStream.getAudioTracks()[0];
  if (!track) return;
  peers.forEach(e => {
    const pc = e.voiceCall && e.voiceCall.peerConnection;
    if (!pc) return;
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (sender && sender.track !== track) sender.replaceTrack(track).catch(() => {});
  });
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

let micStartPromise = null;
function startMicrophone() {
  if (micStream) return Promise.resolve();
  if (!micStartPromise) {
    micStartPromise = (async () => {
      try {
        micStream = await openMicStream();
        micStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
        syncMicToCalls();
      } catch (e) { console.warn('Sem mic:', e); }
    })().finally(() => { micStartPromise = null; });
  }
  return micStartPromise;
}

// Troca de microfone no meio da call, sem derrubar a chamada
async function switchMicrophone() {
  if (!micStream) return;
  try {
    const newStream = await openMicStream();
    newStream.getAudioTracks().forEach(tr => { tr.enabled = !isMicMuted; });
    const old = micStream;
    micStream = newStream;
    syncMicToCalls();
    old.getTracks().forEach(tr => tr.stop());
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


function stopScreenShare() {
  stopAppAudio();
  if (screenStream) {
    screenStream.getTracks().forEach(tr => tr.stop());
    screenStream = null;
  }
  peers.forEach(e => {
    if (e.screenOut) { safeClose(e.screenOut); e.screenOut = null; }
  });
  refreshMainView();
}

function beginScreenShare(stream) {
  screenStream = stream;
  const vt = stream.getVideoTracks()[0];
  try { vt.contentHint = 'motion'; } catch (e) {} // prioriza fluidez (jogos/vídeos)
  vt.onended = stopScreenShare;

  const viewers = verifiedPeers().length;
  if (viewers > 2) {
    showToast(`Transmitindo para ${viewers} pessoas: a qualidade é ajustada para caber na sua internet.`);
  }
  refreshMainView();
  sendScreenToAll(); // quem entrar depois também recebe
}

async function startScreenShare() {
  if (screenStream) {
    stopScreenShare();
    return;
  }
  if (!CAN_SHARE_SCREEN) {
    showToast('Este navegador não permite compartilhar a tela. Você pode assistir às transmissões dos outros.');
    return;
  }

  const qualityVal = document.getElementById('screen-quality-select').value;
  screenQuality = qualityVal;
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
  if (verifiedPeers().length === 0) {
    showToast('Ainda não há ninguém conectado na sala.');
    return;
  }
  appendChatMessage(myProfile.name || 'Você', text);
  broadcast({ type: 'CHAT_MSG', author: myProfile.name || 'Você', text: text });
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
  sendCamToAll();
  refreshDeviceLists();
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(tr => tr.stop());
    camStream = null;
  }
  peers.forEach(e => {
    if (e.camOut) { safeClose(e.camOut); e.camOut = null; }
  });
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
function applySpeakerToElement(el) {
  if (!SINK_SUPPORTED) return;
  const id = getPref('app_speaker_id') || 'default';
  el.setSinkId(id).catch(err => {
    console.warn('Saída de áudio indisponível:', err);
    setPref('app_speaker_id', '');
    el.setSinkId('default').catch(() => {});
  });
}

// Aplica o fone escolhido na voz de cada pessoa e no som da transmissão
function applySpeakerToAudioElements() {
  applySpeakerToElement(remoteScreenAudio);
  peers.forEach(e => { if (e.audioEl) applySpeakerToElement(e.audioEl); });
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

// ===========================================================================
// SORTEADOR (só na sala exclusiva): o resultado aparece para os dois
// ===========================================================================
function showRouletteResult(pick) {
  rouletteResult.innerText = `🎯 ${pick}`;
}

function spinRoulette() {
  const options = rouletteInput.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (options.length < 2) return showToast('Coloque pelo menos 2 opções (uma por linha).');
  const pick = options[Math.floor(Math.random() * options.length)];
  showRouletteResult(pick);
  broadcast({ type: 'ROULETTE', options, pick });
}

document.getElementById('btn-spin-roulette').addEventListener('click', spinRoulette);

// Remove a antiga "sala exclusiva" com PIN fixo que vinha escrita no código
function migrateOldSetup() {
  const db = getRoomsDatabase();
  if (db[OLD_EXCLUSIVE_ROOM] && db[OLD_EXCLUSIVE_ROOM].owner === 'Exclusiva') {
    delete db[OLD_EXCLUSIVE_ROOM];
    localStorage.setItem('app_rooms_db', JSON.stringify(db));
  }
  Object.keys(localStorage).filter(k => k.startsWith('app_recent_rooms:')).forEach(k => {
    try {
      const list = JSON.parse(localStorage.getItem(k) || '[]');
      const cleaned = list.filter(r => !(r.name === OLD_EXCLUSIVE_ROOM && String(r.pin) === '7777'));
      if (cleaned.length !== list.length) localStorage.setItem(k, JSON.stringify(cleaned));
    } catch (e) {}
  });
  localStorage.removeItem('app_vip_users'); // lista de VIPs não existe mais
}

// ===========================================================================
// AVISOS SONOROS (alguém entrou / saiu da sala / começou a compartilhar a tela)
// Os sons são gerados aqui mesmo (sem arquivos) e saem no fone escolhido
// ===========================================================================
let alertCtx = null;
let alertSinkId = null;

async function playAlertSound(kind) {
  try {
    if (!alertCtx) alertCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = alertCtx;

    // Segue o fone/caixa de som escolhido nas configurações
    const wanted = getPref('app_speaker_id');
    if (typeof ctx.setSinkId === 'function' && wanted !== alertSinkId) {
      alertSinkId = wanted;
      try { await ctx.setSinkId(wanted); } catch (e) { console.warn('Saída do aviso indisponível:', e); }
    }
    if (ctx.state === 'suspended') await ctx.resume();

    // entrada: dois toques subindo | saída: dois toques descendo | tela: três toques rápidos subindo
    const sounds = {
      join: { notes: [659.25, 880.0], step: 0.13 },
      leave: { notes: [783.99, 523.25], step: 0.14 },
      screen: { notes: [523.25, 659.25, 783.99], step: 0.09 }
    };
    const { notes, step } = sounds[kind] || sounds.join;
    const t0 = ctx.currentTime + 0.02;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t0 + i * step;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + step + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + step + 0.2);
    });
  } catch (e) {
    console.warn('Som de aviso indisponível:', e);
  }
}

// ===========================================================================
// TELA CHEIA
// ===========================================================================
const btnFullscreen = document.getElementById('btn-fullscreen');

btnFullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    console.warn('Tela cheia indisponível:', e);
    showToast('Não foi possível alternar a tela cheia.');
  }
});

document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  btnFullscreen.classList.toggle('btn-highlight', on);
  btnFullscreen.title = on ? 'Sair da tela cheia' : 'Tela cheia';
});

// ===========================================================================
// ATUALIZAÇÃO AUTOMÁTICA (só no app instalado)
// ===========================================================================
if (window.electronAPI && window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus((s) => {
    if (s.state === 'available') {
      updateBanner.classList.remove('hidden');
      btnInstallUpdate.classList.add('hidden');
      updateText.innerText = `Baixando a versão ${s.version}...`;
    } else if (s.state === 'downloading') {
      updateBanner.classList.remove('hidden');
      updateText.innerText = `Baixando atualização... ${s.percent}%`;
    } else if (s.state === 'ready') {
      updateBanner.classList.remove('hidden');
      updateText.innerText = `Versão ${s.version} pronta para instalar.`;
      btnInstallUpdate.classList.remove('hidden');
    }
  });

  btnInstallUpdate.addEventListener('click', () => {
    if (inRoom && roomEntered && !confirm('Você está numa sala. Reiniciar agora tira você da chamada. Continuar?')) return;
    window.electronAPI.installUpdate();
  });

  if (window.electronAPI.getAppVersion) {
    window.electronAPI.getAppVersion().then(v => { appVersionEl.innerText = `v${v}`; }).catch(() => {});
  }
}

// ===========================================================================
// NAVEGADOR E CELULAR (a mesma página funciona no PC e no celular)
// ===========================================================================
const IS_ELECTRON = !!(window.electronAPI && window.electronAPI.getSources);
const CAN_SHARE_SCREEN = IS_ELECTRON || !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
const CAN_FULLSCREEN = !!document.documentElement.requestFullscreen;

// Celulares normalmente só assistem: sem botão de compartilhar tela nem de tela cheia
if (!CAN_SHARE_SCREEN) document.getElementById('btn-screen').classList.add('hidden');
if (!CAN_FULLSCREEN) btnFullscreen.classList.add('hidden');

const audioUnlock = document.getElementById('audio-unlock');
const btnAudioUnlock = document.getElementById('btn-audio-unlock');

// iPhone e alguns Androids bloqueiam som que começa sozinho: se acontecer, pede um toque
function tryPlay(el) {
  if (!el || !el.srcObject) return;
  const p = el.play();
  if (p && p.catch) p.catch(() => audioUnlock.classList.remove('hidden'));
}

btnAudioUnlock.addEventListener('click', () => {
  peers.forEach(e => { if (e.audioEl) e.audioEl.play().catch(() => {}); });
  remoteScreenAudio.play().catch(() => {});
  if (alertCtx && alertCtx.state === 'suspended') alertCtx.resume();
  audioUnlock.classList.add('hidden');
});

// No primeiro toque na página, libera também o som dos avisos
document.addEventListener('pointerdown', () => {
  try {
    if (!alertCtx) alertCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (alertCtx.state === 'suspended') alertCtx.resume();
  } catch (e) {}
}, { once: true });

// Mantém a tela do celular acesa enquanto você está numa sala
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {}
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && inRoom && roomEntered) requestWakeLock();
});

// No celular o "beforeunload" nem sempre dispara; "pagehide" avisa que você saiu
window.addEventListener('pagehide', () => {
  if (inRoom && roomEntered) broadcast({ type: 'BYE' });
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

// Desligar agora SAI da sala e volta ao lobby (sem recarregar o app)
document.getElementById('btn-hangup').addEventListener('click', () => leaveRoom());

// Fechar a janela: avisa o outro lado e libera o ID da sala o quanto antes
window.addEventListener('beforeunload', () => {
  if (inRoom && roomEntered) broadcast({ type: 'BYE' });
  stopAppAudio();
  try { if (peer) peer.destroy(); } catch (e) {}
});

migrateOldSetup();
applySpeakerToAudioElements();
updateAuthUI();