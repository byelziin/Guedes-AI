function getGreeting() {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
        return "Bom dia";
    } else if (hour >= 12 && hour < 18) {
        return "Boa tarde";
    } else {
        return "Boa noite";
    }
}

function createMessage() {
    const saudacao = getGreeting();

    return {
        text: `${saudacao}, tudo bem?

Me chamo Gabriel, falo da BFR Investimentos, escritório do André Morais, parceiro da XP.

Notei que você acessou um dos nossos canais recentemente e quis entender melhor seu momento:
você está investindo, operando ou ainda estudando sobre o assunto?

Se fizer sentido, posso te ajudar com algumas informações ou direcionamentos 👍`
    };
}

module.exports = createMessage;