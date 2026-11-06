import { readCookie, requireMethod, verifySession } from '../_lib/security.js'

export default function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return
  res.setHeader('Cache-Control', 'no-store')
  const secret = process.env.SCRIPT_FLOW_SESSION_SECRET
  const session = verifySession(readCookie(req, 'sf_session'), secret)
  if (!session) return res.status(401).json({ ok: false, error: 'Not signed in.' })
  return res.status(200).json({
    ok: true,
    user: { email: session.sub, role: session.role, expiresAt: session.exp }
  })
}
