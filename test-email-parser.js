import { detectPlatform, parseEmailContent, sendToApi } from './email-bot.js';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 TESTE DE PARSING DE E-MAILS (GGMAX & GAMEMARKET)');
  console.log('========================================================\n');

  // 1. Simulação do e-mail da GGMAX fornecido pelo usuário
  const ggmaxEmail = {
    from: { text: 'GGMAX <naoresponda@ggmax.com.br>' },
    subject: 'Você recebeu uma pergunta',
    date: new Date(),
    text: `
Olá, Hairuus50!
Você recebeu uma nova pergunta!
Anúncio: [[MAIS BARATO] GEMINI 3 PRO + 1K FLOW+ 5TB + VEO 3.1 + ANTIGRAVITY - 30 DIAS](https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias)
Responda a pergunta o quanto antes, pois isso aumenta as chances de converter em vendas! Acredite, eu sei do que eu tô falando!
[Perguntas recebidas](https://ggmax.com.br/account/received-questions)
Para responder a pergunta, acesse as suas [perguntas recebidas](https://ggmax.com.br/account/received-questions), ou acesse diretamente a [página do anúncio](https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias).
Você recebeu este e-mail pois um possível comprador fez uma pergunta em um dos seus anúncios publicados no site:ggmax.com.br
[Nosso Central de Ajuda](https://ggmax.com.br/central-de-ajuda)
Abração do Xamg! ... Digo; Da Equipe GGMAX! vendashairuusstore@gmail.com
    `,
    html: `<p>Olá, Hairuus50!</p><a href="https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias">[MAIS BARATO] GEMINI 3 PRO + 1K FLOW+ 5TB + VEO 3.1 + ANTIGRAVITY - 30 DIAS</a>`
  };

  const p1 = detectPlatform(ggmaxEmail.from.text, ggmaxEmail.subject);
  console.log(`[TESTE 1 - GGMAX] Plataforma detectada: ${p1}`);
  if (p1 !== 'ggmax') {
    throw new Error('Falha ao detectar plataforma GGMAX');
  }

  const payloadGGMax = parseEmailContent(p1, ggmaxEmail);
  console.log('[TESTE 1 - GGMAX] Payload extraído com sucesso:');
  console.log(JSON.stringify(payloadGGMax, null, 2));

  // 2. Simulação do e-mail da GameMarket fornecido pelo usuário
  const gameMarketEmail = {
    from: { text: 'GameMarket <noreply@gamemarket.com.br>' },
    subject: '❓ Nova pergunta sobre seu produto - GameMarket',
    date: new Date(Date.now() - 25 * 60 * 1000), // Recebido há 25 minutos para testar timer
    text: `
Olá!
Você recebeu uma nova pergunta sobre o anúncio no GameMarket.
Produto: Conta Valorant Imortal 3 + Vandal Sublime e Skins Exclusivas
Para responder a pergunta do comprador, acesse o link:
https://gamemarket.com.br/painel/perguntas/responder-gm992
    `,
    html: `<a href="https://gamemarket.com.br/painel/perguntas/responder-gm992">Responder Pergunta</a>`
  };

  const p2 = detectPlatform(gameMarketEmail.from.text, gameMarketEmail.subject);
  console.log(`\n[TESTE 2 - GameMarket] Plataforma detectada: ${p2}`);
  if (p2 !== 'gamemarket') {
    throw new Error('Falha ao detectar plataforma GameMarket');
  }

  const payloadGameMarket = parseEmailContent(p2, gameMarketEmail);
  console.log('[TESTE 2 - GameMarket] Payload extraído com sucesso:');
  console.log(JSON.stringify(payloadGameMarket, null, 2));

  // 3. Envio opcional para a API se estiver rodando
  console.log('\n[TESTE 3] Enviando para a API local em http://localhost:3000/api/questions...');
  const res1 = await sendToApi(payloadGGMax);
  const res2 = await sendToApi(payloadGameMarket);

  if (res1 && res2) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO! As perguntas foram registradas no painel.');
  } else {
    console.log('\n⚠️ Os dados foram extraídos com sucesso, mas certifique-se de que "node server.js" está rodando para receber os POSTs via HTTP.');
  }
}

runTests();
