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

function diagnostic(event, details) {
  // Never log API secrets, employee assertions, cookies, request bodies or response bodies.
  console.error('[ScriptFlow API diagnostic]', JSON.stringify({
    event: event,
    time: new Date().toISOString(),
    ...details
  }))
}

export async function callAppsScript(body) {
  const rawUrl = process.env.SCRIPT_FLOW_API_URL
  const secret = process.env.SCRIPT_FLOW_API_SECRET

  if (!rawUrl) {
    diagnostic('configuration_missing', {
      operation: body && body.operation ? body.operation : 'unknown',
      apiUrlPresent: false,
      apiSecretPresent: Boolean(secret)
    })
    throw new Error('SCRIPT_FLOW_API_URL is missing from this Vercel Preview deployment.')
  }

  if (!secret || secret.length < 32) {
    diagnostic('configuration_invalid', {
      operation: body && body.operation ? body.operation : 'unknown',
      apiUrlPresent: true,
      apiSecretPresent: Boolean(secret),
      apiSecretLengthValid: Boolean(secret && secret.length >= 32)
    })
    throw new Error('SCRIPT_FLOW_API_SECRET is missing or too short in this Vercel Preview deployment.')
  }

  let apiUrl
  try {
    apiUrl = new URL(rawUrl)
  } catch (error) {
    diagnostic('api_url_invalid', {
      operation: body && body.operation ? body.operation : 'unknown',
      apiUrlPresent: true,
      apiUrlParseFailed: true,
      apiSecretPresent: true
    })
    throw new Error('SCRIPT_FLOW_API_URL is not a valid URL. It must contain the Apps Script /exec URL, not a sign-in token.')
  }

  const validEndpoint =
    apiUrl.protocol === 'https:' &&
    apiUrl.hostname === 'script.google.com' &&
    /^\/a\/macros\/bilendi\.com\/s\/[^/]+\/exec\/?$/.test(apiUrl.pathname)

  if (!validEndpoint) {
    diagnostic('api_url_wrong_endpoint', {
      operation: body && body.operation ? body.operation : 'unknown',
      protocolIsHttps: apiUrl.protocol === 'https:',
      hostIsGoogleScript: apiUrl.hostname === 'script.google.com',
      pathMatchesBilendiWebApp: /^\/a\/macros\/bilendi\.com\/s\/[^/]+\/exec\/?$/.test(apiUrl.pathname),
      apiSecretPresent: true
    })
    throw new Error('SCRIPT_FLOW_API_URL does not point to the Bilendi Apps Script Web App /exec endpoint.')
  }

  diagnostic('request_started', {
    operation: body && body.operation ? body.operation : 'unknown',
    apiUrlValid: true,
    apiSecretPresent: true,
    apiSecretLengthValid: true
  })

  const signed = signApiRequest(body, secret)
  let response
  try {
    response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: signed.rawBody
    })
  } catch (error) {
    diagnostic('fetch_failed', {
      operation: body && body.operation ? body.operation : 'unknown',
      errorName: error && error.name ? error.name : 'FetchError'
    })
    throw new Error('Could not reach the ScriptFlow Apps Script API. Check the Preview API URL and Apps Script deployment.')
  }

  const text = await response.text()
  let result
  try {
    result = JSON.parse(text)
  } catch (error) {
    diagnostic('invalid_api_response', {
      operation: body && body.operation ? body.operation : 'unknown',
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || 'unknown',
      responseLength: text.length
    })
    throw new Error('The ScriptFlow Apps Script API returned a non-JSON response. Check that the API Web App is deployed and accessible.')
  }

  if (!response.ok || !result.ok) {
    diagnostic('api_rejected_request', {
      operation: body && body.operation ? body.operation : 'unknown',
      httpStatus: response.status,
      apiError: typeof result.error === 'string' ? result.error.slice(0, 180) : 'Unspecified API error'
    })
    throw new Error(result.error || 'ScriptFlow API request failed.')
  }

  diagnostic('request_succeeded', {
    operation: body && body.operation ? body.operation : 'unknown',
    httpStatus: response.status
  })
  return result
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  res.status(405).json({ ok: false, error: 'Method not allowed.' })
  return false
}
