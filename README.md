# Bot Cris - Interface Web com React + Vite

Interface web moderna para gerenciar campanhas de disparo via WhatsApp.

## Instalação

```bash
npm install
```

## Desenvolvimento

Para rodar em desenvolvimento com hot-reload:

```bash
npm run dev
```

Isso inicia:
- **Vite dev server** em `http://localhost:5173` (com hot-reload)
- O servidor fica acessível via proxy Socket.io/status

Em outro terminal, inicie o servidor backend:

```bash
npm start
```

## Build para Produção

```bash
npm run build
```

Isso gera a build otimizada em `public/dist/`.

Para testar a build localmente:

```bash
npm start
```

Acesse em `http://localhost:3000`

## Estrutura

```
├── src/
│   ├── main.jsx       # Entry point do React
│   ├── App.jsx        # Componente principal
│   ├── index.css      # Estilos globais
│   └── App.css        # (vazio - estilos estão em index.css)
├── index.html         # Template HTML
├── vite.config.js     # Configuração do Vite
├── server.js          # Backend Express/Socket.io
├── message.js         # Gerador de mensagens
├── numbers.js         # Lista de números padrão
└── package.json
```

## Features

- ✅ Autenticação WhatsApp via QR code
- ✅ Interface reativa com React
- ✅ Comunicação em tempo real via Socket.io
- ✅ Campo customizável para números
- ✅ Campo customizável para mensagem
- ✅ Logs em tempo real
- ✅ Controle de campanha (iniciar/parar)

## Scripts

- `npm run dev` - Inicia Vite dev server
- `npm run build` - Build para produção
- `npm run preview` - Visualiza a build localmente
- `npm start` - Inicia o servidor backend
