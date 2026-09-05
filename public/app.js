// Global State
let questions = [];
let activeTab = 'questions'; // 'questions', 'mediations', or 'resolved'
let soundEnabled = localStorage.getItem('fastdash_sound') !== 'false'; // ATIVADO POR PADRÃO!
let audioContext = null;

// Audio Unlock: desbloqueia AudioContext e SpeechSynthesis na primeira interação do usuário
function unlockAudio() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (e) {}
}

window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// Clock Brasília (America/Sao_Paulo UTC-3) and Uptime Counter
const startTime = Date.now();
const clockBrasiliaEl = document.getElementById('clock-brasilia');
const nightBadgeEl = document.getElementById('night-badge');
const nightTextEl = document.getElementById('night-text');

// Helper to test if date or current time is in the Brasília Night Protection Window (23:00 to 06:00)
function isBrasiliaNightWindow(dateIso = null) {
  const date = dateIso ? new Date(dateIso) : new Date();
  const brasiliaHour = parseInt(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false
  }).format(date), 10);
  return brasiliaHour >= 23 || brasiliaHour < 6;
}

setInterval(() => {
  // 1. Live Brasília Clock
  if (clockBrasiliaEl) {
    const nowBrasilia = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
    clockBrasiliaEl.textContent = nowBrasilia;
  }

  // 2. Dashboard Uptime
  const elapsedMs = Date.now() - startTime;
  const secs = Math.floor((elapsedMs / 1000) % 60).toString().padStart(2, '0');
  const mins = Math.floor((elapsedMs / (1000 * 60)) % 60).toString().padStart(2, '0');
  const hours = Math.floor((elapsedMs / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
  const runtimeEl = document.getElementById('dashboard-runtime');
  if (runtimeEl) runtimeEl.textContent = `${hours}:${mins}:${secs}`;

  // 3. Update Night Window Status
  if (nightTextEl && nightBadgeEl) {
    const isNight = isBrasiliaNightWindow();
    if (isNight) {
      nightTextEl.textContent = 'Janela Noturna (Sem perda de pontos)';
      nightBadgeEl.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse';
    } else {
      nightTextEl.textContent = 'Horário Comercial (SLA 1h)';
      nightBadgeEl.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700';
    }
  }

  // 4. Update all active countdown timers live every second
  updateAllCountdowns();
}, 1000);

// DOM Elements
const connectionBadge = document.getElementById('connection-badge');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');
const soundToggle = document.getElementById('sound-toggle');
const soundIcon = document.getElementById('sound-icon');
const soundText = document.getElementById('sound-text');

// Tabs
const tabQuestions = document.getElementById('tab-questions');
const tabMediations = document.getElementById('tab-mediations');
const tabResolved = document.getElementById('tab-resolved');

// Badges
const badgeQuestionsCount = document.getElementById('badge-questions-count');
const badgeMediationsCount = document.getElementById('badge-mediations-count');
const badgeResolvedCount = document.getElementById('badge-resolved-count');

// Stats Cards
const statsPending = document.getElementById('stats-pending');
const statsMediations = document.getElementById('stats-mediations');
const statsAnswered = document.getElementById('stats-answered');
const statsCardMediations = document.getElementById('stats-card-mediations');

// Containers
const emptyState = document.getElementById('empty-state');
const emptyStateTitle = document.getElementById('empty-state-title');
const emptyStateDesc = document.getElementById('empty-state-desc');
const questionsContainer = document.getElementById('questions-container');

// Sound UI state synchronizer
function updateSoundUI() {
  if (soundEnabled) {
    if (soundIcon) soundIcon.className = 'fa-solid fa-volume-high text-emerald-400';
    if (soundText) soundText.textContent = 'Som Ativado';
    if (soundToggle) soundToggle.className = 'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-950/30 hover:bg-emerald-950/50 active:scale-95 border border-emerald-500/30 px-3 py-2 sm:px-3.5 sm:py-1.5 rounded-lg text-xs sm:text-sm text-emerald-400 transition-all';
  } else {
    if (soundIcon) soundIcon.className = 'fa-solid fa-volume-xmark text-slate-500';
    if (soundText) soundText.textContent = 'Som Desativado';
    if (soundToggle) soundToggle.className = 'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-brand-card hover:bg-slate-800 active:scale-95 border border-brand-border px-3 py-2 sm:px-3.5 sm:py-1.5 rounded-lg text-xs sm:text-sm text-slate-300 hover:text-white transition-all';
  }
}

// Inicializa visual do botão de som conforme estado salvo
updateSoundUI();

// Audio & Voice Alert: Fala em voz alta conforme o tipo de evento
function playAlertSound(customText = 'Pergunta realizada!') {
  if (!soundEnabled) return;

  unlockAudio();

  // 1. Chime inicial sutil
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    // Alerta mais urgente se for mediação
    const isMediationAlert = customText.toLowerCase().includes('mediação');
    osc.type = isMediationAlert ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isMediationAlert ? 1046.5 : 880, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isMediationAlert ? 0.4 : 0.25));
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + (isMediationAlert ? 0.4 : 0.25));
  } catch (e) {}

  // 2. Voz em português brasileiro
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(customText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR' || v.lang.startsWith('pt'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Erro no sintetizador de voz:', err);
    }
  }
}

