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
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return ''
}

export function signApiRequest(body, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomBytes(18).toString('base64url')
  const canonical = timestamp + '\n' + nonce + '\n' + JSON.stringify(body)
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  return { rawBody: JSON.stringify({ timestamp, nonce, payload: body, signature }) }
}

function diagnostic(event, details) {
  console.error('[ScriptFlow API diagnostic]', JSON.stringify({
    event: event,
    time: new Date().toISOString(),
    ...details
  }))
}

export async function callAppsScript(body) {
  const rawUrl = process.env.SCRIPT_FLOW_API_URL
  const secret = process.env.SCRIPT_FLOW_API_SECRET
  if (!rawUrl) throw new Error('SCRIPT_FLOW_API_URL is not configured in Vercel.')
  if (!secret || secret.length < 32) throw new Error('SCRIPT_FLOW_API_SECRET is missing or too short in Vercel.')

  let apiUrl
  try { apiUrl = new URL(rawUrl) } catch (error) {
    throw new Error('SCRIPT_FLOW_API_URL must be the separate ScriptFlow API Apps Script /exec URL.')
  }
  if (apiUrl.protocol !== 'https:' || apiUrl.hostname !== 'script.google.com' ||
      !/^\/(?:a\/macros\/bilendi\.com|macros)\/s\/[^/]+\/exec\/?$/.test(apiUrl.pathname)) {
    throw new Error('SCRIPT_FLOW_API_URL must point to the Bilendi ScriptFlow API Web App /exec endpoint.')
  }

  diagnostic('request_started', { operation: body && body.operation ? body.operation : 'unknown' })
  const signed = signApiRequest(body, secret)
  let response
  try {
    response = await fetch(apiUrl.toString(), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: signed.rawBody,
  redirect: 'follow'
})
  } catch (error) {
    diagnostic('fetch_failed', { operation: body && body.operation ? body.operation : 'unknown' })
    throw new Error('Could not reach the ScriptFlow API Apps Script deployment.')
  }

  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch (error) {
    diagnostic('invalid_response', {
      status: response.status,
      statusText: response.statusText,
      redirected: Boolean(response.redirected),
      host: response.url ? new URL(response.url).hostname : 'unknown',
      contentType: response.headers.get('content-type'),
      responsePreview: text.slice(0, 300)
    })
    throw new Error('The ScriptFlow API returned a non-JSON response. Check its Web App deployment access.')
  }
  if (!response.ok || !result.ok) {
    diagnostic('api_rejected', { status: response.status, operation: body.operation })
    throw new Error(result.error || 'ScriptFlow API request failed.')
  }
  return result
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  res.status(405).json({ ok: false, error: 'Method not allowed.' })
  return false
}
