// Vercel serverless proxy for the KPI Weekly Google Apps Script endpoint.
// Configure GOOGLE_APPS_SCRIPT_URL and GOOGLE_SHEETS_SYNC_SECRET in Vercel.
// These values must never be exposed as VITE_ variables.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL
  const secret = process.env.GOOGLE_SHEETS_SYNC_SECRET

  if (!appsScriptUrl || !secret) {
    return res.status(503).json({
      ok: false,
      error: 'Google Sheets connection is not configured on the server.'
    })
  }

  const record = req.body
  if (!record || typeof record !== 'object' || !record.id || !record.projectName) {
    return res.status(400).json({
      ok: false,
      error: 'A valid KPI entry with an ID and Project Name is required.'
    })
  }

  try {
    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, record })
    })

    const responseText = await upstream.text()
    let result

    try {
      result = JSON.parse(responseText)
    } catch (error) {
      throw new Error('Google Apps Script returned an unreadable response.')
    }

    if (!upstream.ok || !result.ok) {
      return res.status(502).json({
        ok: false,
        error: result.error || 'Google Sheets rejected the submission.'
      })
    }

    return res.status(200).json({
      ok: true,
      action: result.action,
      row: result.row,
      message: 'KPI Weekly entry saved to Google Sheets.'
    })
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error.message || 'Unable to reach Google Sheets.'
    })
  }
}
