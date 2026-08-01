# Bot Cris

Uma interface web moderna para conectar o WhatsApp, autenticar com QR Code e disparar mensagens para contatos cadastrados com controle em tempo real.

## Visão geral

O Bot Cris combina um frontend em React com um backend em Node.js/Express + Socket.io para oferecer uma experiência simples e rápida para gerenciar envios via WhatsApp.

## ? Recursos principais

- ?? Autenticação do WhatsApp via QR Code
- ? Interface reativa construída com React + Vite
- ?? Comunicação em tempo real com Socket.io
- ?? Cadastro de contatos e mensagem personalizada
- ?? Logs em tempo real do fluxo do bot
- ?? Controle para iniciar e interromper envios
- ?? Geração automática de mensagens para campanhas

## ??? Requisitos

- Node.js 18 ou superior
- Google Chrome instalado no computador
- Windows (o projeto já está configurado para usar o Chrome local)

## ?? Instalação

Clone o projeto e instale as dependências:

```bash
npm install
```

## ?? Configuração

Você pode definir uma chave de acesso para a interface antes de iniciar o servidor:

```bash
$env:BOT_ACCESS_TOKEN="minha-chave"
```

Se nenhuma chave for definida, o servidor gera uma automaticamente.

## ?? Como executar

### 1. Inicie o frontend em modo desenvolvimento

```bash
npm run dev
```

A aplicação fica disponível em:

- http://localhost:5173

### 2. Em outro terminal, inicie o backend

```bash
npm start
```

O backend roda em:

- http://localhost:3000

Se você quiser acessar a interface a partir de outra máquina na mesma rede, ajuste o IP do host e a URL usada pelo frontend conforme sua rede.

> A interface pede a chave de acesso informada no terminal do backend para se conectar corretamente.

## ?? Estrutura do projeto

```text
+-- src/
¦   +-- App.jsx          # Tela principal da interface
¦   +-- main.jsx         # Entrada React
¦   +-- App.css          # Estilos da aplicação
¦   +-- index.css        # Estilos globais
+-- public/              # Arquivos públicos
+-- index.html           # HTML base do Vite
+-- server.js            # Backend Express + Socket.io + WhatsApp
+-- message.js           # Geração de mensagens
+-- numbers.js           # Lista de números padrão
+-- vite.config.js       # Configuração do Vite
+-- package.json         # Dependências e scripts
```

## ??? Build para produção

```bash
npm run build
```

A build será gerada na pasta `dist/` e o backend pode servir a aplicação pronta.

## ?? Variáveis de ambiente

- `BOT_ACCESS_TOKEN` ou `BOT_ACCESS_TOKENS`: define as chaves de acesso permitidas
- `PORT`: altera a porta do backend (padrão: 3000)
- `VITE_SOCKET_URL`: URL usada pelo frontend para conectar ao servidor Socket.io

## ?? Fluxo de uso

1. Abra a interface no navegador.
2. Informe a chave de acesso exibida no terminal do backend.
3. Clique em “Autenticar WhatsApp”.
4. Escaneie o QR Code no celular.
5. Adicione contatos e escreva a mensagem.
6. Inicie o envio e acompanhe os logs.

## ?? Contribuição

Contribuições são bem-vindas. Abra uma issue ou envie um pull request com sugestões e melhorias.
