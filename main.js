const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const numbers = require('./numbers');
const message = require('./message');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions'
        ]
    }
});

// Delay fixo
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Delay aleatório (ANTI BLOQUEIO)
const randomDelay = () =>
    Math.floor(Math.random() * 8000) + 7000; // 7–15s

// 🔥 FUNÇÃO QUE CORRIGE QUALQUER NÚMERO
function formatNumber(number) {
    let num = number.replace(/\D/g, '');

    // adiciona 55 se não tiver
    if (!num.startsWith('55')) {
        num = '55' + num;
    }

    let country = '55';
    let rest = num.slice(2);

    // valida tamanho
    if (rest.length < 10 || rest.length > 11) {
        return null;
    }

    // adiciona o 9 se for número antigo (10 dígitos)
    if (rest.length === 10) {
        rest = rest.slice(0, 2) + '9' + rest.slice(2);
    }

    return country + rest;
}

// QR CODE
client.on('qr', (qr) => {
    console.log('📲 Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });
});

// ERROS
client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', reason => {
    console.log('⚠️ Cliente desconectado:', reason);
});

// BOT PRONTO
client.on('ready', async () => {

    console.log('🚀 Bot pronto');

    let enviados = 0;

    for (const number of numbers) {

        const cleanNumber = formatNumber(number);

        if (!cleanNumber) {
            console.log(`⚠️ Número inválido ignorado: ${number}`);
            continue;
        }

        const chatId = cleanNumber + '@c.us';

        try {

            console.log(`📤 Enviando para ${cleanNumber}`);

            // verifica se existe no WhatsApp
            const isRegistered = await client.isRegisteredUser(chatId);

            if (!isRegistered) {
                console.log(`⚠️ Não existe no WhatsApp: ${cleanNumber}`);
                continue;
            }

            await delay(3000);

            await client.sendMessage(chatId, message.text);

            enviados++;

            console.log(`✅ Enviado (${enviados}/${numbers.length})`);

            await delay(randomDelay());

        } catch (err) {

            console.log(`❌ Erro no número ${cleanNumber}: ${err.message}`);

        }
    }

    console.log("🏁 Disparo finalizado");

});

client.initialize();