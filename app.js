// --- CONFIGURAÇÃO DE SALA & PEERJS ---
const ROOM_NAME = 'nosso-cantinho-duo-call';

const roleSelect = document.getElementById('role-select');
let currentRole = localStorage.getItem('app_user_role') || 'host';

if (roleSelect) {
  roleSelect.value = currentRole;
  roleSelect.addEventListener('change', (e) => {
    localStorage.setItem('app_user_role', e.target.value);
    window.location.reload();
  });
}

const isHost = (currentRole === 'host');
const myPeerId = isHost ? `${ROOM_NAME}-host` : `${ROOM_NAME}-guest`;
const targetPeerId = isHost ? `${ROOM_NAME}-guest` : `${ROOM_NAME}-host`;

const peer = new Peer(myPeerId, {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
});

// CORREÇÃO: reconexão automática da SINALIZAÇÃO do PeerJS.
// Depois de muito tempo de chamada, o WebSocket de sinalização do PeerJS
// pode cair sozinho mesmo com a chamada principal (áudio/vídeo) continuando
// ativa normalmente — porque ela já não depende mais do servidor depois de
// estabelecida. O problema aparece só quando se tenta abrir uma conexão NOVA
// (como a transmissão de tela), que PRECISA da sinalização de novo: sem ela,
// o peer.call() é enviado só localmente e nunca chega no outro lado —
// resultando na tela preta que só um reload total resolvia antes.
let isPeerReconnecting = false;

function attemptPeerReconnect(delayMs = 1500) {
  if (isPeerReconnecting || peer.destroyed) return;
  isPeerReconnecting = true;
  setTimeout(() => {
    isPeerReconnecting = false;
    if (!peer.destroyed && peer.disconnected) {
      try {
        peer.reconnect();
      } catch (err) {
        console.warn('Falha ao tentar reconectar peer:', err);
      }
    }
  }, delayMs);
}

peer.on('disconnected', () => {
  console.warn('Peer desconectado do servidor de sinalização — tentando reconectar...');
  if (statusBadge) {
    statusBadge.innerText = '🔄 Reconectando ao servidor...';
    statusBadge.classList.remove('connected');
  }
  attemptPeerReconnect();
});

peer.on('error', (err) => {
  console.error('Erro no Peer:', err && err.type, err);
  const recoverableTypes = ['network', 'server-error', 'socket-error', 'socket-closed'];
  if (err && recoverableTypes.includes(err.type)) {
    attemptPeerReconnect();
  }
});

let micStream = null;
let camStream = null;
let screenStream = null;
let mainCall = null;
let screenCall = null;
let dataConn = null;
let connectTimer = null;

let isMicMuted = false;
let isPushMuted = false;
let isCamOn = false;
let isScreenSharing = false;
let isNoiseSuppressionOn = true;
let isLowGpuMode = false;
let isPipActive = false;
let isSelfCamHidden = false;

// Estado de Espelhamento Sincronizado
let isMyCamMirrored = (localStorage.getItem('mirror_my_camera') === 'true');
let isRemoteCamMirrored = false;

let micVolumeMultiplier = 1.0;
let screenVolumeMultiplier = 1.0;
let hudTimeout = null;
let controlsTimeout = null;

let audioContext = null;
let micGateGain = null;
let micGateInterval = null;

// Atalho Push-to-Mute Local (Navegador com suporte a Mouse Lateral 4 e 5)
let pushToMuteConfig = JSON.parse(localStorage.getItem('push_to_mute_config')) || {
  type: 'keyboard',
  code: 'KeyM',
  button: 0,
  label: 'Tecla M'
};
let isListeningForBinding = false;

const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%235865f2'><circle cx='50' cy='50' r='50'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M22 80c0-15 12-25 28-25s28 10 28 25z' fill='%23ffffff'/></svg>";

let myProfile = {
  name: localStorage.getItem('profile_name') || (isHost ? 'Mozin dela' : 'Lobinha'),
  avatar: localStorage.getItem('profile_avatar') || defaultAvatar,
  status: localStorage.getItem('profile_status') || '🟢 Disponível',
  startDate: localStorage.getItem('profile_start_date') || '2026-07-30'
};

let remoteProfile = {
  name: isHost ? 'Lobinha' : 'Mozin dela',
  avatar: defaultAvatar,
  status: 'Aguardando...',
  startDate: myProfile.startDate
};

// BUCKET LIST DATA
let defaultBucketData = {
  activeCategory: '🎮 Jogos',
  categories: {
    '🎮 Jogos': [
      { id: '1', text: 'Jogar Minecraft juntas', done: false },
      { id: '2', text: 'Zerar Palia', done: false }
    ],
    '🎬 Filmes & Séries': [
      { id: '3', text: 'Fazer maratona no final de semana', done: false }
    ]
  }
};
let bucketData = JSON.parse(localStorage.getItem('shared_bucket_list')) || defaultBucketData;

// Elementos DOM
const stageEl = document.getElementById('stage');
const statusBadge = document.getElementById('status-badge');
const localCam = document.getElementById('local-cam');
const remoteCam = document.getElementById('remote-cam');
const boxLocal = document.getElementById('box-local');
const boxRemote = document.getElementById('box-remote');
const mainStream = document.getElementById('main-stream');
const remoteVoiceAudio = document.getElementById('remote-voice-audio');
const containerScreenVolume = document.getElementById('container-screen-volume');
const volumeHud = document.getElementById('volume-hud');
const hudIcon = document.getElementById('hud-icon');
const hudText = document.getElementById('hud-text');

const avatarImgLocal = document.getElementById('avatar-img-local');
const avatarNameLocal = document.getElementById('avatar-name-local');
const avatarStatusLocal = document.getElementById('avatar-status-local');
const nameTagLocal = document.getElementById('name-tag-local');
const muteIndicatorLocal = document.getElementById('mute-indicator-local');

const avatarImgRemote = document.getElementById('avatar-img-remote');
const avatarNameRemote = document.getElementById('avatar-name-remote');
const avatarStatusRemote = document.getElementById('avatar-status-remote');
const nameTagRemote = document.getElementById('name-tag-remote');
const muteIndicatorRemote = document.getElementById('mute-indicator-remote');

