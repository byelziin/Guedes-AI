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

function createMessage(type = 1) {
    const saudacao = getGreeting();

    if (type === 2) {
        return {
            text: `${saudacao}, tudo bem?

Aqui é Gabriel da BFR Investimentos, escritório do André Morais, parceiro da XP.

Eu vi que você passou por um de nossos canais e queria entender seu momento: você já está investindo, operando ou ainda está estudando sobre o mercado?

Se quiser, posso te enviar algumas informações úteis e um direcionamento inicial 👍`
        };
    }

    if (type === 3) {
        return {
            text: `${saudacao}, tudo bem?

Sou Gabriel, da BFR Investimentos, parceiro do André Morais na XP.

Notei sua interação recente com nossos conteúdos e queria saber: você está focado em investimentos, trading ou ainda busca aprender mais antes de começar?

Se fizer sentido, posso te ajudar com algumas sugestões e caminhos para o seu perfil 👍`
        };
    }

    return {
        text: `${saudacao}, tudo bem?

Me chamo Gabriel, falo da BFR Investimentos, escritório do André Morais, parceiro da XP.

Notei que você acessou um dos nossos canais recentemente e quis entender melhor seu momento:
você está investindo, operando ou ainda estudando sobre o assunto?

Se fizer sentido, posso te ajudar com algumas informações ou direcionamentos 👍`
    };
}

module.exports = createMessage;