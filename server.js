const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  try {
    fs.copyFileSync(envExamplePath, envPath);
  } catch (e) { }
}
dotenv.config({ path: envPath });
const { Server } = require('socket.io');
const qrcode = require('qrcode');

const numbers = require('./numbers');

const EVOLUTION_API_URL = String(process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const EVOLUTION_API_KEY = String(process.env.EVOLUTION_API_KEY || process.env.API_KEY || '').trim();
const CHATWOOT_URL = String(process.env.CHATWOOT_URL || 'https://app.chatwoot.com').replace(/\/+$/, '');
const CHATWOOT_ACCOUNT_ID = String(process.env.CHATWOOT_ACCOUNT_ID || '').trim();
const CHATWOOT_TOKEN = String(process.env.CHATWOOT_API_TOKEN || process.env.CHATWOOT_TOKEN || '').trim();

const app = express();
app.use(express.json({ limit: '1mb' }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const port = process.env.PORT || 3000;
function parseEnvInt(name, fallback) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw.length) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function parseEnvBool(name, fallback) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw.length) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

const SEND_LIMITS = {
  maxPerRun: parseEnvInt('BOT_MAX_PER_RUN', 0),
  maxPerHour: parseEnvInt('BOT_MAX_PER_HOUR', 0),
  maxPerDay: parseEnvInt('BOT_MAX_PER_DAY', 0),
};

const SEND_THROTTLE = {
  perContactDelayMs: parseEnvInt('BOT_DELAY_MS', 60000),
  perContactJitterMs: parseEnvInt('BOT_DELAY_JITTER_MS', 5000),
  breakEvery: parseEnvInt('BOT_BREAK_EVERY', 0),
  breakDelayMs: parseEnvInt('BOT_BREAK_MS', 0),
};

function pruneTimestamps(timestamps, cutoffMs) {
  const out = [];
  for (const ts of timestamps) {
    if (typeof ts === 'number' && ts >= cutoffMs) out.push(ts);
  }
  return out;
}

function checkSendLimits(tenant) {
  const now = Date.now();
  const hourCutoff = now - 60 * 60 * 1000;
  const dayCutoff = now - 24 * 60 * 60 * 1000;

  tenant.sendTimestamps = pruneTimestamps(tenant.sendTimestamps || [], dayCutoff);
  const hourCount = tenant.sendTimestamps.filter(ts => ts >= hourCutoff).length;
  const dayCount = tenant.sendTimestamps.length;

  if (SEND_LIMITS.maxPerHour > 0 && hourCount >= SEND_LIMITS.maxPerHour) {
    const inHour = tenant.sendTimestamps.filter(ts => ts >= hourCutoff);
    const oldest = inHour.length ? Math.min(...inHour) : now;
    const waitMs = Math.max(0, oldest + 60 * 60 * 1000 - now);
    return { ok: false, reason: `Limite por hora atingido (${hourCount}/${SEND_LIMITS.maxPerHour}).`, waitMs };
  }
  if (SEND_LIMITS.maxPerDay > 0 && dayCount >= SEND_LIMITS.maxPerDay) {
    const oldest = dayCount ? Math.min(...tenant.sendTimestamps) : now;
    const waitMs = Math.max(0, oldest + 24 * 60 * 60 * 1000 - now);
    return { ok: false, reason: `Limite por dia atingido (${dayCount}/${SEND_LIMITS.maxPerDay}).`, waitMs };
  }
  return { ok: true };
}

function upsertEnvVar(filePath, key, value) {
  const lineValue = `${key}=${value}`;
  let contents = '';
  try {
    if (fs.existsSync(filePath)) contents = fs.readFileSync(filePath, 'utf8');
  } catch (e) { }

  const lines = contents.length ? contents.split(/\r?\n/) : [];
  const matcher = new RegExp(`^\\s*${key}\\s*=`);
  let replaced = false;
  const updated = lines.map((line) => {
    if (matcher.test(line)) {
      replaced = true;
      return lineValue;
    }
    return line;
  });

  if (!replaced) updated.push(lineValue);
  const finalText = updated.filter(Boolean).join('\n') + '\n';

  try {
    fs.writeFileSync(filePath, finalText, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function parseAllowedTokens() {
  const rawList = process.env.BOT_ACCESS_TOKENS || '';
  const rawSingle = process.env.BOT_ACCESS_TOKEN || '';
  const tokens = [];

  if (rawList.trim().length) tokens.push(...rawList.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean));
  if (rawSingle.trim().length) tokens.push(rawSingle.trim());

  const unique = [...new Set(tokens)];
  if (unique.length) return unique;

  const count = Math.max(1, parseEnvInt('BOT_ACCESS_TOKEN_COUNT', 4));
  const generated = Array.from({ length: count }, () => crypto.randomBytes(16).toString('hex'));
  const persist = parseEnvBool('BOT_PERSIST_TOKENS', true);
  if (persist) {
    const joined = generated.join(',');
    const saved = upsertEnvVar(envPath, 'BOT_ACCESS_TOKENS', joined);
    if (saved) {
      process.env.BOT_ACCESS_TOKENS = joined;
      console.log('Chaves de acesso geradas e salvas no .env');
    } else {
      console.log('Chaves de acesso geradas, mas não foi possível salvar no .env');
    }
  }

  return generated;
}

function tokenToId(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 8);
}

const allowedTokens = parseAllowedTokens();
const allowedTokenSet = new Set(allowedTokens);
if (allowedTokens.length === 1) {
  console.log(`Chave de acesso da interface: ${allowedTokens[0]}`);
  console.log(`ACCESS_TOKEN=${allowedTokens[0]}`);
} else {
  console.log(`Chaves de acesso carregadas: ${allowedTokens.length}`);
  allowedTokens.forEach((t, idx) => {
    console.log(`Chave ${idx + 1}: ${t}`);
    console.log(`ACCESS_TOKEN_${idx + 1}=${t}`);
  });
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
    instanceName: `tenant-${id}`,
    initializing: false,
    ready: false,
    isSending: false,
    sentCount: 0,
    sendTimestamps: [],
    cooldownUntil: null,
    nextSendAt: null,
    statusMessage: 'Aguardando autenticação...',
    statePoller: null,
    qrPoller: null,
    qrAttempts: 0,
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
    cooldownUntil: tenant.cooldownUntil,
    nextSendAt: tenant.nextSendAt,
  });
}