const cameraSelect = document.getElementById('camera-select');
const micSelect = document.getElementById('mic-select');
const audioOutputSelect = document.getElementById('audio-output-select');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnScreen = document.getElementById('btn-screen');
const btnNoiseSuppression = document.getElementById('btn-noise-suppression');
const btnLowGpu = document.getElementById('btn-low-gpu');
const btnPipMode = document.getElementById('btn-pip-mode');
const btnPipRestore = document.getElementById('btn-pip-restore');
const btnHideSelfCam = document.getElementById('btn-hide-self-cam');
const btnRestoreSelfCam = document.getElementById('btn-restore-self-cam');
const btnToggleMirrorMyCam = document.getElementById('btn-toggle-mirror-my-cam');
const btnFullscreenCam = document.getElementById('btn-fullscreen-cam');

const screenPickerModal = document.getElementById('screen-picker-modal');
const screenSourcesList = document.getElementById('screen-sources-list');
const streamQualitySelect = document.getElementById('stream-quality-select');
const screenAudioSelect = document.getElementById('screen-audio-select');
const btnCloseScreenPicker = document.getElementById('btn-close-screen-picker');

const notesDrawer = document.getElementById('notes-drawer');
const btnOpenNotes = document.getElementById('btn-open-notes');
const btnCloseNotes = document.getElementById('btn-close-notes');
const sharedNotesArea = document.getElementById('shared-notes-area');
const notesSyncStatus = document.getElementById('notes-sync-status');
const notesUnreadDot = document.getElementById('notes-unread-dot');

const rouletteModal = document.getElementById('roulette-modal');
const btnOpenRoulette = document.getElementById('btn-open-roulette');
const btnCloseRoulette = document.getElementById('btn-close-roulette');
const btnSpinRoulette = document.getElementById('btn-spin-roulette');
const rouletteOptionsInput = document.getElementById('roulette-options-input');
const rouletteResultDisplay = document.getElementById('roulette-result-display');

const bucketModal = document.getElementById('bucket-modal');
const btnOpenBucket = document.getElementById('btn-open-bucket');
const btnCloseBucketTop = document.getElementById('btn-close-bucket-top');
const newCategoryInput = document.getElementById('new-category-input');
const btnAddCategory = document.getElementById('btn-add-category');
const bucketCategoriesBar = document.getElementById('bucket-categories-bar');
const newBucketItemInput = document.getElementById('new-bucket-item-input');
const btnAddBucketItem = document.getElementById('btn-add-bucket-item');
const bucketItemsList = document.getElementById('bucket-items-list');
const bucketProgressText = document.getElementById('bucket-progress-text');
const btnDeleteActiveCategory = document.getElementById('btn-delete-active-category');

const profileModal = document.getElementById('profile-modal');
const btnOpenProfile = document.getElementById('btn-open-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');
const btnSaveProfile = document.getElementById('btn-save-profile');
const profileNameInput = document.getElementById('profile-name-input');
const profileStatusInput = document.getElementById('profile-status-input');
const profileDateInput = document.getElementById('profile-date-input');
const profileFileInput = document.getElementById('profile-file-input');
const profilePreviewImg = document.getElementById('profile-preview-img');
const btnRecordKey = document.getElementById('btn-record-key');
const btnResetKey = document.getElementById('btn-reset-key');

const camSizeSlider = document.getElementById('cam-size-slider');
const camSizeValue = document.getElementById('cam-size-value');
const bgFileInput = document.getElementById('bg-file-input');
const btnResetBg = document.getElementById('btn-reset-bg');

const settingsModal = document.getElementById('settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

const micVolSlider = document.getElementById('remote-mic-volume');
const micVolValueDisplay = document.getElementById('mic-vol-value');
const screenVolSlider = document.getElementById('remote-screen-volume');
const screenVolValueDisplay = document.getElementById('screen-vol-value');

if (stageEl) stageEl.classList.add('camera-focus-mode');
localCam.muted = true;
remoteCam.muted = true;
remoteVoiceAudio.muted = false;
mainStream.muted = false;

// 1. CÂMERA REMOTA EM TELA CHEIA (Alternância e botão com ícone dinâmico)
function toggleRemoteFullscreenCam() {
  const isNowFullscreen = boxRemote.classList.toggle('fullscreen-focus');
  if (btnFullscreenCam) {
    btnFullscreenCam.innerText = isNowFullscreen ? '✕' : '⛶';
    btnFullscreenCam.title = isNowFullscreen ? 'Recolher câmera' : 'Expandir câmera dela';
  }
}

if (boxRemote) {
  boxRemote.addEventListener('dblclick', (e) => {
    if (e.target.closest('.btn-cam-action')) return;
    e.stopPropagation();
    toggleRemoteFullscreenCam();
  });
}

if (btnFullscreenCam) {
  btnFullscreenCam.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleRemoteFullscreenCam();
  });
}

// Espelhamento
function updateMirrorUI() {
  if (boxLocal) boxLocal.classList.toggle('mirrored', isMyCamMirrored);
  if (btnToggleMirrorMyCam) {
    btnToggleMirrorMyCam.innerText = isMyCamMirrored 
      ? '🪞 Espelhar Minha Câmera: Ativado' 
      : '🪞 Espelhar Minha Câmera: Desativado';
    btnToggleMirrorMyCam.classList.toggle('btn-toggle-on', isMyCamMirrored);
  }
}
updateMirrorUI();

if (btnToggleMirrorMyCam) {
  btnToggleMirrorMyCam.addEventListener('click', () => {
    isMyCamMirrored = !isMyCamMirrored;
    localStorage.setItem('mirror_my_camera', isMyCamMirrored);
    updateMirrorUI();
    sendDataMessage({ type: 'MIRROR_STATE', isMirrored: isMyCamMirrored });
  });
}

function unlockMediaAudio() {
  if (remoteVoiceAudio && remoteVoiceAudio.srcObject) remoteVoiceAudio.play().catch(() => {});
  if (mainStream && mainStream.srcObject) mainStream.play().catch(() => {});
  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
}
window.addEventListener('click', unlockMediaAudio);
window.addEventListener('touchstart', unlockMediaAudio);
window.addEventListener('keydown', unlockMediaAudio);

function updateProfileUI() {
  if (avatarImgLocal) avatarImgLocal.src = myProfile.avatar || defaultAvatar;
  if (avatarNameLocal) avatarNameLocal.innerText = myProfile.name;
  if (avatarStatusLocal) avatarStatusLocal.innerText = myProfile.status;
  if (nameTagLocal) nameTagLocal.innerText = `${myProfile.name} (Você)`;

  if (avatarImgRemote) avatarImgRemote.src = remoteProfile.avatar || defaultAvatar;
  if (avatarNameRemote) avatarNameRemote.innerText = remoteProfile.name;
  if (avatarStatusRemote) avatarStatusRemote.innerText = remoteProfile.status;
  if (nameTagRemote) nameTagRemote.innerText = remoteProfile.name;
}
updateProfileUI();

