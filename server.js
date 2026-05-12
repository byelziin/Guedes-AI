const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
function parseAllowedTokens() {
  const rawList = process.env.BOT_ACCESS_TOKENS || '';
  const rawSingle = process.env.BOT_ACCESS_TOKEN || '';
  const tokens = [];

  if (rawList.trim().length) tokens.push(...rawList.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean));
  if (rawSingle.trim().length) tokens.push(rawSingle.trim());

  const unique = [...new Set(tokens)];
  if (unique.length) return unique;
  return [crypto.randomBytes(16).toString('hex')];
}

function tokenToId(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 8);
}

const allowedTokens = parseAllowedTokens();
const allowedTokenSet = new Set(allowedTokens);
if (allowedTokens.length === 1) {
  console.log(`🔐 Chave de acesso da interface: ${allowedTokens[0]}`);
} else {
  console.log(`🔐 Chaves de acesso carregadas: ${allowedTokens.length}`);
  allowedTokens.forEach((t, idx) => console.log(`🔐 Chave ${idx + 1}: ${t}`));
}

io.use((socket, next) => {
  const token = socket.handshake?.auth?.token;
  const safeToken = String(token || '').trim();
  if (safeToken && allowedTokenSet.has(safeToken)) {
    socket.data.token = safeToken;
    return next();
  }
  next(new Error('unauthorized'));
});

const tenants = new Map();

function getTenant(token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;
  if (!allowedTokenSet.has(safeToken)) return null;
  const existing = tenants.get(safeToken);
  if (existing) return existing;

  const id = tokenToId(safeToken);
  const tenant = {
    token: safeToken,
    id,
    clientId: `web-interface-${id}`,
    client: null,
    initializing: false,
    ready: false,
    isSending: false,
    sentCount: 0,
    statusMessage: 'Aguardando autenticação...',
  };
  tenants.set(safeToken, tenant);
  return tenant;
}

function logToUi(tenant, message) {
  console.log(`[${tenant.id}] ${message}`);
  io.to(tenant.token).emit('log', message);
}

function sendUpdate(tenant) {
  io.to(tenant.token).emit('status', {
    status: tenant.statusMessage,
    sentCount: tenant.sentCount,
    ready: tenant.ready,
    isSending: tenant.isSending,
  });
}

function createClient(tenant) {
  const newClient = new Client({
    authStrategy: new LocalAuth({ clientId: tenant.clientId }),
    puppeteer: {
      headless: false,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-extensions'],
    },
  });

  newClient.on('qr', async (qr) => {
    try {
      const url = await qrcode.toDataURL(qr);
      tenant.statusMessage = 'Aguardando escaneamento do QR code...';
      logToUi(tenant, '📲 Novo QR code gerado. Escaneie pelo WhatsApp.');
      io.to(tenant.token).emit('qr', url);
      sendUpdate(tenant);
    } catch (err) {
      logToUi(tenant, '❌ Erro ao gerar QR code: ' + err.message);
    }
  });

  newClient.on('ready', () => {
    tenant.statusMessage = 'Bot conectado e pronto.';
    tenant.ready = true;
    logToUi(tenant, '🚀 Bot pronto');
    sendUpdate(tenant);
  });

  newClient.on('auth_failure', (msg) => {
    tenant.statusMessage = 'Falha na autenticação';
    logToUi(tenant, `❌ Falha na autenticação: ${msg}`);
    sendUpdate(tenant);
  });

  newClient.on('disconnected', (reason) => {
    tenant.statusMessage = 'Cliente desconectado';
    tenant.ready = false;
    logToUi(tenant, `⚠️ Cliente desconectado: ${reason}`);
    sendUpdate(tenant);
  });

  return newClient;
}

async function initializeClient(tenant) {
  if (tenant.ready) {
    logToUi(tenant, '⚠️ Cliente já está pronto.');
    return;
  }
  if (tenant.initializing) {
    logToUi(tenant, '⏳ Inicialização já em andamento...');
    return;
  }

  tenant.initializing = true;
  tenant.statusMessage = 'Inicializando WhatsApp...';
  sendUpdate(tenant);
  logToUi(tenant, '🔌 Inicializando cliente WhatsApp...');

  try {
    tenant.client = createClient(tenant);
    await tenant.client.initialize();
  } catch (err) {
    logToUi(tenant, `❌ Erro ao inicializar: ${err.message}`);
    tenant.client = null;
  } finally {
    tenant.initializing = false;
  }
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

function getMessageStyleByContactIndex(contactIndex) {
  const chunkSize = 6;
  const variantCount = 3;
  return (Math.floor(contactIndex / chunkSize) % variantCount) + 1;
}

function buildCustomMessages(data) {
  const raw1 = data?.message || '';
  const raw2 = data?.message2 || '';
  const raw3 = data?.message3 || '';

  const m1 = normalizeMessage(raw1);
  const m2 = normalizeMessage(raw2);
  const m3 = normalizeMessage(raw3);

  const anyCustom = Boolean(m1.length || m2.length || m3.length);
  if (!anyCustom) return null;

  const fallback = m1 || m2 || m3;
  return [m1 || fallback, m2 || fallback, m3 || fallback];
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => Math.floor(Math.random() * 8000) + 15000;

async function safeSend(client, chatId, text) {
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
  const token = (req.query?.token || req.get('x-bot-token') || '').toString().trim();
  const effectiveToken = token.length ? token : (allowedTokens.length === 1 ? allowedTokens[0] : '');
  const tenant = getTenant(effectiveToken);
  if (!tenant) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    ready: tenant.ready,
    status: tenant.statusMessage,
    sentCount: tenant.sentCount,
    isSending: tenant.isSending,
  });
});

