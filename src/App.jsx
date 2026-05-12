import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

function App() {
  const [botState, setBotState] = useState({
    status: 'Carregando...',
    sentCount: 0,
    ready: false,
    isSending: false,
    cooldownUntil: null,
    nextSendAt: null
  })
  const [qrSrc, setQrSrc] = useState(null)
  const [logs, setLogs] = useState([])
  const [message, setMessage] = useState('')
  const [message2, setMessage2] = useState('')
  const [message3, setMessage3] = useState('')
  const [contactInput, setContactInput] = useState('')
  const [contacts, setContacts] = useState([])
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('bot_access_token') || '')
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('bot_server_url') || import.meta.env.VITE_SOCKET_URL || '')
  const [now, setNow] = useState(() => Date.now())
  const socketRef = useRef(null)
  const logsContainerRef = useRef(null)

  useEffect(() => {
    const socketUrl = serverUrl ? serverUrl : undefined
    const token = accessToken || window.prompt('Chave de acesso do servidor (aparece no terminal do npm start):') || ''
    if (!token) {
      addLog('❌ Chave de acesso não informada. Não foi possível conectar.')
      return
    }
    if (token !== accessToken) {
      localStorage.setItem('bot_access_token', token)
      setAccessToken(token)
    }
    const socket = io(socketUrl, { path: '/socket.io', auth: { token } })
    socketRef.current = socket

    socket.on('connect', () => addLog('Conectado ao servidor.'))
    socket.on('connect_error', err => {
      const originLabel = socketUrl ? socketUrl : 'mesma origem'
      addLog(`❌ Falha ao conectar no servidor (${originLabel}): ${err.message}`)
    })
    socket.on('disconnect', reason => addLog(`⚠️ Desconectado: ${reason}`))

    socket.on('status', data => {
      setBotState({
        status: data.status,
        sentCount: data.sentCount,
        ready: data.ready,
        isSending: data.isSending,
        cooldownUntil: data.cooldownUntil ?? null,
        nextSendAt: data.nextSendAt ?? null
      })
    })

    socket.on('log', message => addLog(message))

    socket.on('qr', src => {
      setQrSrc(src)
    })

    return () => {
      socket.disconnect()
    }
  }, [accessToken, serverUrl])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = logsContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs])

  function normalizeContact(value) {
    return String(value || '').trim()
  }

  function addContact(value) {
    const normalized = normalizeContact(value)
    if (!normalized) return
    setContacts(prev => {
      if (prev.includes(normalized)) return prev
      return [...prev, normalized]
    })
  }

  function removeContact(value) {
    setContacts(prev => prev.filter(item => item !== value))
  }

  function addLog(message) {
    if (!message) return;
    const time = new Date().toLocaleTimeString()
    setLogs(prev => {
      if (prev.length > 0 && prev[prev.length - 1].text.includes(message)) return prev
      return [
        ...prev,
        { id: Math.random().toString(36).substr(2, 9), text: `${time} - ${message}` },
      ].slice(-50)
    })
  }

  function handleConnect() {
    addLog('Solicitando autenticação...')
    socketRef.current?.emit('connectWhatsApp')
  }

  function handleDisconnect() {
    if (window.confirm('Deseja apenas desconectar o WhatsApp atual?')) {
      socketRef.current?.emit('disconnectWhatsApp')
    }
  }

  function handleStart() {
    const numbers = contacts.length ? contacts.join('\n') : ''
    socketRef.current?.emit('start', { numbers, message, message2, message3 })
  }

  function handleStop() {
    socketRef.current?.emit('stop')
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const parts = [
      hours ? String(hours).padStart(2, '0') : null,
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].filter(Boolean)
    return parts.join(':')
  }

  const cooldownLeftMs = botState.cooldownUntil ? botState.cooldownUntil - now : 0
  const nextSendLeftMs = botState.nextSendAt ? botState.nextSendAt - now : 0
  const hasCooldown = cooldownLeftMs > 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Guedes AI</div>
          <div className="topbar-subtitle">Contatos para envio · adicione os números de WhatsApp e envie sua mensagem.</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" disabled>
            Importar da agenda
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const current = localStorage.getItem('bot_server_url') || ''
              const next = window.prompt('URL do servidor (ex: https://xxxx.trycloudflare.com). Deixe vazio para usar a mesma origem:', current) ?? current
              const normalized = String(next || '').trim()
              if (normalized) localStorage.setItem('bot_server_url', normalized)
              else localStorage.removeItem('bot_server_url')
              setServerUrl(normalized)
            }}
          >
            Trocar servidor
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const token = window.prompt('Nova chave de acesso do servidor:') || ''
              if (!token) return
              localStorage.setItem('bot_access_token', token)
              setAccessToken(token)
            }}
          >
            Trocar chave
          </button>
          {!botState.ready ? (
            <button className="btn btn-primary" onClick={handleConnect}>
              Autenticar WhatsApp
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleDisconnect}>
              Desconectar WP
            </button>
          )}
        </div>
        <div className="brandmark" aria-hidden="true">
          <img
            className="brandmark-img"
            src={`${import.meta.env.BASE_URL}BFR%202.png`}
            alt=""
          />
        </div>
      </header>

      <main className="layout">
        <section className="panel panel-left">
          <div className="panel-title">Adicionar número</div>
          <div className="add-row">
            <input
              className="input"
              value={contactInput}
              onChange={e => setContactInput(e.target.value)}
              placeholder="(11) 99999-9999"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addContact(contactInput)
                  setContactInput('')
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                addContact(contactInput)
                setContactInput('')
              }}
            >
              Adicionar
            </button>
          </div>

          <div className="hint-card">
            <div className="hint-title">Dica</div>
            <div className="hint-text">Adicione os números com código de área.</div>
            <div className="hint-text">Exemplo: (11) 99999-9999</div>
          </div>

          <div className="panel-title">Mensagem</div>
          <textarea
            className="textarea"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Digite a mensagem que será enviada..."
            rows={6}
          />

          <div className="panel-title">Mensagem 2 (após 6 contatos)</div>
          <textarea
            className="textarea"
            value={message2}
            onChange={e => setMessage2(e.target.value)}
            placeholder="Opcional: segunda variação da mensagem..."
            rows={6}
          />

          <div className="panel-title">Mensagem 3 (após 12 contatos)</div>
          <textarea
            className="textarea"
            value={message3}
            onChange={e => setMessage3(e.target.value)}
            placeholder="Opcional: terceira variação da mensagem..."
            rows={6}
          />

          <div className="status-mini">
            <div className="status-line">
              <span className="status-label">Status</span>
              <span className="status-value">{botState.status}</span>
            </div>
            <div className="status-line">
              <span className="status-label">Enviadas</span>
              <span className="status-value">{botState.sentCount}</span>
            </div>
          </div>
        </section>

        <section className="panel panel-center">
          <div className="panel-header">
            <div className="panel-title">Lista de contatos ({contacts.length})</div>
            <div className="panel-note">Somente número e status.</div>
          </div>

          <div className="table">
            <div className="table-head">
              <div>NÚMERO</div>
              <div className="table-status">STATUS</div>
              <div className="table-actions" />
            </div>
            <div className="table-body">
              {contacts.length ? (
                contacts.map(number => (
                  <div className="table-row" key={number}>
                    <div className="table-number">{number}</div>
                    <div className="table-status">
                      <span className={`badge ${botState.ready ? 'badge-ok' : 'badge-warn'}`}>
                        {botState.ready ? 'Pronto' : 'Aguardando'}
                      </span>
                    </div>
                    <div className="table-actions">
                      <button className="icon-btn" onClick={() => removeContact(number)} aria-label="Remover">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M9 3h6m-8 4h10m-9 0 1 16h6l1-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">
                  Nenhum contato adicionado ainda.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="panel panel-right">
          <div className="ready-card">
            <div className="ready-label">PRONTO PARA ENVIAR</div>
            <div className="plane">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none">
                <path d="M22 2 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="ready-count">{contacts.length} contatos</div>
          {hasCooldown ? (
            <div className="timer-pill timer-warn">
              Proteção ativa · aguarde {formatDuration(cooldownLeftMs)}
            </div>
          ) : null}
          {!hasCooldown && botState.isSending && nextSendLeftMs > 0 ? (
            <div className="timer-pill">
              Próximo envio em {formatDuration(nextSendLeftMs)}
            </div>
          ) : null}
            <button
              className="btn btn-primary btn-wide"
              onClick={handleStart}
            disabled={!botState.ready || botState.isSending || !contacts.length || hasCooldown}
            >
              {botState.isSending ? 'Enviando...' : 'Enviar mensagens'}
            </button>
            <button className="btn btn-danger btn-wide" onClick={handleStop} disabled={!botState.isSending}>
              Parar envio
            </button>
            <div className="ready-footnote">As mensagens serão enviadas via WhatsApp.</div>
          </div>

          <div className="qr-card">
            <div className="qr-title">QR Code</div>
            {qrSrc ? (
              <img className="qr-img" src={qrSrc} alt="QR Code do WhatsApp" />
            ) : (
              <div className="qr-placeholder">
                {botState.ready ? '✅ WhatsApp Conectado' : 'Aguardando geração do QR code...'}
              </div>
            )}
          </div>
        </section>
      </main>

      <section className="logs-panel">
        <div className="logs-title">Logs</div>
        <div className="logs" ref={logsContainerRef}>
          {logs.map(entry => (
            <div key={entry.id}>{entry.text}</div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