async function evolutionRequest(method, pathname, body) {
  if (!EVOLUTION_API_KEY) throw new Error('Evolution API key não configurada (EVOLUTION_API_KEY).');
  const url = `${EVOLUTION_API_URL}${pathname}`;
  const headers = { apikey: EVOLUTION_API_KEY };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const options = { method, headers, signal: controller.signal };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      const message = (() => {
        if (typeof payload === 'string') return payload;
        const responseMessage = payload?.response?.message;
        if (Array.isArray(responseMessage) && responseMessage.length) return String(responseMessage[0]);
        if (typeof responseMessage === 'string' && responseMessage.length) return responseMessage;
        if (typeof payload?.message === 'string' && payload.message.length) return payload.message;
        if (typeof payload?.error === 'string' && payload.error.length) return payload.error;
        return `HTTP ${res.status}`;
      })();
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return payload;
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('Timeout ao chamar Evolution API.');
      err.status = 408;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function ensureEvolutionInstance(tenant) {
  const body = {
    instanceName: tenant.instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  };

  try {
    const payload = await evolutionRequest('POST', '/instance/create', body);
    const qr =
      payload?.qrcode?.base64 ||
      payload?.qrcode?.code ||
      payload?.base64 ||
      payload?.code ||
      payload?.result?.qrcode?.base64 ||
      payload?.result?.qrcode?.code ||
      payload?.result?.base64 ||
      payload?.result?.code ||
      null;
    return qr;
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.status === 409) return;
    if (err?.status === 403 && msg.includes('already in use')) return;
    throw err;
  }
}

