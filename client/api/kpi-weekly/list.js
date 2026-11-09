import { callAppsScript, readCookie, requireMethod, verifySession } from './_lib/security.js'

function sameOrigin(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  return Boolean(origin && host && new URL(origin).host === host)
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  res.setHeader('Cache-Control', 'no-store')
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'Cross-origin request denied.' })

  const session = verifySession(readCookie(req, 'sf_session'), process.env.SCRIPT_FLOW_SESSION_SECRET)
  if (!session) return res.status(401).json({ ok: false, error: 'Please sign in with your Bilendi account.' })

  try {
    const result = await callAppsScript({
      operation: 'list_kpi_records',
      user: { email: session.sub, role: session.role }
    })
    return res.status(200).json({ ok: true, records: result.records || [] })
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'Unable to load KPI records from Google Sheets.' })
  }
}