// Ocultar e Restaurar Própria Câmera
function toggleSelfCamVisibility(hide) {
  isSelfCamHidden = hide;
  boxLocal.classList.toggle('cam-hidden', isSelfCamHidden);
  if (btnRestoreSelfCam) {
    btnRestoreSelfCam.classList.toggle('hidden', !isSelfCamHidden);
  }
}

if (btnHideSelfCam) {
  btnHideSelfCam.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelfCamVisibility(true);
  });
}

if (btnRestoreSelfCam) {
  btnRestoreSelfCam.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelfCamVisibility(false);
  });
}

// 2. CÁLCULO E FORMATAÇÃO DO TEMPO JUNTAS
function updateLoveCounter() {
  try {
    let dateStr = myProfile.startDate || '2026-07-30';
    let year, month, day;

    if (dateStr.includes('-')) {
      [year, month, day] = dateStr.split('-').map(Number);
    } else if (dateStr.includes('/')) {
      [day, month, year] = dateStr.split('/').map(Number);
    } else {
      year = 2026; month = 7; day = 30;
    }

    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    if (isNaN(startDate.getTime())) return;

    let y1 = startDate.getFullYear();
    let m1 = startDate.getMonth();
    let d1 = startDate.getDate();

    let y2 = today.getFullYear();
    let m2 = today.getMonth();
    let d2 = today.getDate();

    let years = y2 - y1;
    let months = m2 - m1;
    let days = d2 - d1;

    if (days < 0) {
      months--;
      days += 30;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const totalDaysDisplay = (years === 0 && months === 0) ? days : Math.max(0, Math.round((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    const daysBadge = document.getElementById('love-days-display');
    if (daysBadge) daysBadge.innerText = `💖 ${totalDaysDisplay} dias juntas`;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'ano' : 'anos'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
    if (days > 0 || parts.length === 0) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);

    const tooltipFull = document.getElementById('tooltip-full-time');
    if (tooltipFull) {
      tooltipFull.innerText = `${parts.join(' e ')} compartilhando momentos ❤️`;
    }

    let nextAnniversary = new Date(y2, m2, d1, 0, 0, 0, 0);
    if (nextAnniversary <= today) {
      nextAnniversary = new Date(y2, m2 + 1, d1, 0, 0, 0, 0);
    }
    const daysUntilNext = Math.max(1, Math.round((nextAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    const tooltipNext = document.getElementById('tooltip-next-event');
    if (tooltipNext) {
      tooltipNext.innerText = `🎉 Próximo mesversário em ${daysUntilNext} ${daysUntilNext === 1 ? 'dia' : 'dias'}!`;
    }
  } catch (err) {
    console.error('Erro no contador:', err);
  }
}
setInterval(updateLoveCounter, 60000);
updateLoveCounter();

// Cronômetro da Chamada
let callStartTime = null;
let callTimerInterval = null;

function startCallTimer() {
  callStartTime = Date.now();
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    const display = document.getElementById('call-timer');
    if (display) display.innerText = `⏱️ ${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  const display = document.getElementById('call-timer');
  if (display) display.innerText = '⏱️ 00:00:00';
}

function initAudioAnalyser() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function setupSpeakingDetector(stream, isLocal) {
  try {
    initAudioAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const box = isLocal ? boxLocal : boxRemote;

    function checkVolume() {
      if (isLowGpuMode) {
        requestAnimationFrame(checkVolume);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;

      if (avg > 15 && !(isLocal && (isMicMuted || isPushMuted))) {
        box.classList.add('speaking');
      } else {
        box.classList.remove('speaking');
      }
      requestAnimationFrame(checkVolume);
    }
    checkVolume();
  } catch (err) {
    console.warn('Detector de voz:', err);
  }
}

// BUCKET LIST LOGIC
function saveAndBroadcastBucket() {
  localStorage.setItem('shared_bucket_list', JSON.stringify(bucketData));
  renderBucketUI();
  sendDataMessage({ type: 'BUCKET_UPDATE', bucket: bucketData });
}

function renderBucketUI() {
  if (!bucketCategoriesBar) return;
  bucketCategoriesBar.innerHTML = '';
  const cats = Object.keys(bucketData.categories);

  if (cats.length === 0) {
    bucketData.categories['🌟 Planos'] = [];
    bucketData.activeCategory = '🌟 Planos';
  }

  if (!bucketData.categories[bucketData.activeCategory]) {
    bucketData.activeCategory = Object.keys(bucketData.categories)[0];
  }

  Object.keys(bucketData.categories).forEach(catName => {
    const tab = document.createElement('button');
    tab.className = `bucket-tab ${catName === bucketData.activeCategory ? 'active' : ''}`;
    tab.innerText = catName;
    tab.addEventListener('click', () => {
      bucketData.activeCategory = catName;
      saveAndBroadcastBucket();
    });
    bucketCategoriesBar.appendChild(tab);
  });

  const activeItems = bucketData.categories[bucketData.activeCategory] || [];
  bucketItemsList.innerHTML = '';

  let completedCount = 0;
  activeItems.forEach(item => {
    if (item.done) completedCount++;

    const row = document.createElement('div');
    row.className = `bucket-item-row ${item.done ? 'completed' : ''}`;
    row.innerHTML = `
      <div class="bucket-item-left">
        <input type="checkbox" ${item.done ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
        <span class="bucket-item-text">${item.text}</span>
      </div>
      <button class="btn-bucket-delete" title="Excluir item">✕</button>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      item.done = checkbox.checked;
      saveAndBroadcastBucket();
    });

    const btnDelete = row.querySelector('.btn-bucket-delete');
    btnDelete.addEventListener('click', () => {
      bucketData.categories[bucketData.activeCategory] = activeItems.filter(i => i.id !== item.id);
      saveAndBroadcastBucket();
    });

    bucketItemsList.appendChild(row);
  });

  if (bucketProgressText) {
    bucketProgressText.innerText = `${completedCount} de ${activeItems.length} concluídos`;
  }
}

if (btnAddCategory) {
  btnAddCategory.addEventListener('click', () => {
    const name = newCategoryInput.value.trim();
    if (!name) return;
    if (!bucketData.categories[name]) {
      bucketData.categories[name] = [];
      bucketData.activeCategory = name;
      newCategoryInput.value = '';
      saveAndBroadcastBucket();
    }
  });
}

if (btnAddBucketItem) {
  btnAddBucketItem.addEventListener('click', () => {
    const text = newBucketItemInput.value.trim();
    if (!text) return;
    if (!bucketData.categories[bucketData.activeCategory]) {
      bucketData.categories[bucketData.activeCategory] = [];
    }
    bucketData.categories[bucketData.activeCategory].push({
      id: Date.now().toString(),
      text: text,
      done: false
    });
    newBucketItemInput.value = '';
    saveAndBroadcastBucket();
  });
}

if (btnDeleteActiveCategory) {
  btnDeleteActiveCategory.addEventListener('click', () => {
    delete bucketData.categories[bucketData.activeCategory];
    const remaining = Object.keys(bucketData.categories);
    bucketData.activeCategory = remaining.length > 0 ? remaining[0] : '🌟 Planos';
    saveAndBroadcastBucket();
  });
}

if (btnOpenBucket) btnOpenBucket.addEventListener('click', () => {
  renderBucketUI();
  bucketModal.classList.add('active');
});
if (btnCloseBucketTop) btnCloseBucketTop.addEventListener('click', () => bucketModal.classList.remove('active'));

// Redimensionamento Inteligente
function applyCamSize(size) {
  document.documentElement.style.setProperty('--remote-cam-width', `${size}px`);
  if (camSizeValue) camSizeValue.innerText = `${size}px`;
  localStorage.setItem('custom_cam_width', size);
}

const savedCamSize = localStorage.getItem('custom_cam_width') || '680';
applyCamSize(savedCamSize);
if (camSizeSlider) {
  camSizeSlider.value = savedCamSize;
  camSizeSlider.addEventListener('input', (e) => applyCamSize(e.target.value));
}

// Fundo
if (bgFileInput) {
  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const bgUrl = event.target.result;
      localStorage.setItem('app_stage_background', bgUrl);
      stageEl.style.backgroundImage = `url("${bgUrl}")`;
    };
    reader.readAsDataURL(file);
  });
}

