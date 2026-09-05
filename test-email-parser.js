import { detectPlatform, parseEmailContent } from './email-bot.js';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 TESTE DE PARSING DE E-MAILS (PERGUNTAS & MEDIAÇÕES)');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASSOU] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FALHOU] ${message}`);
      throw new Error(`Falha no teste: ${message}`);
    }
  }

  // 1. Pergunta GGMAX
  const ggmaxQuestionEmail = {
    from: { text: 'GGMAX <naoresponda@ggmax.com.br>' },
    subject: 'Você recebeu uma pergunta',
    date: new Date(),
    text: `
Olá, Hairuus50!
Você recebeu uma nova pergunta!
Anúncio: [[MAIS BARATO] GEMINI 3 PRO + 1K FLOW+ 5TB + VEO 3.1 + ANTIGRAVITY - 30 DIAS](https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias)
[Perguntas recebidas](https://ggmax.com.br/account/received-questions)
    `,
    html: `<p>Olá, Hairuus50!</p><a href="https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias">[MAIS BARATO] GEMINI 3 PRO</a>`
  };

  const d1 = detectPlatform(ggmaxQuestionEmail.from.text, ggmaxQuestionEmail.subject, ggmaxQuestionEmail.text);
  assert(d1 && d1.platform === 'ggmax' && d1.type === 'question', 'Detectou pergunta GGMAX corretamente');
  const p1 = parseEmailContent(d1, ggmaxQuestionEmail);
  assert(p1.type === 'question', 'Tipo é question');
  assert(p1.announcementLink.includes('/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias'), 'Link do anúncio GGMAX limpo');

  // 2. Pergunta GameMarket
  const gmQuestionEmail = {
    from: { text: 'GameMarket <noreply@gamemarket.com.br>' },
    subject: '❓ Nova pergunta sobre seu produto - GameMarket',
    date: new Date(),
    text: `
Olá!
Você recebeu uma nova pergunta sobre o anúncio no GameMarket.
Produto: Conta Valorant Imortal 3 + Vandal Sublime e Skins Exclusivas
Para responder a pergunta do comprador, acesse o link:
https://gamemarket.com.br/painel/perguntas/responder-gm992
    `,
    html: `<a href="https://gamemarket.com.br/painel/perguntas/responder-gm992">Responder Pergunta</a>`
  };

  const d2 = detectPlatform(gmQuestionEmail.from.text, gmQuestionEmail.subject, gmQuestionEmail.text);
  assert(d2 && d2.platform === 'gamemarket' && d2.type === 'question', 'Detectou pergunta GameMarket corretamente');
  const p2 = parseEmailContent(d2, gmQuestionEmail);
  assert(p2.type === 'question', 'Tipo é question');
  assert(p2.announcementName === 'Conta Valorant Imortal 3 + Vandal Sublime e Skins Exclusivas', 'Título GameMarket extraído');

  // 3. E-mail de Venda GGMAX (DEVE SER BLOQUEADO / RETORNAR NULL)
  const saleEmail = {
    from: { text: 'GGMAX <naoresponda@ggmax.com.br>' },
    subject: 'Você fez uma venda #885RLEG',
    text: `
[Pedido #885RLEG](https://ggmax.com.br/orders/885rleg)
Oba! Você vendeu!
O produto / serviço que você anunciou foi vendido com sucesso! O pagamento já está aprovado e você já pode estar fazendo a entrega do pedido.
Detalhes
Pagamento: #15977989
Pedido: [#885RLEG](https://ggmax.com.br/orders/885rleg)
Valor: R$ 9,50
Item(s):1 x [[MAIS BARATO] GEMINI 3 PRO + 1K FLOW+ 5TB + VEO 3.1 + ANTIGRAVITY - 30 DIAS](https://ggmax.com.br/anuncio/mais-barato-gemini-3-pro-1k-flow-5tb-veo-3-1-antigravity-30-dias)
    `
  };

  const d3 = detectPlatform(saleEmail.from.text, saleEmail.subject, saleEmail.text);
  assert(d3 === null, 'Bloqueou corretamente e-mail de venda comum');

  // 4. E-mail de Mediação / Intervenção GGMAX (EXEMPLO REAL DO USUÁRIO)
  const ggmaxMediationEmail = {
    from: { text: 'GGMAX <naoresponda@ggmax.com.br>' },
    subject: 'O comprador reportou um problema',
    date: new Date(),
    text: `
[Pedido #WB83QKM](https://ggmax.com.br/account/orders/wb83qkm)
Olá, Hairuus50!
Uma intervenção foi solicitada pelo comprador
Houve um problema com sua venda e o comprador abriu uma solicitaçao de intervenção para o Pedido #WB83QKM. Aguarde um de nossos moderadores intervir para solucionar o problema o mais rápido possível. Enquanto isso tente resolver o problema diretamente com o comprador.
[Ver pedido #WB83QKM](https://ggmax.com.br/account/orders/wb83qkm)
    `,
    html: `<a href="https://ggmax.com.br/account/orders/wb83qkm">Ver pedido #WB83QKM</a>`
  };

  const d4 = detectPlatform(ggmaxMediationEmail.from.text, ggmaxMediationEmail.subject, ggmaxMediationEmail.text);
  assert(d4 && d4.platform === 'ggmax' && d4.type === 'mediation', 'Detectou mediação GGMAX com prioridade sobre vendas');
  const p4 = parseEmailContent(d4, ggmaxMediationEmail);
  assert(p4.type === 'mediation', 'Item é do tipo mediation');
  assert(p4.orderId === '#WB83QKM', 'Número do pedido GGMAX extraído (#WB83QKM)');
  assert(p4.answerLink.includes('/account/orders/wb83qkm'), 'Link de resolução da mediação GGMAX extraído');
  assert(p4.buyerName === 'Hairuus50', 'Nome do comprador extraído');

  // 5. E-mail de Mediação GameMarket (EXEMPLO REAL DO USUÁRIO)
  const gmMediationEmail = {
    from: { text: 'GameMarket <noreply@gamemarket.com.br>' },
    subject: 'Nova Mediação Iniciada - GameMarket',
    date: new Date(),
    text: `
Mediação Iniciada
Uma mediação foi aberta para sua transação
Olá Hairuustore,
Uma mediação foi iniciada para sua transação:
INSTAGRAM CONTAS ANTIGAS COM SEGUIDORES 2009 - 2020
Pedido: #ZHAXGMA
•
Nossa equipe analisará o caso em até 2 dias úteis
•
Você será notificado sobre o resultado
•
Mantenha-se disponível para fornecer informações adicionais
[Acompanhar Mediação](https://xxx6bp8h.r.sa-east-1.awstrack.me/L0/https:%2F%2Fgamemarket.com.br%2Fcompras/1/010301a0723c55bc-60ab4374-0c20-4435-ad30-d702533f8ef2-000000/FmVMIiHyibo7U1f_w2wGJku00vE=258)
    `,
    html: `<a href="https://xxx6bp8h.r.sa-east-1.awstrack.me/L0/https:%2F%2Fgamemarket.com.br%2Fcompras/1/010301a0723c55bc-60ab4374-0c20-4435-ad30-d702533f8ef2-000000/FmVMIiHyibo7U1f_w2wGJku00vE=258">Acompanhar Mediação</a>`
  };

  const d5 = detectPlatform(gmMediationEmail.from.text, gmMediationEmail.subject, gmMediationEmail.text);
  assert(d5 && d5.platform === 'gamemarket' && d5.type === 'mediation', 'Detectou mediação GameMarket');
  const p5 = parseEmailContent(d5, gmMediationEmail);
  assert(p5.type === 'mediation', 'Item é do tipo mediation');
  assert(p5.orderId === '#ZHAXGMA', 'Número do pedido GameMarket extraído (#ZHAXGMA)');
  assert(p5.announcementName === 'INSTAGRAM CONTAS ANTIGAS COM SEGUIDORES 2009 - 2020', 'Produto em mediação GameMarket extraído');
  assert(p5.answerLink.includes('awstrack.me') || p5.answerLink.includes('gamemarket.com.br/compras'), 'Link de mediação GameMarket extraído');

  // 6. E-mail de Cancelamento de Intervenção GGMAX (EXEMPLO REAL DO USUÁRIO)
  const ggmaxCancelledEmail = {
    from: { text: 'GGMAX <naoresponda@ggmax.com.br>' },
    subject: 'Pedido de intervenção cancelado',
    date: new Date(),
    text: `
[Pedido #WB83QKM](https://ggmax.com.br/account/orders/wb83qkm)
Olá, Hairuus50!
O problema no pedido #WB83QKM foi cancelado
A solicitação de intervenção foi cancelada pelo comprador.
[Ver pedido #WB83QKM](https://ggmax.com.br/account/orders/wb83qkm)
    `,
    html: `
<a href="https://ggmax.com.br/account/orders/wb83qkm">Pedido #WB83QKM</a>
<p>Olá, Hairuus50!</p>
<p>O problema no pedido #WB83QKM foi cancelado</p>
<p>A solicitação de intervenção foi cancelada pelo comprador.</p>
<a href="https://ggmax.com.br/account/orders/wb83qkm">Ver pedido #WB83QKM</a>
    `
  };

  const d6 = detectPlatform(ggmaxCancelledEmail.from.text, ggmaxCancelledEmail.subject, ggmaxCancelledEmail.text);
  assert(d6 && d6.platform === 'ggmax' && d6.type === 'mediation_cancelled', 'Detectou cancelamento de intervenção GGMAX');
  const p6 = parseEmailContent(d6, ggmaxCancelledEmail);
  assert(p6.status === 'answered', 'Status do cancelamento é answered (resolvida)');
  assert(p6.orderId === '#WB83QKM', 'Número do pedido GGMAX extraído (#WB83QKM)');
  assert(p6.answerLink.includes('/account/orders/wb83qkm'), 'Link do pedido GGMAX extraído');
  assert(p6.action === 'resolve', 'Ação é resolve');

  // 7. E-mail de Encerramento de Mediação GameMarket
  const gmCancelledEmail = {
    from: { text: 'GameMarket <noreply@gamemarket.com.br>' },
    subject: 'Mediação Encerrada - GameMarket',
    date: new Date(),
    text: `
Mediação Encerrada
A mediação para o pedido #ZHAXGMA foi encerrada com sucesso.
Pedido: #ZHAXGMA
Transação: INSTAGRAM CONTAS ANTIGAS
    `,
    html: `<p>A mediação foi encerrada com sucesso.</p>`
  };

  const d7 = detectPlatform(gmCancelledEmail.from.text, gmCancelledEmail.subject, gmCancelledEmail.text);
  assert(d7 && d7.platform === 'gamemarket' && d7.type === 'mediation_cancelled', 'Detectou encerramento de mediação GameMarket');
  const p7 = parseEmailContent(d7, gmCancelledEmail);
  assert(p7.status === 'answered', 'Status do encerramento é answered');
  assert(p7.orderId === '#ZHAXGMA', 'Número do pedido GameMarket extraído (#ZHAXGMA)');

  console.log(`\n🎉 SUCESSO TOTAL! ${passed}/${total} asserções validadas com sucesso!`);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
