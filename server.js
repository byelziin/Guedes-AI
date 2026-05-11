const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const numbers = require('./numbers');
const createMessage = require('./message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const port = process.env.PORT || 3000;
let isSending = false;
let sentCount = 0;
let statusMessage = 'Aguardando autenticação...';
let client = null;
let clientInitializing = false;
let clientReady = false;

function createClient() {
  const newClient = new Client({
    authStrategy: new LocalAuth({ clientId: 'web-interface' }),
    puppeteer: {
      headless: false, // Voltado para false conforme solicitado
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-extensions']
    }
  });

  newClient.on('qr', async (qr) => {
    try {
      const url = await qrcode.toDataURL(qr);
      statusMessage = 'Aguardando escaneamento do QR code...';
      logToUi('📲 Novo QR code gerado. Escaneie pelo WhatsApp.');
      io.emit('qr', url);
      sendUpdate();
    } catch (err) {
      logToUi('❌ Erro ao gerar QR code: ' + err.message);
    }
  });

  newClient.on('ready', () => {
    statusMessage = 'Bot conectado e pronto.';
    clientReady = true;
    logToUi('🚀 Bot pronto');
    sendUpdate();
  });

  newClient.on('auth_failure', (msg) => {
    statusMessage = 'Falha na autenticação';
    logToUi(`❌ Falha na autenticação: ${msg}`);
    sendUpdate();
  });

  newClient.on('disconnected', (reason) => {
    statusMessage = 'Cliente desconectado';
    clientReady = false;
    logToUi(`⚠️ Cliente desconectado: ${reason}`);
    sendUpdate();
  });

  return newClient;
}

function sendUpdate() {
  io.emit('status', { 
    status: statusMessage, 
    sentCount, 
    ready: clientReady,
    isSending 
  });
}

async function initializeClient() {
  if (clientReady) {
    logToUi('⚠️ Cliente já está pronto.');
    return;
  }
  if (clientInitializing) {
    logToUi('⏳ Inicialização já em andamento...');
    return;
  }

  clientInitializing = true;
  statusMessage = 'Inicializando WhatsApp...';
  sendUpdate();
  logToUi('🔌 Inicializando cliente WhatsApp...');

  try {
    client = createClient();
    await client.initialize();
  } catch (err) {
    logToUi(`❌ Erro ao inicializar: ${err.message}`);
    client = null;
  } finally {
    clientInitializing = false;
  }
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
  return raw.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
}

function normalizeMessage(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function getMessageStyle(sentCount) {
  if (sentCount % 12 === 6) return 2;
  if (sentCount % 12 === 0) return 3;
  return 1;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => Math.floor(Math.random() * 8000) + 15000;

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
      } catch (e) { return false; }
    }
    return false;
  }
}

app.use(express.static('dist'));
app.use(express.static('public'));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/status', (req, res) => {
  res.json({ ready: clientReady, status: statusMessage, sentCount, isSending });
});

app.get('*', (req, res) => {
  if (req.path.includes('.')) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

io.on('connection', (socket) => {
  sendUpdate();
  
  socket.on('connectWhatsApp', async () => {
    await initializeClient();
  });

  socket.on('disconnectWhatsApp', async () => {
    logToUi('🔌 Desconectando WhatsApp...');
    if (client) {
      try {
        await client.destroy();
        client = null;
        clientReady = false;
        statusMessage = 'WhatsApp desconectado.';
        logToUi('✅ Desconectado com sucesso.');
        io.emit('qr', null);
        sendUpdate();
      } catch (err) {
        logToUi(`❌ Erro ao desconectar: ${err.message}`);
      }
    }
  });

  socket.on('resetSession', async () => {
    logToUi('♻️ Solicitando reset total de sessão...');
    try {
      if (client) {
        await client.destroy();
        client = null;
      }
      clientReady = false;
      clientInitializing = false;
      statusMessage = 'Sessão removida. Aguardando nova autenticação...';
      
      const authPath = path.join(__dirname, '.wwebjs_auth');
      if (fs.existsSync(authPath)) {
        logToUi('📂 Removendo arquivos de sessão...');
        await fs.promises.rm(authPath, { recursive: true, force: true });
        logToUi('✅ Arquivos removidos.');
      }
      
      io.emit('qr', null);
      sendUpdate();
    } catch (err) {
      logToUi(`❌ Erro no reset: ${err.message}`);
    }
  });

  socket.on('start', async (data) => {
    if (!clientReady || isSending) return;

    const rawNumbers = data?.numbers || '';
    const rawMessage = data?.message || '';
    const targetNumbers = rawNumbers.trim().length ? parseNumbers(rawNumbers) : numbers;
    const customMessage = normalizeMessage(rawMessage);

    if (!targetNumbers.length) {
      logToUi('⚠️ Nenhum número encontrado.');
      return;
    }

    isSending = true;
    sentCount = 0;
    logToUi('🚀 Iniciando envio...');
    sendUpdate();

    for (const number of targetNumbers) {
      if (!isSending) break;
      const cleanNumber = formatNumber(number);
      if (!cleanNumber) continue;
      
      const chatId = `${cleanNumber}@c.us`;
      try {
        const style = getMessageStyle(sentCount + 1);
        const messageText = customMessage.length ? customMessage : createMessage(style).text;
        
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
          logToUi(`⚠️ Não registrado: ${cleanNumber}`);
          continue;
        }

        await delay(3000);
        const ok = await safeSend(chatId, messageText);
        if (ok) {
          sentCount++;
          logToUi(`✅ Enviado para ${cleanNumber} (${sentCount}/${targetNumbers.length})`);
          sendUpdate();
        }
        await delay(randomDelay());
      } catch (err) {
        logToUi(`❌ Erro em ${cleanNumber}: ${err.message}`);
      }
    }

    isSending = false;
    statusMessage = 'Disparo finalizado.';
    logToUi('🏁 Fim do processo.');
    sendUpdate();
  });

  socket.on('stop', () => {
    isSending = false;
    logToUi('⏹️ Envio interrompido.');
    sendUpdate();
  });
});

server.listen(port, () => {
  console.log(`🌐 Servidor em http://localhost:${port}`);
});