if (btnResetBg) {
  btnResetBg.addEventListener('click', () => {
    localStorage.removeItem('app_stage_background');
    stageEl.style.backgroundImage = 'none';
  });
}

const savedBg = localStorage.getItem('app_stage_background');
if (savedBg && stageEl) stageEl.style.backgroundImage = `url("${savedBg}")`;

// 3. ATALHO PUSH-TO-MUTE COM SUPORTE TOTAL A BOTÕES LATERAIS DE MOUSE
function updateBindingButtonLabel() {
  if (btnRecordKey) {
    btnRecordKey.innerText = `Atalho: ${pushToMuteConfig.label}`;
    btnRecordKey.classList.remove('btn-highlight');
  }
}
updateBindingButtonLabel();

if (btnRecordKey) {
  btnRecordKey.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isListeningForBinding = true;
    btnRecordKey.innerText = '🔴 Pressione qualquer tecla ou botão...';
    btnRecordKey.classList.add('btn-highlight');
  });
}

if (btnResetKey) {
  btnResetKey.addEventListener('click', (e) => {
    e.preventDefault();
    pushToMuteConfig = { type: 'keyboard', code: 'KeyM', button: 0, label: 'Tecla M' };
    localStorage.setItem('push_to_mute_config', JSON.stringify(pushToMuteConfig));
    updateBindingButtonLabel();
  });
}

window.addEventListener('keydown', (e) => {
  if (isListeningForBinding) {
    e.preventDefault();
    e.stopPropagation();
    pushToMuteConfig = {
      type: 'keyboard',
      code: e.code,
      button: 0,
      label: `Tecla ${e.key.toUpperCase() === ' ' ? 'Espaço' : e.key.toUpperCase()}`
    };
    localStorage.setItem('push_to_mute_config', JSON.stringify(pushToMuteConfig));
    isListeningForBinding = false;
    updateBindingButtonLabel();
    return;
  }

  if (e.repeat) return;
  if (pushToMuteConfig.type === 'keyboard' && e.code === pushToMuteConfig.code && !e.target.matches('input, textarea')) {
    activatePushMute();
  }
}, true);

window.addEventListener('keyup', (e) => {
  if (pushToMuteConfig.type === 'keyboard' && e.code === pushToMuteConfig.code && !e.target.matches('input, textarea')) {
    deactivatePushMute();
  }
});

function handlePointerDown(e) {
  if (isListeningForBinding) {
    if (e.button === 0 && e.target === btnRecordKey) return;
    e.preventDefault();
    e.stopPropagation();

    let mouseLabel = `Mouse Botão ${e.button}`;
    if (e.button === 1) mouseLabel = 'Mouse Meio (Scroll)';
    else if (e.button === 3) mouseLabel = 'Mouse Lateral 1 (Traseiro)';
    else if (e.button === 4) mouseLabel = 'Mouse Lateral 2 (Frontal)';

    pushToMuteConfig = {
      type: 'mouse',
      code: '',
      button: e.button,
      label: mouseLabel
    };
    localStorage.setItem('push_to_mute_config', JSON.stringify(pushToMuteConfig));
    isListeningForBinding = false;
    updateBindingButtonLabel();
    return;
  }

  if (pushToMuteConfig.type === 'mouse' && e.button === pushToMuteConfig.button) {
    e.preventDefault();
    activatePushMute();
  }
}

function handlePointerUp(e) {
  if (pushToMuteConfig.type === 'mouse' && e.button === pushToMuteConfig.button) {
    e.preventDefault();
    deactivatePushMute();
  }
}

window.addEventListener('pointerdown', handlePointerDown, true);
window.addEventListener('pointerup', handlePointerUp, true);
window.addEventListener('auxclick', (e) => e.preventDefault(), true);

function activatePushMute() {
  if (micStream && !isMicMuted) {
    isPushMuted = true;
    if (micGateGain && audioContext) {
      micGateGain.gain.setTargetAtTime(0.0, audioContext.currentTime, 0.01);
    }
    micStream.getAudioTracks().forEach(t => t.enabled = false);
    btnToggleMic.innerText = '🔇';
    btnToggleMic.classList.add('btn-active');
    muteIndicatorLocal.classList.remove('hidden');
    sendDataMessage({ type: 'MUTE_STATE', isMuted: true });
  }
}

