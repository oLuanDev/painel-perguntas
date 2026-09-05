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
 * Detecta se o e-mail é uma Mediação/Intervenção ou uma Pergunta
 * Ignora e-mails comuns de vendas/pedidos sem mediação
 */
export function detectPlatform(fromText, subjectText, bodyText = '') {
  const from = (fromText || '').toLowerCase();
  const subject = (subjectText || '').toLowerCase();
  const body = (bodyText || '').toLowerCase();

  // 1. PRIORIDADE MÁXIMA ABSOLUTA: Detecção de Cancelamento / Resolução de Mediação / Intervenção
  // GGMAX: "Pedido de intervenção cancelado", "O problema no pedido #... foi cancelado", "solicitação de intervenção foi cancelada", etc.
  if (from.includes('ggmax') || subject.includes('ggmax') || body.includes('ggmax')) {
    const isGgmaxMediationCancelled =
      ((subject.includes('intervenção') || subject.includes('intervencao') || subject.includes('mediação') || subject.includes('mediacao')) &&
       (subject.includes('cancelad') || subject.includes('cancelou') || subject.includes('encerrad') || subject.includes('resolvid'))) ||
      (subject.includes('problema no pedido') && subject.includes('cancelad')) ||
      body.includes('intervenção foi cancelada') ||
      body.includes('intervencao foi cancelada') ||
      body.includes('solicitação de intervenção foi cancelada') ||
      body.includes('solicitacao de intervencao foi cancelada') ||
      body.includes('solicitaçao de intervenção foi cancelada') ||
      body.includes('intervenção foi encerrada') ||
      body.includes('intervencao foi encerrada') ||
      (body.includes('problema no pedido') && body.includes('cancelado')) ||
      body.includes('cancelou a intervenção') ||
      body.includes('cancelou a intervencao');

    if (isGgmaxMediationCancelled) {
      return { platform: 'ggmax', type: 'mediation_cancelled' };
    }
  }

  // GameMarket: Cancelamento / Encerramento de mediação
  if (from.includes('gamemarket') || subject.includes('gamemarket') || body.includes('gamemarket')) {
    const isGmMediationCancelled =
      ((subject.includes('mediação') || subject.includes('mediacao')) &&
       (subject.includes('cancelad') || subject.includes('cancelou') || subject.includes('encerrad') || subject.includes('resolvid') || subject.includes('finalizad') || subject.includes('concluíd') || subject.includes('concluid'))) ||
      body.includes('mediação foi cancelada') ||
      body.includes('mediacao foi cancelada') ||
      body.includes('mediação foi encerrada') ||
      body.includes('mediacao foi encerrada') ||
      body.includes('mediação foi finalizada') ||
      body.includes('mediacao foi finalizada') ||
      body.includes('mediação foi resolvida') ||
      body.includes('mediacao foi resolvida') ||
      body.includes('cancelou a mediação') ||
      body.includes('cancelou a mediacao');

    if (isGmMediationCancelled) {
      return { platform: 'gamemarket', type: 'mediation_cancelled' };
    }
  }

  // 2. PRIORIDADE: Detecção de Mediações / Intervenções ABERTAS
  // GGMAX: "O comprador reportou um problema", "intervenção foi solicitada", etc.
  if (from.includes('ggmax') || subject.includes('ggmax') || body.includes('ggmax')) {
    const isGgmaxMediation =
      subject.includes('reportou um problema') ||
      subject.includes('intervenção') ||
      subject.includes('intervencao') ||
      subject.includes('mediação') ||
      subject.includes('mediacao') ||
      body.includes('reportou um problema') ||
      body.includes('intervenção foi solicitada') ||
      body.includes('intervencao foi solicitada') ||
      body.includes('solicitaçao de intervenção') ||
      body.includes('solicitação de intervenção') ||
      body.includes('moderadores intervir');

    if (isGgmaxMediation) {
      return { platform: 'ggmax', type: 'mediation' };
    }
  }

  // GameMarket: "Nova Mediação Iniciada", "Mediação Iniciada", etc.
  if (from.includes('gamemarket') || subject.includes('gamemarket') || body.includes('gamemarket')) {
    const isGmMediation =
      subject.includes('mediação') ||
      subject.includes('mediacao') ||
      body.includes('mediação foi aberta') ||
      body.includes('mediacao foi aberta') ||
      body.includes('mediação foi iniciada') ||
      body.includes('mediacao foi iniciada') ||
      body.includes('acompanhar mediação') ||
      body.includes('acompanhar mediacao');

    if (isGmMediation) {
      return { platform: 'gamemarket', type: 'mediation' };
    }
  }

  // 2. BLOQUEIO DE VENDAS E PEDIDOS NORMAIS (Se não for mediação)
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
    // Venda comum sem mediação -> Descartar
    return null;
  }

  // 3. GGMAX - Notificação de Pergunta
  if (from.includes('ggmax') || subject.includes('ggmax')) {
    const isGgmaxQuestion =
      subject.includes('pergunta') ||
      body.includes('você recebeu uma nova pergunta') ||
      body.includes('received-questions');

    if (isGgmaxQuestion) {
      return { platform: 'ggmax', type: 'question' };
    }
  }

  // 4. GameMarket - Notificação de Pergunta
  if (from.includes('gamemarket') || subject.includes('gamemarket')) {
    const isGmQuestion =
      subject.includes('pergunta') ||
      body.includes('nova pergunta');

    if (isGmQuestion) {
      return { platform: 'gamemarket', type: 'question' };
    }
  }

  return null;
}

