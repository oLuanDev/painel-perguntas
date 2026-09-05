import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSED_IDS_FILE = path.join(__dirname, 'processed-emails.json');

const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || `http://localhost:${PORT}/api/questions`;

let activeProcessedIds = new Set();
let checkMailboxFn = null;

export async function resetProcessedIds() {
  activeProcessedIds.clear();
  await saveProcessedIds(activeProcessedIds);
  console.log('[BOT] 🔄 Memória de e-mails processados foi zerada com sucesso!');
}

export async function forceMailboxCheck() {
  if (checkMailboxFn) {
    console.log('[BOT] ⚡ Executando varredura imediata dos e-mails a pedido do usuário...');
    await checkMailboxFn();
  }
}

// Load previously processed email message IDs to avoid duplicates
async function loadProcessedIds() {
  try {
    const data = await fs.readFile(PROCESSED_IDS_FILE, 'utf-8');
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

async function saveProcessedIds(set) {
  try {
    await fs.writeFile(PROCESSED_IDS_FILE, JSON.stringify([...set]), 'utf-8');
  } catch (err) {
    console.error('[BOT] Erro ao salvar processed-emails.json:', err.message);
  }
}

/**
 * Detecta se o e-mail é EXCLUSIVAMENTE uma pergunta (ignora vendas, pedidos e pagamentos)
 */
export function detectPlatform(fromText, subjectText, bodyText = '') {
  const from = (fromText || '').toLowerCase();
  const subject = (subjectText || '').toLowerCase();
  const body = (bodyText || '').toLowerCase();

  // 1. BLOQUEIO TOTAL: E-mails de Vendas, Pedidos, Pagamentos ou Entregas
  const isSaleOrOrder =
    subject.includes('venda') ||
    subject.includes('vendeu') ||
    subject.includes('pedido') ||
    subject.includes('pagamento') ||
    subject.includes('compra') ||
    subject.includes('aprovado') ||
    subject.includes('entrega') ||
    subject.includes('qualificação') ||
    body.includes('você fez uma venda') ||
    body.includes('você vendeu') ||
    body.includes('vendido com sucesso') ||
    body.includes('realizar a entrega') ||
    body.includes('orders/');

  if (isSaleOrOrder) {
    // É uma notificação de venda/pedido -> NÃO É PERGUNTA!
    return null;
  }

  // 2. GGMAX - Somente se for especificamente NOTIFICAÇÃO DE PERGUNTA
  if (from.includes('ggmax') || subject.includes('ggmax')) {
    const isGgmaxQuestion =
      subject.includes('pergunta') ||
      body.includes('você recebeu uma nova pergunta') ||
      body.includes('received-questions');

    if (isGgmaxQuestion) {
      return 'ggmax';
    }
  }

  // 3. GameMarket - Somente se for especificamente NOTIFICAÇÃO DE PERGUNTA
  if (from.includes('gamemarket') || subject.includes('gamemarket')) {
    const isGmQuestion =
      subject.includes('pergunta') ||
      body.includes('nova pergunta');

    if (isGmQuestion) {
      return 'gamemarket';
    }
  }

  return null;
}

/**
 * Parser inteligente de conteúdo de e-mail para GGMAX e GameMarket
 */
export function parseEmailContent(platform, parsedMail) {
  const text = parsedMail.text || '';
  const html = parsedMail.html || '';
  const combined = `${text}\n${html}`;
  const subject = parsedMail.subject || '';

  let announcementName = '';
  let announcementLink = '';
  let answerLink = '';
  let buyerName = '';

  if (platform === 'ggmax') {
    // 1. Extração limpa do link do anúncio GGMAX (sem capturar ] ou pontuação)
    const linkMatch = combined.match(/https?:\/\/(?:www\.)?ggmax\.com\.br\/anuncio\/[a-zA-Z0-9\-_]+/i);
    if (linkMatch) {
      announcementLink = linkMatch[0];
    } else {
      announcementLink = 'https://ggmax.com.br/account/received-questions';
    }

    // 2. Link direto para responder
    answerLink = 'https://ggmax.com.br/account/received-questions';

    // 3. Extração limpa do título do anúncio
    const markdownMatch = text.match(/Anúncio:\s*\[?(.+?)\]?\s*\(https?:\/\//i);
    if (markdownMatch && markdownMatch[1] && markdownMatch[1].trim().length > 3) {
      announcementName = markdownMatch[1].trim();
    } else {
      const lineMatch = text.match(/Anúncio:\s*([^\n\r]+)/i);
      if (lineMatch && lineMatch[1]) {
        announcementName = lineMatch[1].trim();
      } else if (announcementLink.includes('/anuncio/')) {
        const slug = announcementLink.split('/anuncio/')[1]?.split('?')[0] || '';
        announcementName = slug.replace(/-/g, ' ').toUpperCase();
      } else {
        announcementName = 'Anúncio GGMAX';
      }
    }

    // Remove colchetes ou barras invertidas do título
    announcementName = announcementName.replace(/[\[\]\\]/g, '').trim();

    // 4. Nome do comprador
    buyerName = 'Possível Comprador (GGMAX)';

  } else if (platform === 'gamemarket') {
    // 1. Extração de links da GameMarket
    const gmLinkMatch = combined.match(/https?:\/\/(?:www\.)?gamemarket\.com\.br\/[a-zA-Z0-9\-_/]+/i);
    if (gmLinkMatch) {
      announcementLink = gmLinkMatch[0].replace(/[\]\)\>\s]+$/, '');
    } else {
      announcementLink = 'https://gamemarket.com.br';
    }

    answerLink = announcementLink;

    // 2. Extração do título do anúncio
    const gmTitleMatch = text.match(/(?:produto|anúncio|item):\s*(?:\[|\b)(.*?)(?:\]|\n|\r)/i);
    if (gmTitleMatch && gmTitleMatch[1]) {
      announcementName = gmTitleMatch[1].trim();
    } else if (subject.includes('- GameMarket')) {
      announcementName = subject.replace('❓', '').replace('- GameMarket', '').trim();
    } else {
      announcementName = 'Produto GameMarket';
    }

    announcementName = announcementName.replace(/[\[\]\\]/g, '').trim();
    buyerName = 'Possível Comprador (GameMarket)';
  }

  // Gera um ID único e consistente por anúncio (evita perguntas repetidas para o mesmo anúncio)
  const slugPart = announcementLink.includes('/anuncio/')
    ? announcementLink.split('/anuncio/')[1]
    : announcementName.slice(0, 25).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const uniqueId = `${platform}-${slugPart}`;

  const dateObj = parsedMail.date ? new Date(parsedMail.date) : new Date();

  return {
    id: uniqueId,
    platform,
    receivedAt: dateObj.toISOString(),
    buyerName,
    announcementName,
    announcementLink,
    answerLink
  };
}

/**
 * Envia o payload extraído para a API Express
 */
export async function sendToApi(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[BOT] ✅ Pergunta registrada com sucesso! ID: ${data.id} (${data.platform.toUpperCase()})`);
      return true;
    } else {
      console.error(`[BOT] ❌ Erro ao enviar para a API: ${res.status} - ${await res.text()}`);
      return false;
    }
  } catch (err) {
    console.error(`[BOT] ❌ Falha de conexão ao enviar para ${API_URL}:`, err.message);
    return false;
  }
}

/**
 * Loop principal do Bot IMAP
 */
export async function startBot() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass || pass === 'sua_senha_de_app_aqui') {
    console.log('[BOT] ℹ️ E-mail não configurado no .env. O painel web continua ativo normalmente.');
    console.log('[BOT] 💡 Para ativar a leitura de e-mails, configure EMAIL_USER e EMAIL_PASS no .env.');
    return;
  }

  activeProcessedIds = await loadProcessedIds();

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: { user, pass },
    logger: false
  });

  async function checkMailbox() {
    let lock = await client.getMailboxLock('INBOX');
    try {
      console.log('[BOT] 🔍 Buscando e-mails de GGMAX, GameMarket ou mensagens não lidas...');

      let targetUids = new Set();

      // 1. Busca por remetente ggmax
      try {
        const uidsGgmax = await client.search({ header: ['from', 'ggmax'] });
        if (uidsGgmax && uidsGgmax.length) {
          uidsGgmax.forEach(u => targetUids.add(u));
          console.log(`[BOT] 📬 E-mails com 'ggmax' encontrados: ${uidsGgmax.length}`);
        }
      } catch (e) {}

      // 2. Busca por remetente gamemarket
      try {
        const uidsGm = await client.search({ header: ['from', 'gamemarket'] });
        if (uidsGm && uidsGm.length) {
          uidsGm.forEach(u => targetUids.add(u));
          console.log(`[BOT] 📬 E-mails com 'gamemarket' encontrados: ${uidsGm.length}`);
        }
      } catch (e) {}

      // 3. Busca por e-mails não lidos
      try {
        const uidsUnread = await client.search({ seen: false });
        if (uidsUnread && uidsUnread.length) {
          uidsUnread.forEach(u => targetUids.add(u));
          console.log(`[BOT] 📬 E-mails não lidos encontrados: ${uidsUnread.length}`);
        }
      } catch (e) {}

      let messages;
      if (targetUids.size > 0) {
        // Busca as mensagens encontradas pelos filtros
        messages = client.fetch([...targetUids], {
          uid: true,
          envelope: true,
          source: true,
          flags: true
        });
      } else {
        // Fallback: pega as últimas 30 mensagens da caixa
        const status = await client.status('INBOX', { messages: true });
        const total = status.messages || 0;
        if (total > 0) {
          const start = Math.max(1, total - 30);
          messages = client.fetch(`${start}:*`, {
            uid: true,
            envelope: true,
            source: true,
            flags: true
          });
        }
      }

      if (messages) {
        for await (const message of messages) {
          const msgId = message.envelope.messageId || `${message.uid}`;
          if (activeProcessedIds.has(msgId)) {
            continue;
          }

          const parsed = await simpleParser(message.source);
          const fromText = parsed.from ? parsed.from.text : '';
          const subjectText = parsed.subject || '';
          const bodyText = `${parsed.text || ''}\n${parsed.html || ''}`;

          console.log(`[BOT] 🔎 Inspecionando: [De: ${fromText}] [Assunto: ${subjectText}]`);

          const platform = detectPlatform(fromText, subjectText, bodyText);

          if (platform) {
            console.log(`[BOT] 🎯 Pergunta detectada! Plataforma: [${platform.toUpperCase()}]`);

            const payload = parseEmailContent(platform, parsed);
            const ok = await sendToApi(payload);

            if (ok) {
              activeProcessedIds.add(msgId);
              await saveProcessedIds(activeProcessedIds);
              console.log(`[BOT] 🎉 Pergunta "${payload.announcementName}" adicionada com sucesso ao painel!`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[BOT] Erro durante a leitura de mensagens:', err.message);
    } finally {
      lock.release();
    }
  }

  // Registra a função para checagem manual via API
  checkMailboxFn = checkMailbox;

  // Tratamento de reconexão contínua
  client.on('error', err => {
    console.error('[BOT] Erro na conexão IMAP:', err.message);
  });

  client.on('close', () => {
    console.log('[BOT] Conexão IMAP encerrada. Tentando reconectar em 10 segundos...');
    setTimeout(startBot, 10000);
  });

  console.log(`[BOT] Conectando a ${process.env.IMAP_HOST || 'imap.gmail.com'} como ${user}...`);
  await client.connect();
  console.log(`[BOT] ✅ Conexão IMAP estabelecida com sucesso!`);
  console.log(`[BOT] ⏱️ Monitoramento ativo: lendo a caixa de entrada a cada 2 minutos.`);

  // 1. Checagem inicial imediata
  await checkMailbox();

  // 2. Checagem periódica a cada 2 minutos (120 segundos)
  setInterval(async () => {
    try {
      if (client.usable) {
        console.log('[BOT] ⏱️ [Ciclo de 2 min] Verificando e-mails da GGMAX e GameMarket...');
        await checkMailbox();
      }
    } catch (err) {
      console.error('[BOT] Erro na verificação periódica de 2 minutos:', err.message);
    }
  }, 2 * 60 * 1000);

  // Escuta contínua de novos e-mails via IDLE
  while (client.usable) {
    try {
      await client.idle();
      await checkMailbox();
    } catch (err) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Se o arquivo for executado diretamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startBot().catch(err => {
    console.error('[BOT] Erro fatal no bot:', err);
    setTimeout(startBot, 15000);
  });
}