function deactivatePushMute() {
  if (micStream && !isMicMuted) {
    isPushMuted = false;
    if (micGateGain && audioContext) {
      micGateGain.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
    }
    micStream.getAudioTracks().forEach(t => t.enabled = true);
    btnToggleMic.innerText = '🎤';
    btnToggleMic.classList.remove('btn-active');
    muteIndicatorLocal.classList.add('hidden');
    sendDataMessage({ type: 'MUTE_STATE', isMuted: false });
  }
}

// 4. SUBSTITUIÇÃO SEGURA DE TRILHAS
function replaceTrackOnCall(newTrack, kind) {
  if (mainCall && mainCall.peerConnection) {
    const senders = mainCall.peerConnection.getSenders();
    const sender = senders.find(s => s.track && s.track.kind === kind);
    if (sender) {
      sender.replaceTrack(newTrack).catch(err => console.error(`Erro ao substituir ${kind}:`, err));
    }
  }
}

// Volumes
function showVolumeHUD(icon, value) {
  hudIcon.innerText = icon;
  hudText.innerText = `${Math.round(value * 100)}%`;
  volumeHud.classList.add('visible');
  if (hudTimeout) clearTimeout(hudTimeout);
  hudTimeout = setTimeout(() => { volumeHud.classList.remove('visible'); }, 1200);
}

function updateRemoteMicVolume(val) {
  micVolumeMultiplier = Math.max(0, Math.min(2.0, val));
  remoteVoiceAudio.volume = Math.min(micVolumeMultiplier, 1.0);
  if (micVolSlider) micVolSlider.value = micVolumeMultiplier;
  if (micVolValueDisplay) micVolValueDisplay.innerText = `${Math.round(micVolumeMultiplier * 100)}%`;
}

function updateRemoteScreenVolume(val) {
  screenVolumeMultiplier = Math.max(0, Math.min(2.0, val));
  mainStream.volume = Math.min(screenVolumeMultiplier, 1.0);
  if (screenVolSlider) screenVolSlider.value = screenVolumeMultiplier;
  if (screenVolValueDisplay) screenVolValueDisplay.innerText = `${Math.round(screenVolumeMultiplier * 100)}%`;
}

if (micVolSlider) micVolSlider.addEventListener('input', (e) => updateRemoteMicVolume(parseFloat(e.target.value)));
if (screenVolSlider) screenVolSlider.addEventListener('input', (e) => updateRemoteScreenVolume(parseFloat(e.target.value)));

boxRemote.addEventListener('wheel', (e) => {
  e.preventDefault();
  const nextVal = micVolumeMultiplier + (e.deltaY < 0 ? 0.05 : -0.05);
  updateRemoteMicVolume(nextVal);
  showVolumeHUD('🎙️', micVolumeMultiplier);
});

mainStream.addEventListener('wheel', (e) => {
  e.preventDefault();
  const nextVal = screenVolumeMultiplier + (e.deltaY < 0 ? 0.05 : -0.05);
  updateRemoteScreenVolume(nextVal);
  showVolumeHUD('🖥️', screenVolumeMultiplier);
});

// Ocultação Automática
function updateAutohideState() {
  const isStreamingActive = isScreenSharing || (mainStream.srcObject !== null);
  const isFs = !!document.fullscreenElement;
  const shouldAutohide = isStreamingActive || isFs;

  document.body.classList.toggle('autohide-controls', shouldAutohide);
  if (shouldAutohide) {
    revealControlsTemporarily();
  } else {
    document.body.classList.remove('show-controls');
  }
}

function revealControlsTemporarily() {
  if (!document.body.classList.contains('autohide-controls')) return;
  document.body.classList.add('show-controls');
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    if (!document.querySelector('.modal-backdrop.active')) {
      document.body.classList.remove('show-controls');
    }
  }, 2500);
}

window.addEventListener('mousemove', revealControlsTemporarily);
window.addEventListener('touchstart', revealControlsTemporarily);

// Controle de Tela Cheia Real
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
}

stageEl.addEventListener('dblclick', (e) => {
  if (e.target.closest('.cam-box') || e.target.closest('.btn-cam-action') || e.target.closest('.restore-cam-tab')) return;
  toggleFullscreen();
});

mainStream.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

document.addEventListener('fullscreenchange', updateAutohideState);

// Modo Leve
btnLowGpu.addEventListener('click', () => {
  isLowGpuMode = !isLowGpuMode;
  document.body.classList.toggle('low-gpu-mode', isLowGpuMode);
  btnLowGpu.innerText = isLowGpuMode ? '⚡ Modo Leve: ON' : '⚡ Modo Leve: OFF';
  btnLowGpu.classList.toggle('btn-toggle-on', isLowGpuMode);
});

// Modo PiP
function togglePiP() {
  isPipActive = !isPipActive;
  document.body.classList.toggle('pip-active', isPipActive);
  btnPipMode.classList.toggle('btn-active', isPipActive);
  if (window.electronAPI && window.electronAPI.togglePipMode) {
    window.electronAPI.togglePipMode(isPipActive);
  }
}
btnPipMode.addEventListener('click', togglePiP);
if (btnPipRestore) btnPipRestore.addEventListener('click', togglePiP);

// Dispositivos
async function loadDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const savedMic = localStorage.getItem('selected_mic_id');
    const savedCam = localStorage.getItem('selected_cam_id');
    const savedAudioOut = localStorage.getItem('selected_audio_out_id');

    cameraSelect.innerHTML = '';
    micSelect.innerHTML = '';
    if (audioOutputSelect) audioOutputSelect.innerHTML = '';
    if (screenAudioSelect) screenAudioSelect.innerHTML = '<option value="">🔇 Sem áudio</option>';

    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;

      if (device.kind === 'videoinput') {
        option.text = device.label || `Câmera ${cameraSelect.length + 1}`;
        if (device.deviceId === savedCam) option.selected = true;
        cameraSelect.appendChild(option);
      } else if (device.kind === 'audioinput') {
        option.text = device.label || `Microfone ${micSelect.length + 1}`;
        if (device.deviceId === savedMic) option.selected = true;
        micSelect.appendChild(option);

        if (screenAudioSelect) {
          const screenOpt = document.createElement('option');
          screenOpt.value = device.deviceId;
          screenOpt.text = device.label || `Entrada ${screenAudioSelect.length}`;
          screenAudioSelect.appendChild(screenOpt);
        }
      } else if (device.kind === 'audiooutput' && audioOutputSelect) {
        option.text = device.label || `Saída ${audioOutputSelect.length + 1}`;
        if (device.deviceId === savedAudioOut) option.selected = true;
        audioOutputSelect.appendChild(option);
      }
    });

    if (audioOutputSelect && audioOutputSelect.value && typeof remoteVoiceAudio.setSinkId === 'function') {
      remoteVoiceAudio.setSinkId(audioOutputSelect.value).catch(() => {});
    }
  } catch (err) {
    console.error('Erro ao listar dispositivos:', err);
  }
}

