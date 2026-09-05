// Global State
let questions = [];
let activeTab = 'pending'; // 'pending' or 'answered'
let soundEnabled = false;
let audioContext = null;

// Clock Brasília (America/Sao_Paulo UTC-3) and Uptime Counter
const startTime = Date.now();
const clockBrasiliaEl = document.getElementById('clock-brasilia');

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

  // 3. Update all active countdown timers live every second
  updateAllCountdowns();
}, 1000);

// DOM Elements
const connectionBadge = document.getElementById('connection-badge');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');
const soundToggle = document.getElementById('sound-toggle');
const soundIcon = document.getElementById('sound-icon');
const soundText = document.getElementById('sound-text');
const simBtn = document.getElementById('sim-btn');
const tabPending = document.getElementById('tab-pending');
const tabAnswered = document.getElementById('tab-answered');
const badgePendingCount = document.getElementById('badge-pending-count');
const badgeAnsweredCount = document.getElementById('badge-answered-count');
const statsPending = document.getElementById('stats-pending');
const statsAnswered = document.getElementById('stats-answered');
const statsUrgent = document.getElementById('stats-urgent');
const emptyState = document.getElementById('empty-state');
const questionsContainer = document.getElementById('questions-container');

// Audio Synthesizer using Web Audio API
function playChime() {
  if (!soundEnabled) return;
  
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    
    // First high note (Soft bell chime)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(830.61, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    // Second note (Harmonic tone)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.50, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.4);
    
    osc2.start(now + 0.08);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.error('Falha ao reproduzir áudio via Web Audio API:', e);
  }
}