// Sound Activation Toggle
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('fastdash_sound', soundEnabled ? 'true' : 'false');
  updateSoundUI();

  if (soundEnabled) {
    unlockAudio();
    playAlertSound('Alerta sonoro ativado!');
  }
});

// Relative Time calculation in Portuguese
function getRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  
  if (diffMs < 0) return 'agora mesmo';
  
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 10) return 'agora mesmo';
  if (diffSecs < 60) return `há ${diffSecs}s`;
  
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins === 1) return 'há 1 min';
  if (diffMins < 60) return `há ${diffMins} min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'há 1h';
  if (diffHours < 24) return `há ${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
}

// Format ISO date to Brasília Timezone (HH:mm:ss)
function formatBrasiliaMadeTime(receivedAtIso) {
  const receivedDate = new Date(receivedAtIso);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(receivedDate);
}

// Format ISO date to Brasília Timezone (HH:mm)
function formatBrasiliaDeadline(receivedAtIso) {
  const receivedDate = new Date(receivedAtIso);
  const deadlineDate = new Date(receivedDate.getTime() + 60 * 60 * 1000); // 1 hora de prazo
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(deadlineDate);
}

// Calculate Remaining Time & SLA Info
function getSlaInfo(receivedAtIso) {
  const receivedDate = new Date(receivedAtIso);
  const deadlineMs = receivedDate.getTime() + 60 * 60 * 1000;
  const nowMs = Date.now();
  const remainingMs = deadlineMs - nowMs;

  const totalSlaMs = 60 * 60 * 1000;
  const elapsedMs = nowMs - receivedDate.getTime();
  const progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalSlaMs) * 100));

  if (remainingMs <= 0) {
    const expiredMinutes = Math.floor(Math.abs(remainingMs) / 60000);
    return {
      isExpired: true,
      isCritical: true,
      text: `Prazo 1h esgotado (+${expiredMinutes}m)`,
      remainingSecs: 0,
      progressPercent: 100,
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse',
      barClass: 'bg-rose-500'
    };
  }

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const formattedTime = `${mins}m ${secs.toString().padStart(2, '0')}s restantes`;

  if (remainingMs < 15 * 60 * 1000) {
    return {
      isExpired: false,
      isCritical: true,
      text: formattedTime,
      remainingSecs: Math.floor(remainingMs / 1000),
      progressPercent,
      badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse',
      barClass: 'bg-rose-500'
    };
  } else if (remainingMs < 30 * 60 * 1000) {
    return {
      isExpired: false,
      isCritical: false,
      text: formattedTime,
      remainingSecs: Math.floor(remainingMs / 1000),
      progressPercent,
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      barClass: 'bg-amber-400'
    };
  } else {
    return {
      isExpired: false,
      isCritical: false,
      text: formattedTime,
      remainingSecs: Math.floor(remainingMs / 1000),
      progressPercent,
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      barClass: 'bg-emerald-500'
    };
  }
}

