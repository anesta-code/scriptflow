import crypto from 'node:crypto'
import { callAppsScript, readCookie, requireMethod, signSession, safeEqual } from '../_lib/security.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  res.setHeader('Cache-Control', 'no-store')

  const sessionSecret = process.env.SCRIPT_FLOW_SESSION_SECRET
  if (!sessionSecret || sessionSecret.length < 32) {
    return res.status(503).json({ ok: false, error: 'Session security is not configured.' })
  }

  const stateCookie = readCookie(req, 'sf_oauth_state')
  const token = req.body && req.body.token
  const state = req.body && req.body.state
  if (!stateCookie || !state || !safeEqual(stateCookie, state) || typeof token !== 'string') {
    return res.status(401).json({ ok: false, error: 'The sign-in request expired or could not be verified.' })
  }

  try {
    // The API Apps Script verifies the employee assertion signature, expiry,
    // audience, allowlisted role and one-time jti before returning identity.
    const redeemed = await callAppsScript({
      operation: 'redeem_auth_token',
      token: token,
      expected_state: state
    })

    if (!redeemed.user || !redeemed.user.email || !redeemed.user.role) {
      throw new Error('The employee assertion was not accepted.')
    }

    const now = Math.floor(Date.now() / 1000)
    const session = {
      iss: 'scriptflow-vercel-session',
      aud: 'scriptflow',
      sub: redeemed.user.email,
      role: redeemed.user.role,
      iat: now,
      exp: now + 8 * 60 * 60,
      jti: crypto.randomUUID()
    }
    const signed = signSession(session, sessionSecret)
    res.setHeader('Set-Cookie', [
      'sf_session=' + encodeURIComponent(signed) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800',
      'sf_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    ])
    return res.status(200).json({
      ok: true,
      user: { email: session.sub, role: session.role }
    })
  } catch (error) {
    return res.status(401).json({ ok: false, error: error.message || 'Sign-in could not be completed.' })
  }
}