/**
 * Parser inteligente de conteúdo de e-mail para Perguntas e Mediações
 */
export function parseEmailContent(detection, parsedMail) {
  // detection pode ser objeto { platform, type } ou string legada 'ggmax' | 'gamemarket'
  const platform = typeof detection === 'object' && detection !== null ? detection.platform : detection;
  const itemType = typeof detection === 'object' && detection !== null ? detection.type : 'question';

  const text = parsedMail.text || '';
  const html = parsedMail.html || '';
  const combined = `${text}\n${html}`;
  const subject = parsedMail.subject || '';

  let announcementName = '';
  let announcementLink = '';
  let answerLink = '';
  let buyerName = '';
  let orderId = '';
  let description = '';

  const dateObj = parsedMail.date ? new Date(parsedMail.date) : new Date();

  // ==========================================
  // CENÁRIO A: MEDIAÇÕES CANCELADAS / RESOLVIDAS
  // ==========================================
  if (itemType === 'mediation_cancelled') {
    if (platform === 'ggmax') {
      // 1. Extração do Pedido (Ex: #WB83QKM ou Pedido #WB83QKM)
      const orderMatch = combined.match(/(?:pedido|intervenção para o pedido|problema no pedido)\s*#?([a-zA-Z0-9]{5,12})/i);
      orderId = orderMatch && orderMatch[1] ? `#${orderMatch[1].toUpperCase()}` : '';

      // 2. Extração do Link do Pedido
      const orderLinkMatch = combined.match(/https?:\/\/(?:www\.)?ggmax\.com\.br\/account\/orders\/[a-zA-Z0-9\-_]+/i);
      if (orderLinkMatch) {
        announcementLink = orderLinkMatch[0];
      } else if (orderId) {
        announcementLink = `https://ggmax.com.br/account/orders/${orderId.replace('#', '').toLowerCase()}`;
      } else {
        announcementLink = 'https://ggmax.com.br/account/orders';
      }
      answerLink = announcementLink;

      // 3. Nome do Comprador
      const buyerMatch = text.match(/Olá,\s*([^\n!,\r]+)/i);
      buyerName = buyerMatch && buyerMatch[1] ? buyerMatch[1].trim() : 'Comprador (GGMAX)';

      // 4. Título do Item / Mediação
      announcementName = orderId ? `Intervenção no Pedido ${orderId} (Cancelada)` : 'Intervenção Cancelada pelo Comprador';
      description = 'A solicitação de intervenção foi cancelada pelo comprador. O problema foi resolvido!';

    } else if (platform === 'gamemarket') {
      const orderMatch = text.match(/pedido:\s*#?([a-zA-Z0-9]{4,12})/i);
      orderId = orderMatch && orderMatch[1] ? `#${orderMatch[1].toUpperCase()}` : '';

      const prodMatch = text.match(/transação:\s*\n+([^\n\r]+)/i);
      if (prodMatch && prodMatch[1] && !prodMatch[1].toLowerCase().includes('pedido')) {
        announcementName = `${prodMatch[1].trim()} (Mediação Cancelada)`;
      } else {
        announcementName = orderId ? `Transação Pedido ${orderId} (Mediação Cancelada)` : 'Mediação GameMarket (Cancelada)';
      }

      const gmLinkMatch = combined.match(/https?:\/\/(?:www\.)?gamemarket\.com\.br\/[a-zA-Z0-9\-_/]+/i);
      answerLink = gmLinkMatch ? gmLinkMatch[0].replace(/[\]\)\>\s]+$/, '') : 'https://gamemarket.com.br/compras';
      announcementLink = answerLink;
      buyerName = 'Comprador (GameMarket)';
      description = 'Mediação cancelada/encerrada com sucesso na GameMarket.';
    }

    const uniqueId = `${platform}-mediation-${orderId ? orderId.replace('#', '').toLowerCase() : Date.now()}`;

    return {
      id: uniqueId,
      platform,
      type: 'mediation',
      orderId,
      receivedAt: dateObj.toISOString(),
      buyerName,
      announcementName: announcementName.replace(/[\[\]\\]/g, '').trim(),
      announcementLink,
      answerLink,
      description,
      status: 'answered',
      action: 'resolve'
    };
  }

  // ==========================================
  // CENÁRIO B: MEDIAÇÕES / INTERVENÇÕES ABERTAS
  // ==========================================
  if (itemType === 'mediation') {
    if (platform === 'ggmax') {
      // 1. Extração do Pedido (Ex: #WB83QKM ou Pedido #WB83QKM)
      const orderMatch = combined.match(/(?:pedido|intervenção para o pedido)\s*#?([a-zA-Z0-9]{5,12})/i);
      orderId = orderMatch && orderMatch[1] ? `#${orderMatch[1].toUpperCase()}` : '';

      // 2. Extração do Link do Pedido
      const orderLinkMatch = combined.match(/https?:\/\/(?:www\.)?ggmax\.com\.br\/account\/orders\/[a-zA-Z0-9\-_]+/i);
      if (orderLinkMatch) {
        announcementLink = orderLinkMatch[0];
      } else if (orderId) {
        announcementLink = `https://ggmax.com.br/account/orders/${orderId.replace('#', '').toLowerCase()}`;
      } else {
        announcementLink = 'https://ggmax.com.br/account/orders';
      }
      answerLink = announcementLink;

      // 3. Nome do Comprador
      const buyerMatch = text.match(/Olá,\s*([^\n!,\r]+)/i);
      buyerName = buyerMatch && buyerMatch[1] ? buyerMatch[1].trim() : 'Comprador (GGMAX)';

      // 4. Título do Item / Mediação
      announcementName = orderId ? `Intervenção no Pedido ${orderId}` : 'Intervenção Solicitada pelo Comprador';
      description = 'O comprador solicitou intervenção da moderação. Tente resolver o problema diretamente com ele o mais rápido possível!';

    } else if (platform === 'gamemarket') {
      // 1. Extração do Pedido GameMarket (Ex: Pedido: #ZHAXGMA)
      const orderMatch = text.match(/pedido:\s*#?([a-zA-Z0-9]{4,12})/i);
      orderId = orderMatch && orderMatch[1] ? `#${orderMatch[1].toUpperCase()}` : '';

      // 2. Extração do Produto anunciado
      const prodMatch = text.match(/transação:\s*\n+([^\n\r]+)/i);
      if (prodMatch && prodMatch[1] && !prodMatch[1].toLowerCase().includes('pedido')) {
        announcementName = prodMatch[1].trim();
      } else {
        announcementName = orderId ? `Transação Pedido ${orderId}` : 'Mediação GameMarket';
      }

      // 3. Extração do Link de Acompanhar Mediação
      const trackLinkMatch = combined.match(/https?:\/\/[^\s\)\>\]]+awstrack\.me[^\s\)\>\]]+/i);
      if (trackLinkMatch) {
        answerLink = trackLinkMatch[0].replace(/[\]\)\>\s]+$/, '');
        announcementLink = answerLink;
      } else {
        const gmLinkMatch = combined.match(/https?:\/\/(?:www\.)?gamemarket\.com\.br\/[a-zA-Z0-9\-_/]+/i);
        answerLink = gmLinkMatch ? gmLinkMatch[0].replace(/[\]\)\>\s]+$/, '') : 'https://gamemarket.com.br/compras';
        announcementLink = answerLink;
      }

      buyerName = 'Comprador (GameMarket)';
      description = 'Mediação aberta. A equipe GameMarket analisará o caso em até 2 dias úteis. Responda imediatamente para proteger seu Selo Prestige GM!';
    }

    const uniqueId = `${platform}-mediation-${orderId ? orderId.replace('#', '').toLowerCase() : Date.now()}`;

    return {
      id: uniqueId,
      platform,
      type: 'mediation',
      orderId,
      receivedAt: dateObj.toISOString(),
      buyerName,
      announcementName: announcementName.replace(/[\[\]\\]/g, '').trim(),
      announcementLink,
      answerLink,
      description
    };
  }

  // ==========================================
  // CENÁRIO B: PERGUNTAS COMUNS
  // ==========================================
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

    announcementName = announcementName.replace(/[\[\]\\]/g, '').trim();
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

  return {
    id: uniqueId,
    platform,
    type: 'question',
    orderId: null,
    receivedAt: dateObj.toISOString(),
    buyerName,
    announcementName,
    announcementLink,
    answerLink,
    description: ''
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

          const detected = detectPlatform(fromText, subjectText, bodyText);

          if (detected) {
            const platform = typeof detected === 'object' ? detected.platform : detected;
            const itemType = typeof detected === 'object' ? detected.type : 'question';
            const labelType = itemType === 'mediation' 
              ? '⚖️ MEDIAÇÃO / INTERVENÇÃO' 
              : (itemType === 'mediation_cancelled' ? '✅ MEDIAÇÃO CANCELADA / RESOLVIDA' : '❓ PERGUNTA');

            console.log(`[BOT] 🎯 ${labelType} detectada! Plataforma: [${platform.toUpperCase()}]`);

            const payload = parseEmailContent(detected, parsed);
            const ok = await sendToApi(payload);

            if (ok) {
              activeProcessedIds.add(msgId);
              await saveProcessedIds(activeProcessedIds);
              console.log(`[BOT] 🎉 ${labelType} "${payload.announcementName}" processada com sucesso no painel!`);
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
  console.log(`[BOT] ⏱️ Monitoramento ativo: lendo a caixa de entrada a cada 60 segundos (1 minuto).`);

  // 1. Checagem inicial imediata
  await checkMailbox();

  // 2. Checagem periódica a cada 60 segundos (1 minuto)
  setInterval(async () => {
    try {
      if (client.usable) {
        console.log('[BOT] ⏱️ [Ciclo de 60s] Verificando e-mails da GGMAX e GameMarket...');
        await checkMailbox();
      }
    } catch (err) {
      console.error('[BOT] Erro na verificação periódica de 60 segundos:', err.message);
    }
  }, 60 * 1000);

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