// Live Update for all card countdowns without destroying DOM elements
function updateAllCountdowns() {
  const cards = document.querySelectorAll('[data-question-id]');

  cards.forEach(card => {
    const qId = card.getAttribute('data-question-id');
    const q = questions.find(item => item.id === qId);
    if (!q) return;

    if (q.status === 'pending' && q.type !== 'mediation') {
      const sla = getSlaInfo(q.receivedAt);

      const timerText = card.querySelector('[data-sla-text]');
      const timerBadge = card.querySelector('[data-sla-badge]');
      const progressBar = card.querySelector('[data-sla-progress]');

      if (timerText) timerText.textContent = sla.text;
      if (timerBadge) timerBadge.className = `text-[11px] px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1.5 ${sla.badgeClass}`;
      if (progressBar) {
        progressBar.style.width = `${sla.progressPercent}%`;
        progressBar.className = `h-full rounded-full transition-all duration-500 ${sla.barClass}`;
      }
    }
  });
}

// Fetch Initial Data & Realtime Sync (Sem precisar de F5!)
async function fetchQuestions(isBackgroundSync = false) {
  try {
    const res = await fetch('/api/questions');
    if (res.ok) {
      const updatedList = await res.json();

      if (isBackgroundSync && questions.length > 0) {
        const existingIds = new Set(questions.map(q => q.id));
        const brandNew = updatedList.filter(q => !existingIds.has(q.id) && q.status === 'pending');

        if (brandNew.length > 0) {
          const hasMediation = brandNew.some(item => item.type === 'mediation');
          if (hasMediation) {
            console.log('[REALTIME] 🚨 Nova mediação detectada! Falando alerta sonoro prioritário...');
            playAlertSound('Atenção: Nova mediação iniciada!');
          } else {
            console.log('[REALTIME] 🔔 Nova pergunta detectada! Falando alerta...');
            playAlertSound('Pergunta realizada!');
          }
        }
      }

      // Se houver qualquer alteração na lista, renderiza imediatamente
      const currentJson = JSON.stringify(questions);
      const newJson = JSON.stringify(updatedList);
      if (currentJson !== newJson) {
        questions = updatedList;
        renderUI();
      }
    }
  } catch (err) {
    console.error('Erro ao buscar itens:', err);
  }
}

// Sincronização contínua a cada 3 segundos (garante que caia sozinho na tela)
setInterval(() => {
  fetchQuestions(true);
}, 3000);

