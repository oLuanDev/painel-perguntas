import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBot } from './email-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'questions.json');

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

// 2. POST /api/questions - Add/Update a question
app.post('/api/questions', async (req, res) => {
  const { id, platform, receivedAt, buyerName, announcementName, announcementLink, answerLink } = req.body;

  if (!id || !platform || !buyerName || !announcementName || !announcementLink || !answerLink) {
    return res.status(400).json({ error: 'Faltando campos obrigatórios no payload.' });
  }

  const questions = await readQuestions();
  const existingIndex = questions.findIndex(q => q.id === id);

  const timestamp = receivedAt || new Date().toISOString();

  let questionObj;

  if (existingIndex !== -1) {
    // Question already exists, update its info but preserve status unless explicitly passed
    const existing = questions[existingIndex];
    questionObj = {
      ...existing,
      platform,
      receivedAt: timestamp,
      buyerName,
      announcementName,
      announcementLink,
      answerLink,
      status: req.body.status || existing.status || 'pending'
    };
    questions[existingIndex] = questionObj;
  } else {
    // New question
    questionObj = {
      id,
      platform,
      receivedAt: timestamp,
      buyerName,
      announcementName,
      announcementLink,
      answerLink,
      status: req.body.status || 'pending'
    };
    questions.push(questionObj);
  }

  await writeQuestions(questions);

  // Broadcast to all active clients
  broadcast({
    type: existingIndex !== -1 ? 'question_updated' : 'question_new',
    question: questionObj
  });

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

// 4. GET /api/questions/stream - Server-Sent Events endpoint
app.get('/api/questions/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Keep-alive header for some proxies
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
