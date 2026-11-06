import crypto from 'node:crypto'

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function signSession(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return encoded + '.' + signature
}

export function verifySession(token, secret) {
  if (!token || !secret) return null
  const parts = String(token).split('.')
  if (parts.length !== 2) return null
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url')
  if (!safeEqual(parts[1], expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    if (!payload.sub || !payload.role || !payload.exp || payload.exp <= now) return null
    if (payload.iss !== 'scriptflow-vercel-session' || payload.aud !== 'scriptflow') return null
    return payload
  } catch (error) {
    return null
  }
}

export function readCookie(req, name) {
  const header = req.headers && req.headers.cookie ? req.headers.cookie : ''
  const parts = header.split(';')
  for (const part of parts) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return ''
}

export function signApiRequest(body, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomBytes(18).toString('base64url')
  const payload = body
  const canonical = timestamp + '\n' + nonce + '\n' + JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  const rawBody = JSON.stringify({ timestamp, nonce, payload, signature })
  return { rawBody, timestamp, nonce, signature }
}

export async function callAppsScript(body) {
  const url = process.env.SCRIPT_FLOW_API_URL
  const secret = process.env.SCRIPT_FLOW_API_SECRET
  if (!url || !secret) throw new Error('ScriptFlow API connection is not configured.')
  const signed = signApiRequest(body, secret)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: signed.rawBody
  })
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch (error) {
    throw new Error('The ScriptFlow Apps Script API returned an invalid response.')
  }
  if (!response.ok || !result.ok) throw new Error(result.error || 'ScriptFlow API request failed.')
  return result
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  res.status(405).json({ ok: false, error: 'Method not allowed.' })
  return false
}
