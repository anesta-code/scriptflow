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

  const body = req.body || {}
  const user = { email: session.sub, role: session.role }
  const payload = { user }
  let operation

  switch (body.action) {
    case 'list': operation = 'list_forms'; break
    case 'add':
      if (session.role !== 'admin') return res.status(403).json({ ok: false, error: 'Only admins can add forms.' })
      operation = 'add_form'; payload.form = body.form; break
    case 'update':
      if (session.role !== 'admin') return res.status(403).json({ ok: false, error: 'Only admins can update forms.' })
      operation = 'update_form'; payload.form = body.form; break
    case 'remove':
      if (session.role !== 'admin') return res.status(403).json({ ok: false, error: 'Only admins can remove forms.' })
      operation = 'deactivate_form'; payload.formId = body.formId; break
    case 'list-records':
      operation = 'list_form_records'; payload.formId = body.formId; break
    case 'list-projects':
      operation = 'list_kpi_projects'; payload.query = String(body.query || '').trim(); break
    case 'save-record':
      if (!['scripter', 'team_lead', 'admin'].includes(session.role)) return res.status(403).json({ ok: false, error: 'You cannot save records.' })
      operation = 'save_form_record'; payload.formId = body.formId; payload.record = body.record; break
    case 'delete-record':
      if (!['team_lead', 'admin'].includes(session.role)) return res.status(403).json({ ok: false, error: 'Only team leaders and admins can delete records.' })
      operation = 'delete_form_record'; payload.formId = body.formId; payload.id = body.id; break
    default: return res.status(400).json({ ok: false, error: 'Unsupported forms action.' })
  }

  try {
    const result = await callAppsScript({ operation, ...payload })
    return res.status(200).json(result)
  } catch (error) {
    console.error('[ScriptFlow forms]', operation, error)
    return res.status(502).json({ ok: false, error: error.message || 'The forms request failed.' })
  }
}
