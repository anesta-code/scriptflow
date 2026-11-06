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

  res.setHeader('Set-Cookie',
    'sf_oauth_state=' + encodeURIComponent(state) +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300')
  res.setHeader('Cache-Control', 'no-store')
  return res.redirect(302, destination.toString())
}