// Microfone
async function startMicrophone() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());

  if (micGateInterval) {
    clearInterval(micGateInterval);
    micGateInterval = null;
  }

  const audioSource = micSelect.value;
  if (audioSource) localStorage.setItem('selected_mic_id', audioSource);

  try {
    const rawMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: audioSource ? { exact: audioSource } : undefined,
        echoCancellation: true,
        noiseSuppression: isNoiseSuppressionOn,
        autoGainControl: true
      },
      video: false
    });

    initAudioAnalyser();
    const actx = audioContext;
    const micSource = actx.createMediaStreamSource(rawMicStream);
    micGateGain = actx.createGain();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 256;

    micSource.connect(analyser);
    micSource.connect(micGateGain);

    const dest = actx.createMediaStreamDestination();
    micGateGain.connect(dest);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    micGateInterval = setInterval(() => {
      if (isMicMuted || isPushMuted) {
        micGateGain.gain.setTargetAtTime(0.0, actx.currentTime, 0.01);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;

      if (avg < 12) {
        micGateGain.gain.setTargetAtTime(0.0, actx.currentTime, 0.05);
      } else {
        micGateGain.gain.setTargetAtTime(1.0, actx.currentTime, 0.02);
      }
    }, 30);

    micStream = dest.stream;
    const audioTrack = micStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !isMicMuted && !isPushMuted;
      replaceTrackOnCall(audioTrack, 'audio');
    }

    setupSpeakingDetector(micStream, true);
    loadDevices();
  } catch (err) {
    console.warn('Microfone não acessado:', err);
  }
}

btnToggleMic.addEventListener('click', () => {
  if (!micStream) startMicrophone().then(() => toggleMicState());
  else toggleMicState();
});

function toggleMicState() {
  if (!micStream) return;
  isMicMuted = !isMicMuted;
  if (micGateGain && audioContext) {
    micGateGain.gain.setTargetAtTime(isMicMuted ? 0.0 : 1.0, audioContext.currentTime, 0.02);
  }
  const track = micStream.getAudioTracks()[0];
  if (track) track.enabled = !isMicMuted;

  btnToggleMic.innerText = isMicMuted ? '🔇' : '🎤';
  btnToggleMic.classList.toggle('btn-active', isMicMuted);
  muteIndicatorLocal.classList.toggle('hidden', !isMicMuted);
  sendDataMessage({ type: 'MUTE_STATE', isMuted: isMicMuted });
}

btnNoiseSuppression.addEventListener('click', () => {
  isNoiseSuppressionOn = !isNoiseSuppressionOn;
  btnNoiseSuppression.innerText = isNoiseSuppressionOn ? '✨ Supressão: ON' : '✨ Supressão: OFF';
  btnNoiseSuppression.classList.toggle('btn-toggle-on', isNoiseSuppressionOn);
  btnNoiseSuppression.classList.toggle('btn-toggle-off', !isNoiseSuppressionOn);
  startMicrophone();
});

micSelect.addEventListener('change', () => {
  if (micSelect.value) {
    localStorage.setItem('selected_mic_id', micSelect.value);
    startMicrophone();
  }
});

function createBlackVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillRect(0, 0, 2, 2);
  const blackStream = canvas.captureStream(1);
  const blackTrack = blackStream.getVideoTracks()[0];
  blackTrack.enabled = false;
  return blackTrack;
}

// 5. CÂMERA (Ciclo de Vida Blindado)
async function toggleCamera() {
  if (isCamOn) {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
    }
    localCam.srcObject = null;
    boxLocal.classList.remove('video-active');
    isCamOn = false;
    btnToggleCam.classList.remove('btn-active');
    sendDataMessage({ type: 'CAM_STATE', isCamOn: false });
    replaceTrackOnCall(createBlackVideoTrack(), 'video');
  } else {
    const videoSource = cameraSelect.value;
    if (videoSource) localStorage.setItem('selected_cam_id', videoSource);
    try {
      const constraints = {
        video: videoSource
          ? { deviceId: { exact: videoSource }, width: { ideal: 1280 } }
          : { facingMode: 'user', width: { ideal: 1280 } },
        audio: false
      };
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      localCam.srcObject = camStream;
      boxLocal.classList.add('video-active');
      isCamOn = true;
      btnToggleCam.classList.add('btn-active');
      sendDataMessage({ type: 'CAM_STATE', isCamOn: true });

      const videoTrack = camStream.getVideoTracks()[0];
      replaceTrackOnCall(videoTrack, 'video');
    } catch (err) {
      alert('Erro ao acessar câmera: ' + err.message);
    }
  }
}

btnToggleCam.addEventListener('click', toggleCamera);
cameraSelect.addEventListener('change', () => {
  if (cameraSelect.value) {
    localStorage.setItem('selected_cam_id', cameraSelect.value);
    if (isCamOn) {
      toggleCamera().then(() => toggleCamera());
    }
  }
});

// 6. TRANSMISSÃO DE TELA (Desktop Electron)
async function toggleScreenShare() {
  if (isScreenSharing) {
    stopScreenSharing();
    return;
  }

  if (window.electronAPI && window.electronAPI.getSources) {
    try {
      const sources = await window.electronAPI.getSources();
      screenSourcesList.innerHTML = '';
      sources.forEach(source => {
        const card = document.createElement('div');
        card.className = 'source-card';
        card.innerHTML = `
          <img class="source-thumb" src="${source.thumbnail}" alt="${source.name}">
          <span class="source-title" title="${source.name}">${source.name}</span>
        `;
        card.addEventListener('click', async () => {
          screenPickerModal.classList.remove('active');
          await startElectronStream(source.id);
        });
        screenSourcesList.appendChild(card);
      });
      screenPickerModal.classList.add('active');
    } catch (err) {
      console.error('Erro ao listar fontes:', err);
    }
  }
}

