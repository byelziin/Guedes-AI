const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const numbers = require('./numbers');
const message = require('./message');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

// Delay fixo
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Delay aleatório (ANTI BLOQUEIO)
const randomDelay = () =>
    Math.floor(Math.random() * 5000) + 5000; // 5–10s

client.on('qr', (qr) => {

    console.log('📲 Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });

});

client.on('ready', async () => {

    console.log('🚀 Bot pronto');

    let enviados = 0;

    for (const number of numbers) {

        const chatId =
            number.replace(/\D/g, '') + '@c.us';

        try {

            console.log(`📤 Enviando para ${number}`);

            await delay(3000);

            await client.sendMessage(
                chatId,
                message.text
            );

            enviados++;

            console.log(`✅ Enviado (${enviados}/${numbers.length})`);

            // Delay anti-bloqueio
            await delay(randomDelay());

        }

        catch (err) {

            console.log(
                `❌ Erro no número ${number}`
            );

        }

    }

    console.log("🏁 Disparo finalizado");

});

client.initialize();