async function configureChatwoot(tenant) {
  if (!CHATWOOT_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_TOKEN) return;
  const body = {
    enabled: true,
    accountId: CHATWOOT_ACCOUNT_ID,
    token: CHATWOOT_TOKEN,
    url: CHATWOOT_URL,
    signMsg: true,
    reopenConversation: true,
    conversationPending: false,
    nameInbox: tenant.instanceName,
    mergeBrazilContacts: true,
    importContacts: true,
    importMessages: true,
    daysLimitImportMessages: 3,
    autoCreate: true,
    organization: 'Guedes AI',
  };
  await evolutionRequest('POST', `/chatwoot/set/${encodeURIComponent(tenant.instanceName)}`, body);
}

async function fetchEvolutionQr(tenant) {
  const payload = await evolutionRequest('GET', `/instance/connect/${encodeURIComponent(tenant.instanceName)}`);
  const base64 = (() => {
    const direct = payload?.base64 || payload?.qrcode?.base64 || payload?.result?.base64 || payload?.result?.qrcode?.base64;
    return typeof direct === 'string' ? direct : '';
  })();
  if (base64.length) {
    if (base64.startsWith('data:image')) return base64;
    return `data:image/png;base64,${base64}`;
  }
  const code = (() => {
    const direct = payload?.code || payload?.qrcode?.code || payload?.result?.code || payload?.result?.qrcode?.code;
    return typeof direct === 'string' ? direct : '';
  })();
  if (!code.length) return null;
  return await qrcode.toDataURL(code);
}

async function getEvolutionConnectionState(tenant) {
  const payload = await evolutionRequest('GET', `/instance/connectionState/${encodeURIComponent(tenant.instanceName)}`);
  const state = payload?.instance?.state || payload?.state || '';
  return String(state);
}

function stopTenantPoller(tenant) {
  if (tenant.statePoller) clearInterval(tenant.statePoller);
  tenant.statePoller = null;
}

