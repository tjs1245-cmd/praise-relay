// Vercel 서버리스 함수. Spring API(/api/entries)와 같은 요청·응답 모양이에요.
// DATABASE_URL(Neon Postgres) 환경 변수가 필요해요.
import { neon } from '@neondatabase/serverless'

const MAX_BODY = 8 * 1024

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let ready
function db() {
  const sql = neon(process.env.DATABASE_URL)
  ready ??= sql`CREATE TABLE IF NOT EXISTS entries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    recipient TEXT,
    created_at TEXT NOT NULL
  )`
  return ready.then(() => sql)
}

function toEntry(row) {
  const entry = { id: Number(row.id), name: row.name, message: row.message }
  if (row.recipient) entry.to = row.recipient
  entry.created_at = row.created_at
  return entry
}

function requiredText(data, field, label, limit) {
  const value = data[field]
  if (typeof value !== 'string') throw new ApiError(400, `${label}은(는) 글자로 적어 주세요.`)
  const text = value.trim()
  if (text.length < 1 || text.length > limit) {
    throw new ApiError(400, `${label}은(는) 1~${limit}자로 적어 주세요.`)
  }
  return text
}

function optionalText(data, field, label, limit) {
  const value = data[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new ApiError(400, `${label}은(는) 글자로 적어 주세요.`)
  const text = value.trim()
  if (!text) return null
  if (text.length > limit) throw new ApiError(400, `${label}은(는) ${limit}자 이하로 적어 주세요.`)
  return text
}

async function readBody(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json' && !type.endsWith('+json')) {
    throw new ApiError(415, 'JSON 형식(application/json)으로 보내 주세요.')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new ApiError(413, '본문이 너무 커요. 8KiB 이하로 보내 주세요.')
    chunks.push(chunk)
  }
  let data
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    throw new ApiError(400, 'JSON을 읽을 수 없어요.')
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(400, 'JSON 객체로 보내 주세요.')
  }
  return data
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      const sql = await db()
      const rows = await sql`SELECT id, name, message, recipient, created_at
        FROM entries ORDER BY id DESC LIMIT 200`
      return res.status(200).json({ entries: rows.map(toEntry) })
    }
    if (req.method === 'POST') {
      const data = await readBody(req)
      const name = requiredText(data, 'name', '작성자', 40)
      const message = requiredText(data, 'message', '칭찬 한마디', 500)
      const to = optionalText(data, 'to', '받는 사람', 40)
      const createdAt = new Date().toISOString()
      const sql = await db()
      const [row] = await sql`INSERT INTO entries (name, message, recipient, created_at)
        VALUES (${name}, ${message}, ${to}, ${createdAt})
        RETURNING id, name, message, recipient, created_at`
      return res.status(201).json({ entry: toEntry(row) })
    }
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: '허용되지 않는 요청 방식이에요.' })
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message })
    console.error(e)
    return res.status(500).json({ error: '서버에 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.' })
  }
}