// Sound Activation
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    audioContext.resume();
    
    soundIcon.className = 'fa-solid fa-volume-high text-emerald-400';
    soundText.textContent = 'Som Ativado';
    soundToggle.className = 'flex items-center gap-2 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/30 px-3.5 py-1.5 rounded-lg text-sm text-emerald-400 transition-all';
    
    playChime();
  } else {
    soundIcon.className = 'fa-solid fa-volume-xmark text-slate-500';
    soundText.textContent = 'Som Desativado';
    soundToggle.className = 'flex items-center gap-2 bg-brand-card hover:bg-slate-800 border border-brand-border px-3.5 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white transition-all';
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
      text: `Prazo esgotado (+${expiredMinutes}m)`,
      remainingSecs: 0,
      progressPercent: 100,
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse',
      barClass: 'bg-rose-500'
    };
  }

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const formattedTime = `${mins}m ${secs.toString().padStart(2, '0')}s restantes`;

  if (remainingMs < 10 * 60 * 1000) {
    // Menos de 10 minutos: Crítico / Vermelho pulsante
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
    // 10 a 30 minutos: Atenção / Amarelo
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
    // Mais de 30 minutos: Tranquilo / Verde
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
  let urgentCount = 0;

  cards.forEach(card => {
    const qId = card.getAttribute('data-question-id');
    const q = questions.find(item => item.id === qId);
    if (!q) return;

    if (q.status === 'pending') {
      const sla = getSlaInfo(q.receivedAt);
      if (sla.isCritical) urgentCount++;

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

  if (statsUrgent) {
    statsUrgent.textContent = urgentCount;
  }
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
          console.log(`[REALTIME] 🔔 ${brandNew.length} nova(s) pergunta(s) recebida(s)! Tocando alerta sonoro...`);
          playChime();
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
    console.error('Erro ao buscar perguntas:', err);
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
      console.error('Falha ao atualizar status da pergunta.');
    }
  } catch (err) {
    console.error('Erro de rede ao atualizar status:', err);
  }
}

// Render Dashboard UI
function renderUI() {
  const pendingList = questions.filter(q => q.status === 'pending');
  const answeredList = questions.filter(q => q.status === 'answered');

  statsPending.textContent = pendingList.length;
  statsAnswered.textContent = answeredList.length;
  badgePendingCount.textContent = pendingList.length;
  badgeAnsweredCount.textContent = answeredList.length;

  // Compute urgent count (< 15 min or expired)
  const urgentList = pendingList.filter(q => {
    const sla = getSlaInfo(q.receivedAt);
    return sla.isCritical;
  });
  if (statsUrgent) statsUrgent.textContent = urgentList.length;

  // Filter list by active tab
  const filtered = questions.filter(q => q.status === activeTab);

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    questionsContainer.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  questionsContainer.classList.remove('hidden');
  questionsContainer.innerHTML = '';

  filtered.forEach(q => {
    const card = document.createElement('div');
    card.setAttribute('data-question-id', q.id);
    card.className = 'bg-brand-card/90 border border-brand-border hover:border-slate-700/80 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden shadow-lg';
    
    // Platform styles
    const isGGMax = q.platform.toLowerCase() === 'ggmax';
    const platformLabel = isGGMax ? 'GGMAX' : 'GameMarket';
    const badgeColorClass = isGGMax 
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

    const isChecked = q.status === 'answered';
    const deadlineBrasilia = formatBrasiliaDeadline(q.receivedAt);
    const sla = getSlaInfo(q.receivedAt);

    card.innerHTML = `
      <div class="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${isGGMax ? 'from-amber-500/0 via-amber-500/50 to-amber-500/0' : 'from-emerald-500/0 via-emerald-500/50 to-emerald-500/0'} opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div>
        <!-- Top header details -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs px-2.5 py-1 rounded-full border font-bold ${badgeColorClass}">
            ${platformLabel}
          </span>
          <span class="text-xs text-slate-400 flex items-center gap-1.5" data-time="${q.receivedAt}">
            <i class="fa-regular fa-clock"></i>
            ${getRelativeTime(q.receivedAt)}
          </span>
        </div>

        <!-- 1-Hour SLA Countdown Section (Only for pending) -->
        ${!isChecked ? `
        <div class="mb-4 bg-slate-950/60 border border-brand-border/80 rounded-lg p-3">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="text-[11px] text-slate-400 flex items-center gap-1">
              <i class="fa-solid fa-stopwatch text-emerald-400"></i>
              <span>Prazo até: <strong class="text-slate-200">${deadlineBrasilia} (Brasília)</strong></span>
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
        <a href="${q.answerLink}" target="_blank" class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-emerald-500/10 text-xs transition-all tracking-wider uppercase">
          <i class="fa-solid fa-reply"></i>
          RESPONDER PERGUNTA
        </a>
      </div>
    `;

    questionsContainer.appendChild(card);
  });
}

// Global hook for inline checkbox clicks
window.handleCheckClick = (id, currentStatus) => {
  toggleQuestionStatus(id, currentStatus);
};

// Global hook for deleting an individual question
window.handleDeleteClick = async (id) => {
  if (!confirm('Deseja excluir esta pergunta?')) return;
  try {
    const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      questions = questions.filter(q => q.id !== id);
      renderUI();
    }
  } catch (err) {
    console.error('Erro ao excluir pergunta:', err);
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
tabPending.addEventListener('click', () => {
  activeTab = 'pending';
  tabPending.className = 'px-5 py-3 border-b-2 border-emerald-500 text-emerald-400 font-semibold text-sm transition-all flex items-center gap-2';
  tabAnswered.className = 'px-5 py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all flex items-center gap-2';
  renderUI();
});

tabAnswered.addEventListener('click', () => {
  activeTab = 'answered';
  tabAnswered.className = 'px-5 py-3 border-b-2 border-emerald-500 text-emerald-400 font-semibold text-sm transition-all flex items-center gap-2';
  tabPending.className = 'px-5 py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all flex items-center gap-2';
  renderUI();
});

// SSE Connection Listener
function connectSSE() {
  const source = new EventSource('/api/questions/stream');

  source.onopen = () => {
    connectionBadge.className = 'flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold';
    connectionDot.className = 'w-2 h-2 rounded-full bg-emerald-500 pulse-dot';
    connectionText.textContent = 'Conectado em tempo real';
  };

  source.onerror = () => {
    connectionBadge.className = 'flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1.5 rounded-full text-xs font-semibold';
    connectionDot.className = 'w-2 h-2 rounded-full bg-rose-500 pulse-dot';
    connectionText.textContent = 'Desconectado';
  };

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'question_new') {
        questions.unshift(data.question);
        renderUI();
        playChime();
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

// Simulator Trigger (Makes mock POST call to Express API)
simBtn.addEventListener('click', async () => {
  const mockId = 'mock-' + Math.floor(100000 + Math.random() * 900000);
  const platforms = ['ggmax', 'gamemarket'];
  const plat = platforms[Math.floor(Math.random() * platforms.length)];
  const names = ['Guilherme Rossi', 'Ana Paula', 'Carlos Eduardo', 'Patrícia Lima', 'Renato Garcia'];
  const name = names[Math.floor(Math.random() * names.length)];
  const items = [
    '[MAIS BARATO] GEMINI 3 PRO + 1K FLOW+ 5TB + VEO 3.1 + ANTIGRAVITY - 30 DIAS',
    'Conta Valorant Imortal 3 + Vandal Sublime e Skins Exclusivas',
    'Saldo de R$ 100 para compras in-game GGMAX',
    'Chave de ativação Steam - GTA V Premium Edition',
    'Boost do Ferro ao Diamante League of Legends'
  ];
  const item = items[Math.floor(Math.random() * items.length)];

  // Randomize arrival time to demonstrate SLA countdown colors
  const timeOffsets = [0, 20 * 60 * 1000, 48 * 60 * 1000, 65 * 60 * 1000];
  const offset = timeOffsets[Math.floor(Math.random() * timeOffsets.length)];
  const receivedAt = new Date(Date.now() - offset).toISOString();

  const mockPayload = {
    id: mockId,
    platform: plat,
    receivedAt,
    buyerName: name,
    announcementName: item,
    announcementLink: `https://${plat}.com.br/anuncio/detalhes-${mockId}`,
    answerLink: plat === 'ggmax' ? 'https://ggmax.com.br/account/received-questions' : `https://${plat}.com.br/painel/perguntas`
  };

  try {
    await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload)
    });
  } catch (err) {
    console.error('Falha de rede ao simular pergunta:', err);
  }
});

// Clear All Questions and re-trigger bot check
const clearAllBtn = document.getElementById('clear-all-btn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', async () => {
    const ok = confirm('Deseja apagar todas as perguntas e fazer o bot varrer a sua caixa de entrada do Gmail novamente?');
    if (!ok) return;

    try {
      const res = await fetch('/api/questions', { method: 'DELETE' });
      if (res.ok) {
        questions = [];
        renderUI();
        alert('Todas as perguntas foram limpas! O bot já está relendo o seu e-mail da GGMAX e GameMarket...');
        // Força sincronização após 3 segundos
        setTimeout(() => fetchQuestions(true), 3000);
      }
    } catch (err) {
      console.error('Erro ao limpar perguntas:', err);
    }
  });
}

// App Startup
fetchQuestions();
connectSSE();
