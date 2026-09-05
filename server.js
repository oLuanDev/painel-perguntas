import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { startBot, resetProcessedIds, forceMailboxCheck } from './email-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'questions.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

// Chaves VAPID estáticas para notificações Web Push no iPhone (iOS 16.4+) e navegadores
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BBeMmd1lvD5PXijeSESpZZwrYTC4HDDuOsljSFMKpgGVj6w9HhYVOSy14Zn8j9EP__4OPsGrCp6m2dpIpYwyRO0';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '65NuQk8UR_9xDAETOxlTLbb4OCT5gX8_NKcgWA683zE';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:vendashairuusstore@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Helper para ler inscrições push
async function readSubscriptions() {
  try {
    const data = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

// Helper para salvar inscrições push
async function writeSubscriptions(subs) {
  try {
    await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (e) {}
}

// Disparador de Notificação Push para todos os dispositivos (iPhone, PC, etc.)
async function sendPushToAll(payload) {
  const subs = await readSubscriptions();
  if (!subs || subs.length === 0) return;

  console.log(`[PUSH] Disparando notificação push para ${subs.length} dispositivo(s)...`);
  const validSubs = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      validSubs.push(sub);
    } catch (err) {
      console.warn('[PUSH] Falha ao enviar para inscrição:', err.statusCode || err.message);
      if (err.statusCode !== 410 && err.statusCode !== 404) {
        validSubs.push(sub);
      }
    }
  }

  if (validSubs.length !== subs.length) {
    await writeSubscriptions(validSubs);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE client connections list
let sseClients = [];

// Helper function to read questions from questions.json
async function readQuestions() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    // If the file doesn't exist or is invalid, return empty array
    return [];
  }
}

// Helper function to write questions to questions.json
async function writeQuestions(questions) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(questions, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write questions database:', error);
  }
}

// Broadcast updates to all connected SSE clients
function broadcast(eventData) {
  sseClients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch (err) {
      console.error('Error writing to client stream:', err);
    }
  });
}

// 1. GET /api/questions - Returns all questions ordered from newest to oldest
app.get('/api/questions', async (req, res) => {
  const questions = await readQuestions();
  // Sort questions: newest receivedAt first
  const sorted = questions.sort((a, b) => {
    return new Date(b.receivedAt) - new Date(a.receivedAt);
  });
  res.json(sorted);
});

// Helper to normalize announcement link for deduplication
function normalizeLink(link) {
  if (!link) return '';
  return link.replace(/[\]\)\>\s]+$/, '').trim().toLowerCase();
}

// 2. POST /api/questions - Add/Update a question or mediation with strict deduplication
app.post('/api/questions', async (req, res) => {
  const { id, platform, type, orderId, receivedAt, buyerName, announcementName, announcementLink, answerLink, description } = req.body;

  if (!id || !platform || !buyerName || !announcementName || !announcementLink || !answerLink) {
    return res.status(400).json({ error: 'Faltando campos obrigatórios no payload.' });
  }

  // Limpa caracteres indesejados como colchetes de markdown ] no final do link ou título
  const cleanAnnouncementLink = (announcementLink || '').replace(/[\]\)\>\s]+$/, '').trim();
  const cleanAnswerLink = (answerLink || '').replace(/[\]\)\>\s]+$/, '').trim();
  const cleanTitle = (announcementName || '').replace(/[\[\]\\]/g, '').trim();
  const itemType = type || 'question';

  const questions = await readQuestions();

  // DEDUPLICAÇÃO INTELIGENTE:
  // Se for mediação: deduplica por id OU por (platform + orderId) se pendente
  // Se for pergunta: deduplica por id OU por anúncio pendente
  const existingIndex = questions.findIndex(q => {
    if (q.id === id) return true;
    if (itemType === 'mediation' && q.type === 'mediation' && q.status === 'pending') {
      return (orderId && q.orderId && q.orderId.toUpperCase() === orderId.toUpperCase()) ||
             (normalizeLink(q.announcementLink) === normalizeLink(cleanAnnouncementLink));
    }
    if (itemType === 'question' && q.type !== 'mediation' && q.status === 'pending') {
      return normalizeLink(q.announcementLink) === normalizeLink(cleanAnnouncementLink);
    }
    return false;
  });

  const timestamp = receivedAt || new Date().toISOString();

  let questionObj;

  if (existingIndex !== -1) {
    // Atualiza o item existente sem duplicar na tela
    const existing = questions[existingIndex];
    questionObj = {
      ...existing,
      platform,
      type: itemType,
      orderId: orderId || existing.orderId || null,
      receivedAt: timestamp,
      buyerName,
      announcementName: cleanTitle,
      announcementLink: cleanAnnouncementLink,
      answerLink: cleanAnswerLink,
      description: description || existing.description || '',
      status: req.body.status || existing.status || 'pending'
    };
    questions[existingIndex] = questionObj;
  } else {
    // Novo item único
    questionObj = {
      id,
      platform,
      type: itemType,
      orderId: orderId || null,
      receivedAt: timestamp,
      buyerName,
      announcementName: cleanTitle,
      announcementLink: cleanAnnouncementLink,
      answerLink: cleanAnswerLink,
      description: description || '',
      status: req.body.status || 'pending'
    };
    questions.push(questionObj);
  }

  await writeQuestions(questions);

  broadcast({
    type: existingIndex !== -1 ? 'question_updated' : 'question_new',
    question: questionObj
  });

  // Dispara notificação push para o iPhone / todos os dispositivos inscritos
  if (existingIndex === -1) {
    if (itemType === 'mediation') {
      sendPushToAll({
        title: `🚨 MEDIAÇÃO: ${platform.toUpperCase()} (${orderId || 'Disputa'})`,
        body: `${cleanTitle}\nComprador solicitou intervenção! Responda agora para manter seu Selo Prestige GM.`,
        url: cleanAnswerLink,
        tag: `mediation-${questionObj.id}`
      }).catch(err => console.error('[PUSH] Erro ao disparar push de mediação:', err.message));
    } else {
      sendPushToAll({
        title: `❓ PERGUNTA: ${platform.toUpperCase()}`,
        body: `${cleanTitle}\nResponda em até 1h para garantir o bônus diário (+3 pts)!`,
        url: cleanAnswerLink,
        tag: `question-${questionObj.id}`
      }).catch(err => console.error('[PUSH] Erro ao disparar push de pergunta:', err.message));
    }
  }

  res.status(201).json(questionObj);
});