function stopTenantQrPoller(tenant) {
  if (tenant.qrPoller) clearInterval(tenant.qrPoller);
  tenant.qrPoller = null;
  tenant.qrAttempts = 0;
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

  if (!EVOLUTION_API_KEY) {
    logToUi(tenant, '❌ Evolution API não configurada. Defina EVOLUTION_API_KEY no .env.');
    tenant.statusMessage = 'Evolution API não configurada.';
    sendUpdate(tenant);
    return;
  }

  tenant.initializing = true;
  tenant.statusMessage = 'Inicializando Evolution API...';
  sendUpdate(tenant);
  logToUi(tenant, '🔌 Inicializando instância na Evolution API...');

  try {
    const createdQr = await ensureEvolutionInstance(tenant);
    if (CHATWOOT_URL && CHATWOOT_ACCOUNT_ID && CHATWOOT_TOKEN) {
      try {
        await configureChatwoot(tenant);
        logToUi(tenant, '✅ Chatwoot configurado.');
      } catch (e) {
        logToUi(tenant, `❌ Erro ao configurar Chatwoot: ${e.message}`);
        tenant.statusMessage = 'Falha ao configurar Chatwoot.';
        sendUpdate(tenant);
        return;
      }
    }
    let qr = null;
    if (createdQr) {
      if (String(createdQr).startsWith('data:image')) qr = createdQr;
      else if (String(createdQr).length > 50) qr = `data:image/png;base64,${createdQr}`;
      else qr = await qrcode.toDataURL(String(createdQr));
    } else {
      qr = await fetchEvolutionQr(tenant);
    }
    if (qr) {
      tenant.statusMessage = 'Aguardando escaneamento do QR code...';
      io.to(tenant.token).emit('qr', qr);
      sendUpdate(tenant);
      logToUi(tenant, '📲 QR code gerado. Escaneie pelo WhatsApp.');
    } else {
      tenant.statusMessage = 'Aguardando QR code...';
      sendUpdate(tenant);
      logToUi(tenant, '⚠️ Evolution não retornou QR code (instância pode estar conectando).');
    }

    stopTenantPoller(tenant);
    stopTenantQrPoller(tenant);
    tenant.statePoller = setInterval(async () => {
      try {
        const state = await getEvolutionConnectionState(tenant);
        if (state === 'open') {
          stopTenantPoller(tenant);
          stopTenantQrPoller(tenant);
          tenant.ready = true;
          tenant.statusMessage = 'Bot conectado e pronto.';
          io.to(tenant.token).emit('qr', null);
          sendUpdate(tenant);
          logToUi(tenant, '🚀 Bot pronto');
        }
      } catch (e) { }
    }, 2500);

    if (!qr) {
      tenant.qrPoller = setInterval(async () => {
        if (tenant.ready) {
          stopTenantQrPoller(tenant);
          return;
        }
        tenant.qrAttempts += 1;
        if (tenant.qrAttempts > 40) {
          stopTenantQrPoller(tenant);
          logToUi(tenant, '⚠️ QR code não apareceu. Tente clicar em "Autenticar WhatsApp" novamente.');
          return;
        }
        try {
          const nextQr = await fetchEvolutionQr(tenant);
          if (!nextQr) return;
          stopTenantQrPoller(tenant);
          tenant.statusMessage = 'Aguardando escaneamento do QR code...';
          io.to(tenant.token).emit('qr', nextQr);
          sendUpdate(tenant);
          logToUi(tenant, '📲 QR code gerado. Escaneie pelo WhatsApp.');
        } catch (e) { }
      }, 2000);
    }
  } catch (err) {
    logToUi(tenant, `❌ Erro ao inicializar Evolution: ${err.message}`);
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

  if (!m1.length) return null;
  return [m1, m2 || m1, m3 || m1];
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isFatalEvolutionError(err) {
  const status = Number(err?.status || 0);
  if (status === 401 || status === 403 || status === 404) return true;
  const message = String(err?.message || err || '');
  return (
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT')
  );
}

async function sendEvolutionText(tenant, number, text) {
  await evolutionRequest('POST', `/message/sendText/${encodeURIComponent(tenant.instanceName)}`, { number, text });
  return true;
}

async function logoutEvolutionInstance(tenant) {
  try {
    await evolutionRequest('DELETE', `/instance/logout/${encodeURIComponent(tenant.instanceName)}`);
  } catch (e) { }
}

async function deleteEvolutionInstance(tenant) {
  try {
    await evolutionRequest('DELETE', `/instance/delete/${encodeURIComponent(tenant.instanceName)}`);
  } catch (e) { }
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
    cooldownUntil: tenant.cooldownUntil,
    nextSendAt: tenant.nextSendAt,
  });
});

