import { useEffect, useRef, useState } from 'react'
import './App.css'

const NAME_MAX = 40
const MESSAGE_MAX = 500

const CONNECT_ERROR = '서버에 연결할 수 없어요. 잠시 뒤에 다시 시도해 주세요.'

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function formatTime(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR')
}

function App() {
  const [name, setName] = useState('')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sendingRef = useRef(false)

  async function loadEntries() {
    try {
      const response = await fetch('/api/entries')
      const data = await readJson(response)
      if (!response.ok || !data) {
        throw new Error(data?.error || '목록을 불러오지 못했어요.')
      }
      setEntries(data.entries)
      setLoaded(true)
    } catch (e) {
      setError(e instanceof TypeError ? CONNECT_ERROR : e.message)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    if (sendingRef.current) return

    const cleanName = name.trim()
    const cleanMessage = message.trim()
    if (!cleanName) {
      setError('작성자를 적어 주세요.')
      return
    }
    if (!cleanMessage) {
      setError('칭찬 한마디를 적어 주세요.')
      return
    }

    sendingRef.current = true
    setSaving(true)
    setError('')
    try {
      const body = { name: cleanName, message: cleanMessage }
      if (to.trim()) body.to = to.trim()
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJson(response)
      if (!response.ok) {
        throw new Error(data?.error || '저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.')
      }
      setMessage('')
      setTo('')
      await loadEntries()
    } catch (e) {
      setError(e instanceof TypeError ? CONNECT_ERROR : e.message)
    } finally {
      sendingRef.current = false
      setSaving(false)
    }
  }

  return (
    <main className="app">
      <header>
        <small>PRAISE RELAY</small>
        <h1>칭찬 릴레이</h1>
        <p>동료에게 고마운 마음을 한마디 남겨 보세요. 팀 모두가 함께 봐요.</p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="name">작성자</label>
        <input
          id="name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="내 이름"
          onChange={(e) => setName(e.target.value)}
        />

        <label htmlFor="to">
          받는 사람 <span className="optional">(선택)</span>
        </label>
        <input
          id="to"
          value={to}
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="누구를 칭찬하나요?"
          onChange={(e) => setTo(e.target.value)}
        />

        <label htmlFor="message">칭찬 한마디</label>
        <textarea
          id="message"
          rows={4}
          value={message}
          maxLength={MESSAGE_MAX}
          placeholder="어떤 점이 고마웠나요?"
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="count">
          {message.length} / {MESSAGE_MAX}
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving}>
          {saving ? '저장하는 중...' : '칭찬 남기기'}
        </button>
      </form>

      <section>
        <h2>칭찬 모음</h2>
        {loaded && entries.length === 0 && (
          <p className="empty">아직 칭찬이 없어요. 첫 칭찬을 남겨 보세요!</p>
        )}
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              {entry.to && <p className="card-to">{entry.to}님께</p>}
              <p className="card-message">{entry.message}</p>
              <p className="card-meta">
                {entry.name} · {formatTime(entry.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
