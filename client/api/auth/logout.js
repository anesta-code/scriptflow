import { requireMethod } from '../_lib/security.js'

export default function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Set-Cookie', [
    'sf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'sf_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  ])
  return res.status(200).json({ ok: true })
}