app.post('/admin/disconnect', async (req, res) => {
  const remote = String(req.socket?.remoteAddress || '');
  const isLocal = remote === '127.0.0.1' || remote === '::1' || remote.endsWith('127.0.0.1');
  if (!isLocal) return res.status(403).json({ error: 'forbidden' });

  const authToken = (req.get('x-bot-token') || req.query?.token || req.body?.token || '').toString().trim();
  const effectiveAuth = authToken.length ? authToken : (allowedTokens.length === 1 ? allowedTokens[0] : '');
  if (!effectiveAuth.length || !allowedTokenSet.has(effectiveAuth)) return res.status(401).json({ error: 'unauthorized' });

  const requestedTokens = req.body?.tokens;
  let tokens = [];
  if (Array.isArray(requestedTokens)) {
    tokens = requestedTokens.map(t => String(t || '').trim()).filter(Boolean);
  } else if (typeof requestedTokens === 'string') {
    tokens = requestedTokens.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
  } else {
    tokens = allowedTokens.slice();
  }

  const uniqueTokens = [...new Set(tokens)].filter(t => allowedTokenSet.has(t));
  const results = [];
  for (const token of uniqueTokens) {
    let count = 0;
    try {
      const sockets = await io.in(token).fetchSockets();
      count = sockets.length;
    } catch (e) { }
    try {
      io.in(token).disconnectSockets(true);
    } catch (e) { }
    results.push({ tokenId: tokenToId(token), disconnected: count });
  }

  res.json({ ok: true, results });
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
    try {
      stopTenantPoller(tenant);
      stopTenantQrPoller(tenant);
      await logoutEvolutionInstance(tenant);
      tenant.ready = false;
      tenant.statusMessage = 'WhatsApp desconectado.';
      logToUi(tenant, '✅ Desconectado com sucesso.');
      io.to(tenant.token).emit('qr', null);
      sendUpdate(tenant);
    } catch (err) {
      logToUi(tenant, `❌ Erro ao desconectar: ${err.message}`);
    }
  });

  socket.on('resetSession', async () => {
    logToUi(tenant, '♻️ Solicitando reset total de sessão...');
    try {
      stopTenantPoller(tenant);
      stopTenantQrPoller(tenant);
      await logoutEvolutionInstance(tenant);
      await deleteEvolutionInstance(tenant);
      tenant.ready = false;
      tenant.initializing = false;
      tenant.statusMessage = 'Sessão removida. Aguardando nova autenticação...';
      
      io.to(tenant.token).emit('qr', null);
      sendUpdate(tenant);
    } catch (err) {
      logToUi(tenant, `❌ Erro no reset: ${err.message}`);
    }
  });

  socket.on('start', async (data) => {
    if (!tenant.ready || tenant.isSending || !tenant.instanceName) return;

    const now = Date.now();
    if (tenant.cooldownUntil && tenant.cooldownUntil > now) {
      tenant.statusMessage = 'Aguardando cooldown de proteção antes de iniciar.';
      sendUpdate(tenant);
      logToUi(tenant, '🛑 Proteção ativa: aguarde o cooldown antes de iniciar outro disparo.');
      return;
    }

    const beforeStartLimit = checkSendLimits(tenant);
    if (!beforeStartLimit.ok) {
      const waitMs = Math.max(0, beforeStartLimit.waitMs || 0);
      tenant.cooldownUntil = Date.now() + waitMs;
      tenant.statusMessage = `Proteção ativa: ${beforeStartLimit.reason}`;
      sendUpdate(tenant);
      logToUi(tenant, `🛑 Proteção ativa: ${beforeStartLimit.reason}`);
      return;
    }

    const rawNumbers = data?.numbers || '';
    const parsedNumbers = rawNumbers.trim().length ? parseNumbers(rawNumbers) : numbers;
    const customMessages = buildCustomMessages(data);
    if (!customMessages) {
      logToUi(tenant, '⚠️ Mensagem obrigatória. Preencha a mensagem no site para liberar o envio.');
      return;
    }

    if (!parsedNumbers.length) {
      logToUi(tenant, '⚠️ Nenhum número encontrado.');
      return;
    }

    const maxPerRun = SEND_LIMITS.maxPerRun > 0 ? SEND_LIMITS.maxPerRun : 0;
    const targetNumbers = maxPerRun > 0 ? parsedNumbers.slice(0, maxPerRun) : parsedNumbers;
    if (maxPerRun > 0 && parsedNumbers.length > targetNumbers.length) {
      logToUi(tenant, `🛡️ Proteção ativa: reduzindo disparo para ${targetNumbers.length} contatos (de ${parsedNumbers.length}).`);
      logToUi(tenant, '🛡️ Para envio em larga escala com menor risco, use a API oficial do WhatsApp Business (Meta).');
    }

    tenant.isSending = true;
    tenant.sentCount = 0;
    tenant.cooldownUntil = null;
    tenant.nextSendAt = null;
    logToUi(tenant, '🚀 Iniciando envio...');
    sendUpdate(tenant);

    let fatalError = null;
    for (let idx = 0; idx < targetNumbers.length; idx++) {
      if (!tenant.isSending) break;
      const number = targetNumbers[idx];
      const cleanNumber = formatNumber(number);
      if (!cleanNumber) continue;
      
      try {
        const style = getMessageStyleByContactIndex(idx);
        const messageText = customMessages[style - 1];

        const limitCheck = checkSendLimits(tenant);
        if (!limitCheck.ok) {
          const waitMs = Math.max(0, limitCheck.waitMs || 0);
          tenant.cooldownUntil = Date.now() + waitMs;
          tenant.statusMessage = `Proteção ativa: ${limitCheck.reason}`;
          sendUpdate(tenant);
          logToUi(tenant, `🛑 Envio pausado por proteção: ${limitCheck.reason}`);
          break;
        }

        await delay(3000);
        const ok = await sendEvolutionText(tenant, cleanNumber, messageText);
        if (ok) {
          tenant.sentCount++;
          tenant.sendTimestamps.push(Date.now());
          logToUi(tenant, `✅ Enviado para ${cleanNumber} (${tenant.sentCount}/${targetNumbers.length})`);
          sendUpdate(tenant);
        }

        const isLast = idx === targetNumbers.length - 1;
        if (isLast) continue;

        const breakEvery = Math.max(0, SEND_THROTTLE.breakEvery || 0);
        const breakDelayMs = Math.max(0, SEND_THROTTLE.breakDelayMs || 0);
        if (breakEvery > 0 && breakDelayMs > 0 && (idx + 1) % breakEvery === 0) {
          tenant.cooldownUntil = Date.now() + breakDelayMs;
          tenant.nextSendAt = null;
          tenant.statusMessage = 'Pausa de proteção em andamento.';
          sendUpdate(tenant);
          logToUi(tenant, '⏸️ Pausa de proteção iniciada.');
          while (tenant.isSending && tenant.cooldownUntil && Date.now() < tenant.cooldownUntil) {
            await delay(1000);
          }
          if (!tenant.isSending) break;
          tenant.cooldownUntil = null;
          tenant.statusMessage = 'Retomando envio...';
          sendUpdate(tenant);
          continue;
        }

        const baseDelayMs = Math.max(0, SEND_THROTTLE.perContactDelayMs || 0);
        const jitterMs = Math.max(0, SEND_THROTTLE.perContactJitterMs || 0);
        const perDelayMs = baseDelayMs + (jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0);
        tenant.nextSendAt = Date.now() + perDelayMs;
        sendUpdate(tenant);
        await delay(perDelayMs);
      } catch (err) {
        if (isFatalEvolutionError(err)) {
          fatalError = err;
          break;
        }
        const msg = String(err?.message || err || '');
        logToUi(tenant, `❌ Erro em ${cleanNumber}: ${msg}`);
        await delay(1500);
      }
    }

    tenant.isSending = false;
    tenant.cooldownUntil = null;
    tenant.nextSendAt = null;
    if (fatalError) {
      tenant.ready = false;
      tenant.statusMessage = 'Evolution perdeu a conexão. Autentique novamente.';
      logToUi(tenant, `🛑 Envio interrompido: ${fatalError.message}`);
      io.to(tenant.token).emit('qr', null);
      sendUpdate(tenant);
      return;
    }

    tenant.statusMessage = 'Disparo finalizado.';
    logToUi(tenant, '🏁 Fim do processo.');
    sendUpdate(tenant);
  });

  socket.on('stop', () => {
    tenant.isSending = false;
    tenant.cooldownUntil = null;
    tenant.nextSendAt = null;
    logToUi(tenant, '⏹️ Envio interrompido.');
    sendUpdate(tenant);
  });
});

server.listen(port, () => {
  console.log(`Servidor em http://localhost:${port}`);
});
