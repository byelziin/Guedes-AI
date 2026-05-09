import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

function App() {
  const [botState, setBotState] = useState({
    status: 'Carregando...',
    sentCount: 0,
    ready: false,
    isSending: false
  })
  const [qrSrc, setQrSrc] = useState(null)
  const [logs, setLogs] = useState([])
  const [numbers, setNumbers] = useState('')
  const [message, setMessage] = useState('')
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => addLog('Conectado ao servidor.'))

    socket.on('status', data => {
      setBotState({
        status: data.status,
        sentCount: data.sentCount,
        ready: data.ready,
        isSending: data.isSending
      })
    })

    socket.on('log', message => addLog(message))

    socket.on('qr', src => {
      setQrSrc(src)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  function addLog(message) {
    if (!message) return;
    const time = new Date().toLocaleTimeString()
    setLogs(prev => {
      if (prev.length > 0 && prev[0].text.includes(message)) return prev;
      return [
        { id: Math.random().toString(36).substr(2, 9), text: `${time} - ${message}` },
        ...prev,
      ].slice(0, 50)
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

  function handleResetSession() {
    if (window.confirm('ATENÇÃO: Isso irá DELETAR a pasta de sessão. Use apenas se o QR Code não aparecer ou se quiser trocar de conta permanentemente. Confirmar?')) {
      socketRef.current?.emit('resetSession')
    }
  }

  function handleStart() {
    socketRef.current?.emit('start', { numbers, message })
  }

  function handleStop() {
    socketRef.current?.emit('stop')
  }

  return (
    <div className="container">
      <h1>Bot Cris - Interface Web</h1>

      <div className="card status">
        <div>
          <strong>Status:</strong> <span>{botState.status}</span>
        </div>
        <div>
          <strong>Mensagens enviadas:</strong> <span>{botState.sentCount}</span>
        </div>
      </div>

      <div className="card qr-card">
        <strong>QR Code:</strong>
        {qrSrc ? (
          <img src={qrSrc} alt="QR Code do WhatsApp" />
        ) : (
          <div className="qr-placeholder">
            {botState.ready ? '✅ WhatsApp Conectado' : 'Aguardando geração do QR code...'}
          </div>
        )}
      </div>

      <div className="card">
        <strong>Números para envio</strong>
        <textarea
          value={numbers}
          onChange={e => setNumbers(e.target.value)}
          placeholder="5511999999999"
          rows="4"
        ></textarea>
      </div>

      <div className="card">
        <strong>Mensagem</strong>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Olá..."
          rows="4"
        ></textarea>
      </div>

      <div className="card actions">
        {!botState.ready ? (
          <button className="primary" onClick={handleConnect}>
            Autenticar WhatsApp
          </button>
        ) : (
          <button className="danger" onClick={handleDisconnect}>
            Desconectar WP
          </button>
        )}

        <button 
          className="primary" 
          onClick={handleStart} 
          disabled={!botState.ready || botState.isSending}
        >
          {botState.isSending ? 'Enviando...' : 'Iniciar envio'}
        </button>

        <button className="danger" onClick={handleStop} disabled={!botState.isSending}>
          Parar envio
        </button>

        <button className="secondary" onClick={handleResetSession}>
          Resetar Sessão (Deletar Pasta)
        </button>
      </div>

      <div className="card">
        <strong>Logs</strong>
        <div className="logs">
          {logs.map(entry => (
            <div key={entry.id}>{entry.text}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