// 3. PATCH /api/questions/:id - Toggle or set question status
app.patch('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['pending', 'answered'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Deve ser "pending" ou "answered".' });
  }

  const questions = await readQuestions();
  const index = questions.findIndex(q => q.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Pergunta não encontrada.' });
  }

  questions[index].status = status;
  await writeQuestions(questions);

  // Broadcast the update
  broadcast({
    type: 'question_updated',
    question: questions[index]
  });

  res.json(questions[index]);
});

// 4. DELETE /api/questions/:id - Excluir uma pergunta específica
app.delete('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  let questions = await readQuestions();
  const initialLength = questions.length;
  questions = questions.filter(q => q.id !== id);

  if (questions.length === initialLength) {
    return res.status(404).json({ error: 'Pergunta não encontrada.' });
  }

  await writeQuestions(questions);
  broadcast({ type: 'question_deleted', id });
  res.json({ success: true, message: 'Pergunta excluída com sucesso.' });
});

// 5. DELETE /api/questions - Limpar todas as perguntas e reiniciar teste do bot
app.delete('/api/questions', async (req, res) => {
  await writeQuestions([]);
  await resetProcessedIds();
  broadcast({ type: 'questions_cleared' });

  // Força uma nova checagem imediata no e-mail
  forceMailboxCheck().catch(err => {
    console.error('[BOT] Erro ao forçar checagem após limpeza:', err.message);
  });

  res.json({ success: true, message: 'Todas as perguntas foram apagadas! O bot está relendo seu e-mail agora mesmo.' });
});

// 6. GET /api/push/public-key - Fornece a chave pública VAPID para o frontend/iPhone
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// 7. POST /api/push/subscribe - Salva a inscrição Web Push do iPhone
app.post('/api/push/subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Inscrição push inválida.' });
  }

  const subs = await readSubscriptions();
  const exists = subs.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push(subscription);
    await writeSubscriptions(subs);
    console.log(`[PUSH] 📱 Novo iPhone/dispositivo inscrito com sucesso! Total: ${subs.length}`);
  }

  res.status(201).json({ success: true, message: 'Inscrição push registrada com sucesso!' });
});

// 8. POST /api/push/test - Envia uma notificação push de teste manual para o iPhone
app.post('/api/push/test', async (req, res) => {
  await sendPushToAll({
    title: '⚡ Fast Dashboard no seu iPhone',
    body: 'Notificações Push configuradas com sucesso! Você receberá alertas mesmo com o app fechado.',
    url: '/',
    tag: 'test-push'
  });
  res.json({ success: true, message: 'Notificação de teste enviada com sucesso!' });
});

// 9. GET /api/questions/stream - Server-Sent Events endpoint
app.get('/api/questions/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Keep-alive header for proxies
  res.write(': ok\n\n');

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Periodically send a keep-alive comment (every 30s) to keep connections active
setInterval(() => {
  sseClients.forEach(client => {
    try {
      client.write(': keepalive\n\n');
    } catch (e) {
      // Ignore write errors; clean up will happen on close event
    }
  });
}, 30000);

app.listen(PORT, () => {
  console.log(`=== Painel de Atendimento Rápido rodando na porta ${PORT} ===`);
  console.log(`Acesse http://localhost:${PORT} no navegador.`);

  // Inicia o bot de monitoramento de e-mails em segundo plano
  startBot().catch(err => {
    console.error('[BOT] Erro inesperado ao inicializar bot de e-mail:', err.message);
  });
});
