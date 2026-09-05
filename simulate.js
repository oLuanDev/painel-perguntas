/**
 * Script de Simulação de Integração
 * Use este script para enviar perguntas de teste ao Painel de Atendimento via terminal.
 * Execução: node simulate.js
 */

async function sendTestQuestion() {
  const mockId = 'ext-' + Math.floor(100000 + Math.random() * 900000);
  const platforms = ['ggmax', 'gamemarket'];
  const platform = platforms[Math.floor(Math.random() * platforms.length)];
  
  const payload = {
    id: mockId,
    platform: platform,
    receivedAt: new Date().toISOString(),
    buyerName: 'Comprador Externo #' + Math.floor(100 + Math.random() * 900),
    announcementName: 'Produto de Teste Enviado por Script Externo',
    announcementLink: `https://www.${platform}.com/anuncio-exemplo`,
    answerLink: `https://www.${platform}.com/responder-exemplo`
  };

  console.log(`Enviando payload para http://localhost:3000/api/questions...`);
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await fetch('http://localhost:3000/api/questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Sucesso! Pergunta criada com sucesso:', data.id);
    } else {
      console.error('Erro na resposta:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Falha de rede ao conectar com o servidor:', error.message);
    console.log('Verifique se o servidor está rodando (npm start)');
  }
}

sendTestQuestion();
