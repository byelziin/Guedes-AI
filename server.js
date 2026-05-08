const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const numbers = require('./numbers');
const createMessage = require('./message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;
let isSending = false;
let sentCount = 0;
let statusMessage = 'Aguardando autenticação...';
let client;
let clientInitializing = false;
let clientReady = false;

function createClient() {
  const newClient = new Client({
    authStrategy: new LocalAuth({ clientId: 'web-interface' }),
    puppeteer: {
      headless: false,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-extensions']
    }
  });

  newClient.on('qr', async (qr) => {
    const url = await qrcode.toDataURL(qr);
    statusMessage = 'Aguardando escaneamento do QR code...';
    logToUi('📲 Novo QR code gerado. Escaneie pelo WhatsApp.');
    io.emit('qr', url);
    io.emit('status', { status: statusMessage, sentCount, ready: false });
  });

  newClient.on('ready', () => {
    statusMessage = 'Bot conectado e pronto.';
    clientReady = true;
    logToUi('🚀 Bot pronto');
    io.emit('status', { status: statusMessage, sentCount, ready: true });
  });

  newClient.on('auth_failure', (msg) => {
    statusMessage = 'Falha na autenticação';
    logToUi(`❌ Falha na autenticação: ${msg}`);
    io.emit('status', { status: statusMessage, sentCount, ready: false });
  });

  newClient.on('disconnected', (reason) => {
    statusMessage = 'Cliente desconectado';
    clientReady = false;
    logToUi(`⚠️ Cliente desconectado: ${reason}`);
    io.emit('status', { status: statusMessage, sentCount, ready: false });
  });

  return newClient;
}

async function initializeClient() {
  if (clientReady) {
    return;
  }

  if (clientInitializing) {
    return;
  }

  clientInitializing = true;
  statusMessage = 'Inicializando WhatsApp...';
  io.emit('status', { status: statusMessage, sentCount, ready: false });
  logToUi('🔌 Inicializando cliente WhatsApp...');

  client = createClient();
  await client.initialize();
  clientInitializing = false;
}

function logToUi(message) {
  console.log(message);
  io.emit('log', message);
}

function formatNumber(number) {
  let num = number.replace(/\D/g, '');
  if (!num.startsWith('55')) num = '55' + num;
  const rest = num.slice(2);
  if (rest.length < 10 || rest.length > 11) return null;
  if (rest.length === 10) return '55' + rest.slice(0, 2) + '9' + rest.slice(2);
  return num;
}

function parseNumbers(raw) {
  return raw
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeMessage(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function getMessageStyle(sentCount) {
  if (sentCount % 12 === 6) return 2;
  if (sentCount % 12 === 0) return 3;
  return 1;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * 8000) + 15000;
}

async function safeSend(chatId, text) {
  try {
    return await client.sendMessage(chatId, text);
  } catch (err) {
    if (err.message.includes('No LID for user')) {
      try {
        const numberId = await client.getNumberId(chatId);
        if (!numberId) return false;
        await delay(2000);
        return await client.sendMessage(numberId._serialized, text);
      } catch (e) {
        return false;
      }
    }
    return false;
  }
}

app.use('/dist', express.static('public/dist'));
app.use('/dist', express.static('public/dist'));
app.use(express.static('public'));

app.get('/status', (req, res) => {
  res.json({ ready: clientReady, status: statusMessage, sentCount });
});

// Fallback para SPA - não captura arquivos com extensão
app.get('*', (req, res) => {
  // Não retorna index.html para requisições de arquivos (com extensão)
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(__dirname + '/public/dist/index.html');
});

io.on('connection', (socket) => {
  socket.emit('status', { status: statusMessage, sentCount, ready: clientReady });
  socket.on('connectWhatsApp', async () => {
    if (clientReady) {
      socket.emit('log', '✅ Bot já está conectado.');
      return;
    }
    if (clientInitializing) {
      socket.emit('log', '⏳ Conexão em andamento. Aguarde o QR code.');
      return;
    }
    try {
      await initializeClient();
      socket.emit('log', '🔌 Processo de autenticação iniciado. Aguarde o QR code.');
    } catch (err) {
      statusMessage = 'Falha ao iniciar cliente';
      logToUi(`❌ Erro ao inicializar WhatsApp: ${err.message}`);
      io.emit('status', { status: statusMessage, sentCount, ready: false });
    }
  });

  socket.on('start', async (data) => {
    if (!clientReady) {
      if (!clientInitializing) {
        socket.emit('log', '🔌 Bot não está pronto. Iniciando autenticação...');
        try {
          await initializeClient();
        } catch (err) {
          statusMessage = 'Falha ao iniciar cliente';
          logToUi(`❌ Erro ao inicializar WhatsApp: ${err.message}`);
          io.emit('status', { status: statusMessage, sentCount, ready: false });
          return;
        }
      } else {
        socket.emit('log', '⏳ Autenticação em andamento. Aguarde o QR code.');
      }

      if (!clientReady) {
        socket.emit('log', '⚠️ Bot ainda não está pronto. Aguarde a autenticação do WhatsApp.');
        return;
      }
    }
    if (isSending) {
      socket.emit('log', '⚠️ Campanha já em andamento.');
      return;
    }

    const rawNumbers = data && typeof data.numbers === 'string' ? data.numbers : '';
    const rawMessage = data && typeof data.message === 'string' ? data.message : '';
    const targetNumbers = rawNumbers.trim().length ? parseNumbers(rawNumbers) : numbers;
    const customMessage = normalizeMessage(rawMessage);

    if (!targetNumbers.length) {
      socket.emit('log', '⚠️ Nenhum número válido encontrado. Preencha o campo ou use a lista padrão.');
      return;
    }

    isSending = true;
    sentCount = 0;
    logToUi('🚀 Iniciando envio pelo web interface...');
    io.emit('status', { status: 'Enviando mensagens...', sentCount, ready: true });

    for (const number of targetNumbers) {
      if (!isSending) break;
      const cleanNumber = formatNumber(number);
      if (!cleanNumber) {
        logToUi(`⚠️ Número inválido ignorado: ${number}`);
        continue;
      }
      const chatId = `${cleanNumber}@c.us`;
      try {
        const style = getMessageStyle(sentCount + 1);
        const messageText = customMessage.length ? customMessage : createMessage(style).text;
        logToUi(`📤 Enviando para ${cleanNumber}` + (customMessage.length ? '' : ` (estilo ${style})`));
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
          logToUi(`⚠️ Não existe no WhatsApp: ${cleanNumber}`);
          continue;
        }
        await delay(3000);
        const ok = await safeSend(chatId, messageText);
        if (!ok) {
          logToUi(`❌ Falhou envio: ${cleanNumber}`);
          continue;
        }
        sentCount += 1;
        logToUi(`✅ Enviado (${sentCount}/${targetNumbers.length})`);
        io.emit('status', { status: 'Enviando mensagens...', sentCount, ready: true });
        await delay(randomDelay());
      } catch (err) {
        logToUi(`❌ Erro no número ${cleanNumber}: ${err.message}`);
      }
    }

    isSending = false;
    logToUi('🏁 Disparo finalizado');
    io.emit('status', { status: 'Campanha finalizada', sentCount, ready: true });
  });

  socket.on('stop', () => {
    if (isSending) {
      isSending = false;
      logToUi('⏹️ Campanha interrompida pelo usuário.');
      io.emit('status', { status: 'Interrompido', sentCount, ready: clientReady });
    }
  });
});

server.listen(port, () => {
  console.log(`🌐 Interface web disponível em http://localhost:${port}`);
});