app.get('*', (req, res) => {
  if (req.path.includes('.')) return res.status(404).send('Not found');
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res
      .status(200)
      .send('Backend rodando. Frontend não foi buildado (rode: npm run build).');
  }
  res.sendFile(indexPath);
});

io.on('connection', (socket) => {
  const token = socket.data?.token;
  const tenant = getTenant(token);
  if (!tenant) {
    socket.disconnect(true);
    return;
  }

  socket.join(tenant.token);
  sendUpdate(tenant);

  socket.on('connectWhatsApp', async () => {
    await initializeClient(tenant);
  });

  socket.on('disconnectWhatsApp', async () => {
    logToUi(tenant, '🔌 Desconectando WhatsApp...');
    if (tenant.client) {
      try {
        await tenant.client.destroy();
        tenant.client = null;
        tenant.ready = false;
        tenant.statusMessage = 'WhatsApp desconectado.';
        logToUi(tenant, '✅ Desconectado com sucesso.');
        io.to(tenant.token).emit('qr', null);
        sendUpdate(tenant);
      } catch (err) {
        logToUi(tenant, `❌ Erro ao desconectar: ${err.message}`);
      }
    }
  });

  socket.on('resetSession', async () => {
    logToUi(tenant, '♻️ Solicitando reset total de sessão...');
    try {
      if (tenant.client) {
        await tenant.client.destroy();
        tenant.client = null;
      }
      tenant.ready = false;
      tenant.initializing = false;
      tenant.statusMessage = 'Sessão removida. Aguardando nova autenticação...';
      
      const authPath = path.join(__dirname, '.wwebjs_auth', `session-${tenant.clientId}`);
      if (fs.existsSync(authPath)) {
        logToUi(tenant, '📂 Removendo arquivos de sessão...');
        await fs.promises.rm(authPath, { recursive: true, force: true });
        logToUi(tenant, '✅ Arquivos removidos.');
      }
      
      io.to(tenant.token).emit('qr', null);
      sendUpdate(tenant);
    } catch (err) {
      logToUi(tenant, `❌ Erro no reset: ${err.message}`);
    }
  });

  socket.on('start', async (data) => {
    if (!tenant.ready || tenant.isSending || !tenant.client) return;

    const rawNumbers = data?.numbers || '';
    const targetNumbers = rawNumbers.trim().length ? parseNumbers(rawNumbers) : numbers;
    const customMessages = buildCustomMessages(data);

    if (!targetNumbers.length) {
      logToUi(tenant, '⚠️ Nenhum número encontrado.');
      return;
    }

    tenant.isSending = true;
    tenant.sentCount = 0;
    logToUi(tenant, '🚀 Iniciando envio...');
    sendUpdate(tenant);

    for (let idx = 0; idx < targetNumbers.length; idx++) {
      if (!tenant.isSending) break;
      const number = targetNumbers[idx];
      const cleanNumber = formatNumber(number);
      if (!cleanNumber) continue;
      
      const chatId = `${cleanNumber}@c.us`;
      try {
        const style = getMessageStyleByContactIndex(idx);
        const messageText = customMessages ? customMessages[style - 1] : createMessage(style).text;
        
        const isRegistered = await tenant.client.isRegisteredUser(chatId);
        if (!isRegistered) {
          logToUi(tenant, `⚠️ Não registrado: ${cleanNumber}`);
          continue;
        }

        await delay(3000);
        const ok = await safeSend(tenant.client, chatId, messageText);
        if (ok) {
          tenant.sentCount++;
          logToUi(tenant, `✅ Enviado para ${cleanNumber} (${tenant.sentCount}/${targetNumbers.length})`);
          sendUpdate(tenant);
        }
        await delay(randomDelay());
      } catch (err) {
        logToUi(tenant, `❌ Erro em ${cleanNumber}: ${err.message}`);
      }
    }

    tenant.isSending = false;
    tenant.statusMessage = 'Disparo finalizado.';
    logToUi(tenant, '🏁 Fim do processo.');
    sendUpdate(tenant);
  });

  socket.on('stop', () => {
    tenant.isSending = false;
    logToUi(tenant, '⏹️ Envio interrompido.');
    sendUpdate(tenant);
  });
});

server.listen(port, () => {
  console.log(`🌐 Servidor em http://localhost:${port}`);
});