async function startElectronStream(sourceId) {
  const isHighQuality = (streamQualitySelect.value === '1080p60');
  const maxWidth = isHighQuality ? 1920 : 1280;
  const maxFps = isHighQuality ? 60 : 30;
  const audioDeviceId = screenAudioSelect ? screenAudioSelect.value : '';

  try {
    const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: maxWidth,
          maxFrameRate: maxFps
        }
      }
    });
    const videoTrack = videoOnlyStream.getVideoTracks()[0];

    let cleanAudioTrack = null;
    if (audioDeviceId) {
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: audioDeviceId } },
          video: false
        });
        cleanAudioTrack = audioOnlyStream.getAudioTracks()[0];
      } catch (audioErr) {
        console.warn('Erro ao capturar áudio da tela:', audioErr);
      }
    }

    screenStream = cleanAudioTrack
      ? new MediaStream([videoTrack, cleanAudioTrack])
      : new MediaStream([videoTrack]);

    handleStreamStart(screenStream);
  } catch (err) {
    alert('Erro ao capturar tela: ' + err.message);
  }
}

function handleStreamStart(stream) {
  isScreenSharing = true;
  if (stageEl) stageEl.classList.remove('camera-focus-mode');

  const hasAudio = stream.getAudioTracks().length > 0;
  if (containerScreenVolume) containerScreenVolume.classList.toggle('hidden', !hasAudio);

  mainStream.srcObject = stream;
  mainStream.muted = true;
  mainStream.play().catch(() => {});

  btnScreen.classList.add('btn-danger');
  btnScreen.classList.remove('btn-highlight');

  sendDataMessage({ type: 'SCREEN_STATE', isSharing: true });
  sendScreenCall();
  updateAutohideState();

  stream.getVideoTracks()[0].onended = () => { stopScreenSharing(); };
}

function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  isScreenSharing = false;

  if (stageEl) stageEl.classList.add('camera-focus-mode');
  if (containerScreenVolume) containerScreenVolume.classList.add('hidden');
  mainStream.srcObject = null;

  btnScreen.classList.remove('btn-danger');
  btnScreen.classList.add('btn-highlight');

  sendDataMessage({ type: 'SCREEN_STATE', isSharing: false });
  if (screenCall) {
    try { screenCall.close(); } catch(e) {}
    screenCall = null;
  }
  updateAutohideState();
}

btnScreen.addEventListener('click', toggleScreenShare);
if (btnCloseScreenPicker) btnCloseScreenPicker.addEventListener('click', () => screenPickerModal.classList.remove('active'));

// 7. BLOCO DE NOTAS COM INDICADOR VISUAL (Bolinha Vermelha)
function toggleNotes() {
  notesDrawer.classList.toggle('open');
  if (notesDrawer.classList.contains('open')) {
    if (notesUnreadDot) notesUnreadDot.classList.add('hidden');
  }
}
btnOpenNotes.addEventListener('click', toggleNotes);
btnCloseNotes.addEventListener('click', () => notesDrawer.classList.remove('open'));

sharedNotesArea.value = localStorage.getItem('shared_notes_content') || '';
sharedNotesArea.addEventListener('input', (e) => {
  const content = e.target.value;
  localStorage.setItem('shared_notes_content', content);
  sendDataMessage({ type: 'NOTES_UPDATE', text: content });
  notesSyncStatus.innerText = '🟢 Sincronizado agora';
});

// Sorteador
function toggleRoulette() { rouletteModal.classList.toggle('active'); }
btnOpenRoulette.addEventListener('click', toggleRoulette);
btnCloseRoulette.addEventListener('click', () => rouletteModal.classList.remove('active'));

rouletteOptionsInput.addEventListener('input', (e) => {
  sendDataMessage({ type: 'ROULETTE_OPTIONS_UPDATE', options: e.target.value });
});

btnSpinRoulette.addEventListener('click', () => {
  const raw = rouletteOptionsInput.value.trim().split('\n').filter(Boolean);
  if (!raw.length) return;
  const picked = raw[Math.floor(Math.random() * raw.length)];
  rouletteResultDisplay.innerText = `🎉 Resultado: ${picked}!`;
  sendDataMessage({ type: 'ROULETTE_RESULT', result: picked });
});

// Configurações
function toggleSettings() { settingsModal.classList.toggle('active'); }
btnOpenSettings.addEventListener('click', toggleSettings);
btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

// WebRTC PeerJS Call
function getMainCallStream() {
  const tracks = [];
  if (micStream && micStream.getAudioTracks().length > 0) {
    tracks.push(micStream.getAudioTracks()[0]);
  } else {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    osc.connect(dst);
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    tracks.push(track);
  }

  if (isCamOn && camStream) {
    camStream.getVideoTracks().forEach(t => tracks.push(t));
  } else {
    tracks.push(createBlackVideoTrack());
  }

  return new MediaStream(tracks);
}

// CORREÇÃO: se o peer estiver desconectado da sinalização no momento de
// transmitir tela, dispara a reconexão e tenta de novo em instantes, em vez
// de simplesmente falhar em silêncio (o que causava a tela preta).
function sendScreenCall() {
  if (!isScreenSharing || !screenStream) return;

  if (peer.disconnected) {
    console.warn('Peer desconectado ao tentar transmitir tela — reconectando antes de tentar de novo...');
    attemptPeerReconnect();
    setTimeout(sendScreenCall, 2000);
    return;
  }

  screenCall = peer.call(targetPeerId, screenStream, { metadata: { type: 'screen' } });
}

function sendDataMessage(data) {
  if (dataConn && dataConn.open) dataConn.send(data);
}

function setupDataConnection(conn) {
  dataConn = conn;
  dataConn.on('open', () => {
    sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
    sendDataMessage({ type: 'NOTES_UPDATE', text: sharedNotesArea.value });
    sendDataMessage({ type: 'MUTE_STATE', isMuted: isMicMuted });
    sendDataMessage({ type: 'CAM_STATE', isCamOn: isCamOn });
    sendDataMessage({ type: 'ROULETTE_OPTIONS_UPDATE', options: rouletteOptionsInput.value });
    sendDataMessage({ type: 'BUCKET_UPDATE', bucket: bucketData });
    sendDataMessage({ type: 'MIRROR_STATE', isMirrored: isMyCamMirrored });
  });

  dataConn.on('data', data => {
    if (data.type === 'PROFILE_UPDATE') {
      remoteProfile = data.profile;
      updateProfileUI();
      updateLoveCounter();
    } else if (data.type === 'CAM_STATE') {
      boxRemote.classList.toggle('video-active', data.isCamOn);
    } else if (data.type === 'MUTE_STATE') {
      muteIndicatorRemote.classList.toggle('hidden', !data.isMuted);
    } else if (data.type === 'MIRROR_STATE') {
      isRemoteCamMirrored = data.isMirrored;
      if (boxRemote) boxRemote.classList.toggle('mirrored', isRemoteCamMirrored);
    } else if (data.type === 'SCREEN_STATE') {
      stageEl.classList.toggle('camera-focus-mode', !data.isSharing);
      if (!data.isSharing) {
        containerScreenVolume.classList.add('hidden');
        mainStream.srcObject = null;
      }
      updateAutohideState();
    } else if (data.type === 'NOTES_UPDATE') {
      sharedNotesArea.value = data.text;
      localStorage.setItem('shared_notes_content', data.text);
      notesSyncStatus.innerText = '🟢 Sincronizado por ela';

      if (!notesDrawer.classList.contains('open') && notesUnreadDot) {
        notesUnreadDot.classList.remove('hidden');
      }
    } else if (data.type === 'ROULETTE_OPTIONS_UPDATE') {
      rouletteOptionsInput.value = data.options;
    } else if (data.type === 'ROULETTE_RESULT') {
      rouletteResultDisplay.innerText = `🎉 Resultado: ${data.result}!`;
    } else if (data.type === 'BUCKET_UPDATE') {
      bucketData = data.bucket;
      localStorage.setItem('shared_bucket_list', JSON.stringify(bucketData));
      renderBucketUI();
    }
  });
}