// Send Status Toggle (PATCH)
async function toggleQuestionStatus(id, currentStatus) {
  const newStatus = currentStatus === 'pending' ? 'answered' : 'pending';
  try {
    const response = await fetch(`/api/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!response.ok) {
      console.error('Falha ao atualizar status.');
    }
  } catch (err) {
    console.error('Erro de rede ao atualizar status:', err);
  }
}

// Render Dashboard UI
function renderUI() {
  const pendingQuestions = questions.filter(q => q.type !== 'mediation' && q.status === 'pending');
  const pendingMediations = questions.filter(q => q.type === 'mediation' && q.status === 'pending');
  const resolvedItems = questions.filter(q => q.status === 'answered');

  // Atualiza contadores numéricos
  if (statsPending) statsPending.textContent = pendingQuestions.length;
  if (statsMediations) statsMediations.textContent = pendingMediations.length;
  if (statsAnswered) statsAnswered.textContent = resolvedItems.length;

  if (badgeQuestionsCount) badgeQuestionsCount.textContent = pendingQuestions.length;
  if (badgeMediationsCount) badgeMediationsCount.textContent = pendingMediations.length;
  if (badgeResolvedCount) badgeResolvedCount.textContent = resolvedItems.length;

  // Destaque visual caso haja mediação aberta
  if (statsCardMediations) {
    if (pendingMediations.length > 0) {
      statsCardMediations.className = 'bg-rose-950/40 border border-rose-500/50 rounded-xl p-3.5 sm:p-5 flex items-center justify-between shadow-lg shadow-rose-500/20 animate-pulse transition-all';
    } else {
      statsCardMediations.className = 'bg-brand-card border border-brand-border rounded-xl p-3.5 sm:p-5 flex items-center justify-between transition-all';
    }
  }

  // Define lista filtrada conforme a aba ativa
  let filtered = [];
  if (activeTab === 'questions') {
    filtered = pendingQuestions;
  } else if (activeTab === 'mediations') {
    filtered = pendingMediations;
  } else if (activeTab === 'resolved') {
    filtered = resolvedItems;
  }

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    questionsContainer.classList.add('hidden');

    if (activeTab === 'questions') {
      emptyStateTitle.textContent = 'Nenhuma pergunta pendente';
      emptyStateDesc.textContent = 'Novas perguntas da GGMAX ou GameMarket aparecerão aqui automaticamente com alarme sonoro.';
    } else if (activeTab === 'mediations') {
      emptyStateTitle.textContent = 'Nenhuma mediação aberta! 🏆';
      emptyStateDesc.textContent = 'Excelente trabalho! Você não possui nenhuma intervenção ou mediação em aberto no momento.';
    } else {
      emptyStateTitle.textContent = 'Nenhum item resolvido no histórico';
      emptyStateDesc.textContent = 'Perguntas e mediações marcadas como resolvidas serão armazenadas aqui.';
    }
    return;
  }

  emptyState.classList.add('hidden');
  questionsContainer.classList.remove('hidden');
  questionsContainer.innerHTML = '';

  filtered.forEach(q => {
    const card = document.createElement('div');
    card.setAttribute('data-question-id', q.id);
    const isMediation = q.type === 'mediation';
    const isChecked = q.status === 'answered';

    if (isMediation) {
      // ==========================================
      // CARD DE MEDIAÇÃO / INTERVENÇÃO
      // ==========================================
      const isGM = q.platform.toLowerCase() === 'gamemarket';
      const platformLabel = isGM ? 'GameMarket' : 'GGMAX';
      const platformBadge = isGM
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

      const orderIdDisplay = q.orderId || 'S/N';
      const isNightReceived = isBrasiliaNightWindow(q.receivedAt);

      card.className = 'bg-brand-card/95 border-2 border-rose-500/40 hover:border-rose-500 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden shadow-xl shadow-rose-950/20';

      card.innerHTML = `
        <div class="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600"></div>

        <div>
          <!-- Top header with Urgent Mediation Badge -->
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] px-2.5 py-0.5 rounded-full border font-extrabold bg-rose-500/20 text-rose-300 border-rose-500/40 flex items-center gap-1 animate-pulse">
                <i class="fa-solid fa-triangle-exclamation text-rose-400"></i>
                MEDIAÇÃO ABERTA
              </span>
              <span class="text-[11px] px-2 py-0.5 rounded-md border font-bold ${platformBadge}">
                ${platformLabel}
              </span>
            </div>
            <div class="text-right">
              <div class="text-xs font-bold text-slate-200 flex items-center justify-end gap-1.5">
                <i class="fa-regular fa-clock text-rose-400"></i>
                Aberta às ${formatBrasiliaMadeTime(q.receivedAt)}
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5" data-time="${q.receivedAt}">
                (${getRelativeTime(q.receivedAt)})
              </div>
            </div>
          </div>

          <!-- Pedido / Order ID Banner with Fast Copy -->
          <div class="mb-3 bg-rose-950/40 border border-rose-500/30 rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center font-bold text-xs sm:text-sm">
                <i class="fa-solid fa-receipt"></i>
              </div>
              <div>
                <span class="text-[9px] sm:text-[10px] text-slate-400 uppercase font-semibold block">Identificador do Pedido</span>
                <span class="text-xs sm:text-sm font-black text-white font-mono tracking-wider">${orderIdDisplay}</span>
              </div>
            </div>
            <button onclick="window.copyToClipboard('${orderIdDisplay}')" class="text-[10px] sm:text-xs bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white px-2 sm:px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1 transition-all" title="Copiar código do pedido">
              <i class="fa-regular fa-copy"></i>
              <span>Copiar</span>
            </button>
          </div>

          <!-- Night Window Badge if applicable -->
          ${isNightReceived ? `
          <div class="mb-3 bg-indigo-950/30 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-[11px] text-indigo-300 flex items-center gap-1.5">
            <i class="fa-solid fa-moon text-indigo-400"></i>
            <span>Recebida na Janela Noturna (23h-06h) · Não penaliza pontuação</span>
          </div>
          ` : ''}

          <!-- Details & Prestige GM Alert -->
          <div class="mb-4">
            <div class="text-xs text-slate-400 font-medium">Produto / Transação:</div>
            <div class="text-xs sm:text-sm font-bold text-slate-100 line-clamp-2 mt-0.5 mb-2">
              ${q.announcementName}
            </div>

            <div class="text-xs text-slate-400 font-medium">Comprador:</div>
            <div class="text-xs font-semibold text-slate-300 mb-2.5 flex items-center gap-1.5">
              <i class="fa-solid fa-user text-[11px] text-slate-500"></i>
              ${q.buyerName}
            </div>

            <div class="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
              <i class="fa-solid fa-shield-cat text-amber-400 mt-0.5"></i>
              <span><strong>Meta Prestige GM:</strong> Mediações perdidas devem ficar abaixo de 3% para garantir o desconto de 10% nas taxas!</span>
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-3 border-t border-brand-border/60 flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-slate-200">
              <input type="checkbox" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded border-brand-border text-rose-600 focus:ring-rose-500 bg-slate-900 border" onclick="event.preventDefault(); window.handleCheckClick('${q.id}', '${q.status}')">
              <span>${isChecked ? 'Reabrir Mediação' : 'Marcar como Resolvida'}</span>
            </label>
            <button onclick="window.handleDeleteClick('${q.id}')" class="text-xs text-rose-400/60 hover:text-rose-400 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/10" title="Excluir mediação">
              <i class="fa-regular fa-trash-can"></i>
              <span>Excluir</span>
            </button>
          </div>

          <!-- Big CTA Button for Mediation -->
          <a href="${q.answerLink}" target="_blank" class="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-98 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-rose-900/40 text-xs sm:text-sm transition-all tracking-wider uppercase select-none">
            <i class="fa-solid fa-scale-balanced"></i>
            RESOLVER MEDIAÇÃO NO PEDIDO
          </a>
        </div>
      `;

    } else {
      // ==========================================
      // CARD DE PERGUNTA PADRÃO
      // ==========================================
      const isGGMax = q.platform.toLowerCase() === 'ggmax';
      const platformLabel = isGGMax ? 'GGMAX' : 'GameMarket';
      const badgeColorClass = isGGMax 
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

      const deadlineBrasilia = formatBrasiliaDeadline(q.receivedAt);
      const sla = getSlaInfo(q.receivedAt);
      const isNightReceived = isBrasiliaNightWindow(q.receivedAt);

      card.className = 'bg-brand-card/90 border border-brand-border hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden shadow-lg';

      card.innerHTML = `
        <div class="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${isGGMax ? 'from-amber-500/0 via-amber-500/50 to-amber-500/0' : 'from-emerald-500/0 via-emerald-500/50 to-emerald-500/0'} opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <div>
          <!-- Top header details -->
          <div class="flex items-start justify-between gap-2 mb-3">
            <span class="text-xs px-2.5 py-1 rounded-full border font-bold ${badgeColorClass}">
              ${platformLabel}
            </span>
            <div class="text-right">
              <div class="text-xs font-bold text-slate-200 flex items-center justify-end gap-1.5">
                <i class="fa-regular fa-clock text-emerald-400"></i>
                Feita às ${formatBrasiliaMadeTime(q.receivedAt)}
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5" data-time="${q.receivedAt}">
                (${getRelativeTime(q.receivedAt)})
              </div>
            </div>
          </div>

          <!-- Night Window Badge if applicable -->
          ${isNightReceived ? `
          <div class="mb-3 bg-indigo-950/30 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-[11px] text-indigo-300 flex items-center gap-1.5">
            <i class="fa-solid fa-moon text-indigo-400"></i>
            <span>Janela Noturna (23h-06h) · Sem penalidade</span>
          </div>
          ` : ''}

          <!-- 1-Hour SLA Countdown Section (Only for pending) -->
          ${!isChecked ? `
          <div class="mb-4 bg-slate-950/60 border border-brand-border/80 rounded-lg p-3">
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <div class="text-[11px] text-slate-400 flex items-center gap-1">
                <i class="fa-solid fa-stopwatch text-emerald-400"></i>
                <span>Prazo 1h: <strong class="text-slate-200">${deadlineBrasilia} (Brasília)</strong></span>
              </div>
              <div data-sla-badge class="text-[11px] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 ${sla.badgeClass}">
                <i class="fa-solid fa-hourglass"></i>
                <span data-sla-text>${sla.text}</span>
              </div>
            </div>
            <!-- Progress Bar -->
            <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div data-sla-progress class="h-full rounded-full transition-all duration-500 ${sla.barClass}" style="width: ${sla.progressPercent}%"></div>
            </div>
            <div class="mt-1.5 text-[10px] text-slate-500 flex items-center justify-between">
              <span>⚡ Resposta &lt; 1h: +3 pts Prestige GM</span>
              <span>Limite seguro: 3h</span>
            </div>
          </div>
          ` : `
          <div class="mb-4 bg-emerald-950/20 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-400 flex items-center gap-2">
            <i class="fa-solid fa-circle-check"></i>
            <span>Respondida e arquivada</span>
          </div>
          `}

          <!-- Buyer and Item -->
          <div class="mb-5">
            <div class="text-xs text-slate-400 font-medium">Comprador:</div>
            <div class="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-user text-xs text-slate-500"></i>
              ${q.buyerName}
            </div>
            <div class="text-xs text-slate-400 font-medium">Anúncio:</div>
            <a href="${q.announcementLink}" target="_blank" class="text-sm font-semibold text-slate-200 hover:text-emerald-400 transition-colors line-clamp-2 mt-0.5 inline-flex items-center gap-1 underline decoration-slate-600 hover:decoration-emerald-500">
              ${q.announcementName}
              <i class="fa-solid fa-up-right-from-square text-[10px] opacity-60"></i>
            </a>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-4 border-t border-brand-border/60 flex flex-col gap-3">
          <!-- Mark as answered checkbox row & Delete button -->
          <div class="flex items-center justify-between gap-2">
            <label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-slate-200">
              <input type="checkbox" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded border-brand-border text-emerald-600 focus:ring-emerald-500 bg-slate-900 border" onclick="event.preventDefault(); window.handleCheckClick('${q.id}', '${q.status}')">
              <span>${isChecked ? 'Mover para Pendentes' : 'Marcar Respondida'}</span>
            </label>
            <button onclick="window.handleDeleteClick('${q.id}')" class="text-xs text-rose-400/60 hover:text-rose-400 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/10" title="Excluir esta pergunta">
              <i class="fa-regular fa-trash-can"></i>
              <span>Excluir</span>
            </button>
          </div>

          <!-- Big CTA Button -->
          <a href="${q.answerLink}" target="_blank" class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold py-3 sm:py-2.5 px-4 rounded-xl shadow-lg hover:shadow-emerald-500/10 text-xs sm:text-sm transition-all tracking-wider uppercase select-none">
            <i class="fa-solid fa-reply"></i>
            RESPONDER PERGUNTA
          </a>
        </div>
      `;
    }

    questionsContainer.appendChild(card);
  });
}

// Global hook for inline checkbox clicks
window.handleCheckClick = (id, currentStatus) => {
  toggleQuestionStatus(id, currentStatus);
};

// Global hook for copying text to clipboard
window.copyToClipboard = (text) => {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert(`Código ${text} copiado para a área de transferência!`);
  }).catch(() => {
    prompt('Copie o código do pedido:', text);
  });
};

// Global hook for deleting an individual item
window.handleDeleteClick = async (id) => {
  if (!confirm('Deseja excluir este item?')) return;
  try {
    const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      questions = questions.filter(q => q.id !== id);
      renderUI();
    }
  } catch (err) {
    console.error('Erro ao excluir item:', err);
  }
};

// Periodic relative time labels refresher
setInterval(() => {
  const timeLabels = document.querySelectorAll('[data-time]');
  timeLabels.forEach(el => {
    const iso = el.getAttribute('data-time');
    el.innerHTML = `<i class="fa-regular fa-clock"></i> ${getRelativeTime(iso)}`;
  });
}, 30000);

// Setup Tabs Navigation
function setTab(tabName) {
  activeTab = tabName;

  const activeClass = 'flex-1 sm:flex-initial px-3 sm:px-5 py-2.5 sm:py-3 border-b-2 border-emerald-500 text-emerald-400 font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap';
  const inactiveClass = 'flex-1 sm:flex-initial px-3 sm:px-5 py-2.5 sm:py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap';

  if (tabQuestions) tabQuestions.className = tabName === 'questions' ? activeClass : inactiveClass;
  if (tabMediations) tabMediations.className = tabName === 'mediations' ? activeClass : inactiveClass;
  if (tabResolved) tabResolved.className = tabName === 'resolved' ? activeClass : inactiveClass;

  renderUI();
}

if (tabQuestions) tabQuestions.addEventListener('click', () => setTab('questions'));
if (tabMediations) tabMediations.addEventListener('click', () => setTab('mediations'));
if (tabResolved) tabResolved.addEventListener('click', () => setTab('resolved'));

// Prestige GM Modal Logic
const prestigeModal = document.getElementById('prestige-modal');
const btnPrestigeModal = document.getElementById('btn-prestige-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnOkModal = document.getElementById('btn-ok-modal');

function openModal() {
  if (prestigeModal) prestigeModal.classList.remove('hidden');
}

function closeModal() {
  if (prestigeModal) prestigeModal.classList.add('hidden');
}

if (btnPrestigeModal) btnPrestigeModal.addEventListener('click', openModal);
if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
if (btnOkModal) btnOkModal.addEventListener('click', closeModal);

if (prestigeModal) {
  prestigeModal.addEventListener('click', (e) => {
    if (e.target === prestigeModal) closeModal();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// SSE Connection Listener
function connectSSE() {
  const source = new EventSource('/api/questions/stream');

  source.onopen = () => {
    connectionBadge.className = 'hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold';
    connectionDot.className = 'w-2 h-2 rounded-full bg-emerald-500 pulse-dot';
    connectionText.textContent = 'Conectado em tempo real';
  };

  source.onerror = () => {
    connectionBadge.className = 'hidden sm:flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1.5 rounded-full text-xs font-semibold';
    connectionDot.className = 'w-2 h-2 rounded-full bg-rose-500 pulse-dot';
    connectionText.textContent = 'Desconectado';
  };

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'question_new') {
        questions.unshift(data.question);
        renderUI();

        if (data.question.type === 'mediation') {
          playAlertSound('Atenção: Nova mediação iniciada!');
        } else {
          playAlertSound('Pergunta realizada!');
        }
      } else if (data.type === 'question_updated') {
        const index = questions.findIndex(q => q.id === data.question.id);
        if (index !== -1) {
          questions[index] = data.question;
        } else {
          questions.unshift(data.question);
        }
        renderUI();
      } else if (data.type === 'question_deleted') {
        questions = questions.filter(q => q.id !== data.id);
        renderUI();
      } else if (data.type === 'questions_cleared') {
        questions = [];
        renderUI();
      }
    } catch (e) {}
  };
}

// Clear All Items and re-trigger bot check
const clearAllBtn = document.getElementById('clear-all-btn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', async () => {
    const ok = confirm('Deseja apagar todos os itens e fazer o bot varrer a sua caixa de entrada do Gmail novamente?');
    if (!ok) return;

    try {
      const res = await fetch('/api/questions', { method: 'DELETE' });
      if (res.ok) {
        questions = [];
        renderUI();
        alert('Todos os itens foram limpos! O bot já está relendo o seu e-mail da GGMAX e GameMarket...');
        setTimeout(() => fetchQuestions(true), 3000);
      }
    } catch (err) {
      console.error('Erro ao limpar itens:', err);
    }
  });
}

// App Startup
fetchQuestions();
connectSSE();
