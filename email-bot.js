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

const API_URL = process.env.API_URL || 'http://localhost:3000/api/questions';

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
 * Detecta se o e-mail pertence a GGMAX ou GameMarket pelo remetente e assunto
 */
export function detectPlatform(fromText, subjectText) {
  const from = (fromText || '').toLowerCase();
  const subject = (subjectText || '').toLowerCase();

  // 1. GGMAX
  if (
    from.includes('ggmax.com.br') ||
    subject.includes('ggmax') ||
    subject.includes('você recebeu uma pergunta') ||
    subject.includes('você recebeu uma nova pergunta')
  ) {
    return 'ggmax';
  }

  // 2. GameMarket
  if (
    from.includes('gamemarket.com.br') ||
    subject.includes('gamemarket') ||
    subject.includes('nova pergunta sobre seu produto')
  ) {
    return 'gamemarket';
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
    // 1. Extração do link do anúncio GGMAX
    const linkMatch = combined.match(/https?:\/\/(?:www\.)?ggmax\.com\.br\/anuncio\/[^\s"')<>]+/i);
    if (linkMatch) {
      announcementLink = linkMatch[0];
    } else {
      announcementLink = 'https://ggmax.com.br/account/received-questions';
    }

    // 2. Extração do link para responder
    if (combined.includes('ggmax.com.br/account/received-questions')) {
      answerLink = 'https://ggmax.com.br/account/received-questions';
    } else {
      answerLink = announcementLink;
    }

    // 3. Extração do título do anúncio (trata títulos com colchetes internos como [MAIS BARATO])
    const markdownMatch = text.match(/Anúncio:\s*\[(.+)\]\s*\(https?:\/\//i);
    if (markdownMatch && markdownMatch[1] && markdownMatch[1].trim().length > 3) {
      announcementName = markdownMatch[1].trim();
    } else {
      const lineMatch = text.match(/Anúncio:\s*([^\n\r]+)/i);
      if (lineMatch && lineMatch[1]) {
        announcementName = lineMatch[1].replace(/\]\([^\)]+\)/g, '').replace(/^\[+|\]+$/g, '').trim();
      } else if (announcementLink.includes('/anuncio/')) {
        const slug = announcementLink.split('/anuncio/')[1]?.split('?')[0] || '';
        announcementName = slug.replace(/-/g, ' ').toUpperCase();
      } else {
        announcementName = 'Anúncio GGMAX';
      }
    }

    // 4. Nome do comprador
    buyerName = 'Possível Comprador (GGMAX)';

  } else if (platform === 'gamemarket') {
    // 1. Extração de links da GameMarket
    const gmLinkMatch = combined.match(/https?:\/\/(?:www\.)?gamemarket\.com\.br\/[^\s"')<>]+/i);
    if (gmLinkMatch) {
      announcementLink = gmLinkMatch[0];
    } else {
      announcementLink = 'https://gamemarket.com.br';
    }

    // Procura link de resposta ou painel da GameMarket
    const answerMatch = combined.match(/https?:\/\/(?:www\.)?gamemarket\.com\.br\/(?:painel|perguntas|responder|produto)[^\s"')<>]+/i);
    answerLink = answerMatch ? answerMatch[0] : announcementLink;

    // 2. Extração do título do anúncio
    const gmTitleMatch = text.match(/(?:produto|anúncio|item):\s*(?:\[|\b)(.*?)(?:\]|\n|\r)/i);
    if (gmTitleMatch && gmTitleMatch[1]) {
      announcementName = gmTitleMatch[1].trim();
    } else if (subject.includes('- GameMarket')) {
      announcementName = subject.replace('❓', '').replace('- GameMarket', '').trim();
    } else {
      announcementName = 'Produto GameMarket';
    }

    // 3. Nome do comprador
    buyerName = 'Possível Comprador (GameMarket)';
  }

  // Gera um ID único e consistente
  const dateObj = parsedMail.date ? new Date(parsedMail.date) : new Date();
  const timeKey = dateObj.getTime();
  const cleanTitle = announcementName.slice(0, 15).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const uniqueId = `${platform}-${cleanTitle}-${timeKey}`;

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

  const processedIds = await loadProcessedIds();

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
      // Procura e-mails recentes não lidos
      const messages = client.fetch({ seen: false }, {
        uid: true,
        envelope: true,
        source: true,
        flags: true
      });

      for await (const message of messages) {
        const msgId = message.envelope.messageId || `${message.uid}`;
        if (processedIds.has(msgId)) {
          continue;
        }

        const parsed = await simpleParser(message.source);
        const fromText = parsed.from ? parsed.from.text : '';
        const subjectText = parsed.subject || '';

        const platform = detectPlatform(fromText, subjectText);

        if (platform) {
          console.log(`[BOT] 📩 Nova notificação de pergunta detectada! Plataforma: [${platform.toUpperCase()}]`);
          console.log(`[BOT] De: ${fromText} | Assunto: ${subjectText}`);

          const payload = parseEmailContent(platform, parsed);
          const ok = await sendToApi(payload);

          if (ok) {
            processedIds.add(msgId);
            await saveProcessedIds(processedIds);

            // Marca o e-mail como lido no Gmail
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen']);
          }
        }
      }
    } catch (err) {
      console.error('[BOT] Erro durante a leitura de mensagens:', err.message);
    } finally {
      lock.release();
    }
  }

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
  console.log(`[BOT] ✅ Conexão IMAP estabelecida com sucesso! Monitorando novas perguntas...`);

  // Checagem inicial
  await checkMailbox();

  // Escuta contínua de novos e-mails via IDLE
  while (client.usable) {
    try {
      console.log('[BOT] Aguardando novas mensagens em tempo real (IMAP IDLE)...');
      await client.idle();
      await checkMailbox();
    } catch (err) {
      console.log('[BOT] Ciclo IDLE reiniciando...', err.message);
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