// CORREÇÃO: mesma proteção contra sinalização caída ao (re)iniciar a
// chamada principal — evita ficar tentando indefinidamente sem nunca
// reconectar a sinalização de verdade.
function initiateCall() {
  if (peer.disconnected) {
    console.warn('Peer desconectado ao iniciar chamada — reconectando antes de tentar de novo...');
    attemptPeerReconnect();
    return;
  }

  const activeStream = getMainCallStream();
  if (mainCall) { try { mainCall.close(); } catch(e) {} }
  const conn = peer.connect(targetPeerId);
  setupDataConnection(conn);
  mainCall = peer.call(targetPeerId, activeStream, { metadata: { type: 'main' } });
  attachMainCallEvents(mainCall);
}

peer.on('open', () => {
  if (statusBadge) statusBadge.innerText = isHost ? 'Aguardando minha vida...' : 'Conectando ao cantinho...';
  startMicrophone().then(() => {
    if (!isHost) {
      if (connectTimer) clearInterval(connectTimer);
      connectTimer = setInterval(() => {
        if (!mainCall || !mainCall.open) initiateCall();
        else clearInterval(connectTimer);
      }, 2500);
    }
  });
});

peer.on('connection', conn => setupDataConnection(conn));

peer.on('call', call => {
  if (call.metadata && call.metadata.type === 'screen') {
    call.answer();
    call.on('stream', stream => {
      if (stageEl) stageEl.classList.remove('camera-focus-mode');
      mainStream.srcObject = stream;
      mainStream.muted = false;
      mainStream.volume = Math.min(screenVolumeMultiplier, 1.0);
      mainStream.play().catch(() => {});
      const hasAudio = stream.getAudioTracks().length > 0;
      if (containerScreenVolume) containerScreenVolume.classList.toggle('hidden', !hasAudio);
      updateAutohideState();
    });
  } else {
    if (connectTimer) clearInterval(connectTimer);
    mainCall = call;
    const activeStream = getMainCallStream();
    call.answer(activeStream);
    attachMainCallEvents(call);
  }
});

function attachMainCallEvents(call) {
  if (!call) return;
  call.on('stream', stream => {
    if (connectTimer) clearInterval(connectTimer);

    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();

    if (audioTracks.length > 0) {
      const voiceStream = new MediaStream([audioTracks[0]]);
      remoteVoiceAudio.srcObject = voiceStream;
      remoteVoiceAudio.muted = false;
      remoteVoiceAudio.volume = Math.min(micVolumeMultiplier, 1.0);
      remoteVoiceAudio.play().catch(() => {});
      setupSpeakingDetector(voiceStream, false);
    }

    if (videoTracks.length > 0) {
      remoteCam.srcObject = new MediaStream([videoTracks[0]]);
      remoteCam.play().catch(() => {});
    }

    if (statusBadge) {
      statusBadge.innerText = '🟢 Conectadas';
      statusBadge.classList.add('connected');
    }
    startCallTimer();
  });

  call.on('close', () => {
    if (statusBadge) {
      statusBadge.innerText = 'Reconectando...';
      statusBadge.classList.remove('connected');
    }
    stopCallTimer();
    if (!isHost) {
      if (connectTimer) clearInterval(connectTimer);
      connectTimer = setInterval(() => {
        if (!mainCall || !mainCall.open) initiateCall();
        else clearInterval(connectTimer);
      }, 2500);
    }
  });
}

// Perfil
let tempAvatarBase64 = myProfile.avatar;
function openProfile() {
  profileNameInput.value = myProfile.name;
  if (profileStatusInput) profileStatusInput.value = myProfile.status || '';
  profileDateInput.value = myProfile.startDate;
  profilePreviewImg.src = myProfile.avatar || defaultAvatar;
  tempAvatarBase64 = myProfile.avatar;
  updateBindingButtonLabel();
  profileModal.classList.add('active');
}
btnOpenProfile.addEventListener('click', openProfile);
btnCloseProfile.addEventListener('click', () => profileModal.classList.remove('active'));

profileFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 200;
      let w = img.width, h = img.height;
      if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
      else if (h > MAX) { w *= MAX / h; h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      tempAvatarBase64 = canvas.toDataURL('image/jpeg', 0.8);
      profilePreviewImg.src = tempAvatarBase64;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

btnSaveProfile.addEventListener('click', () => {
  myProfile.name = profileNameInput.value.trim() || myProfile.name;
  myProfile.status = profileStatusInput ? (profileStatusInput.value.trim() || '🟢 Disponível') : '🟢 Disponível';
  myProfile.startDate = profileDateInput.value || myProfile.startDate;
  myProfile.avatar = tempAvatarBase64;

  localStorage.setItem('profile_name', myProfile.name);
  localStorage.setItem('profile_status', myProfile.status);
  localStorage.setItem('profile_start_date', myProfile.startDate);
  localStorage.setItem('profile_avatar', myProfile.avatar);

  updateProfileUI();
  updateLoveCounter();
  profileModal.classList.remove('active');
  sendDataMessage({ type: 'PROFILE_UPDATE', profile: myProfile });
});

document.getElementById('btn-hangup').addEventListener('click', () => {
  if (mainCall) mainCall.close();
  window.location.reload();
});

loadDevices();
renderBucketUI();