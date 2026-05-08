import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

function App() {
  const [status, setStatus] = useState('Carregando...')
  const [sentCount, setSentCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [qrSrc, setQrSrc] = useState('Aguardando geração do QR code...')
  const [logs, setLogs] = useState([])
  const [numbers, setNumbers] = useState('')
  const [message, setMessage] = useState('')
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => addLog('Conectado ao servidor.'))

    socket.on('status', data => {
      setStatus(data.status)
      setSentCount(data.sentCount || 0)
      setReady(Boolean(data.ready))
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
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [
      { id: Date.now() + Math.random(), text: `${time} - ${message}` },
      ...prev,
    ].slice(0, 100))
  }

  function handleConnect() {
    addLog('Solicitando autenticação do WhatsApp...')
    socketRef.current?.emit('connectWhatsApp')
  }

  function handleStart() {
    addLog('Solicitando início da campanha...')
    socketRef.current?.emit('start', { numbers, message })
  }

  function handleStop() {
    addLog('Solicitando parada da campanha...')
    socketRef.current?.emit('stop')
  }

  async function handleRefresh() {
    try {
      const response = await fetch('/status')
      const data = await response.json()
      setStatus(data.status)
      setSentCount(data.sentCount || 0)
      setReady(Boolean(data.ready))
      addLog('Status atualizado.')
    } catch (err) {
      addLog('Erro ao atualizar status: ' + err.message)
    }
  }

  return (
    <div className="container">
      <h1>Bot Cris - Interface Web</h1>

      <div className="card status">
        <div>
          <strong>Status:</strong> <span>{status}</span>
        </div>
        <div>
          <strong>Mensagens enviadas:</strong> <span>{sentCount}</span>
        </div>
      </div>

      <div className="card qr-card">
        <strong>QR Code:</strong>
        {qrSrc && qrSrc.startsWith('data:image') ? (
          <img src={qrSrc} alt="QR Code do WhatsApp" />
        ) : (
          <div className="qr-placeholder">{qrSrc}</div>
        )}
        <small>Escaneie com o WhatsApp para conectar o bot.</small>
      </div>

      <div className="card">
        <strong>Números para envio</strong>
        <textarea
          value={numbers}
          onChange={e => setNumbers(e.target.value)}
          placeholder="Digite os números separados por linha ou vírgula. Ex: 5511999999999"
          rows="6"
        ></textarea>
        <small>
          Se vazio, será usada a lista padrão do arquivo <code>numbers.js</code>.
        </small>
      </div>

      <div className="card">
        <strong>Mensagem de disparo</strong>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Digite a mensagem que será enviada para todos os contatos"
          rows="6"
        ></textarea>
        <small>Se vazio, será usada a mensagem padrão do bot.</small>
      </div>

      <div className="card">
        <button className="primary" onClick={handleConnect} disabled={ready}>
          Autenticar WhatsApp
        </button>
        <button className="primary" onClick={handleStart} disabled={!ready && !numbers.trim() && !message.trim()}>
          Iniciar envio
        </button>
        <button className="danger" onClick={handleStop}>
          Parar envio
        </button>
        <button className="secondary" onClick={handleRefresh}>
          Atualizar status
        </button>
      </div>
      {!ready && (numbers.trim().length || message.trim().length) ? (
        <div className="note">
          Preencha os campos e clique em Iniciar para iniciar a autenticação do WhatsApp.
        </div>
      ) : null}

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
