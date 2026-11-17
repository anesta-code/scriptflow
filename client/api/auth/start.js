import crypto from 'node:crypto'

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Method not allowed.')
  }

  const authUrl = process.env.GOOGLE_WORKSPACE_AUTH_URL
  if (!authUrl) return res.status(503).send('Google Workspace sign-in is not configured.')

  const state = crypto.randomBytes(32).toString('base64url')
  const destination = new URL(authUrl)
  destination.searchParams.set('state', state)

  // Vercel supplies the unique hostname for the current Preview deployment.
  // Production continues to use the callback configured in Apps Script.
  if (process.env.VERCEL_ENV === 'preview') {
    const previewHost = String(process.env.VERCEL_URL || '').toLowerCase()
    if (!/^scriptflow-[a-z0-9-]+-scriptflow1\.vercel\.app$/.test(previewHost)) {
      return res.status(503).send('This Preview deployment does not have an approved ScriptFlow callback hostname.')
    }
    destination.searchParams.set('return_to', 'https://' + previewHost + '/')
  }

  res.setHeader('Set-Cookie',
    'sf_oauth_state=' + encodeURIComponent(state) +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300')
  res.setHeader('Cache-Control', 'no-store')
  return res.redirect(302, destination.toString())
}
