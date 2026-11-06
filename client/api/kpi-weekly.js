import { callAppsScript, readCookie, requireMethod, verifySession } from './_lib/security.js'

function sameOrigin(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  return Boolean(origin && host && new URL(origin).host === host)
}

function toSheetJob(record) {
  return {
    id: record.id,
    sw: record.sw,
    project_number: record.projectNumber,
    spm_project_number: record.spmProjectNumber,
    project_name: record.projectName,
    tester: record.tester,
    pm: record.pm,
    status: record.status,
    status_label: record.status,
    questions: record.questions,
    loi: record.loi,
    level: record.level,
    qnr_received_on: record.qnrReceivedOn,
    date_sent_to_qa: record.dateSentToQa,
    date_sent_to_pm: record.dateSentToPm,
    launch_date: record.launchDate,
    test_link: record.testLink,
    scripting_time_hours: record.scriptingTime,
    changes_time_hours: record.changesTime,
    testing_time_hours: record.testingTime,
    mailing_time_hours: record.mailingTime,
    total_estimated_hours: record.totalEstimatedHours,
    hours_worked: record.hoursWorked,
    commissioning_country: record.commissioningCountry,
    overlay: record.overlay,
    price_scripting: record.priceScripting,
    hours_commissioned: record.hoursCommissioned,
    client: record.client,
    bari_oe_checks: record.bariOeChecks,
    bari_moderations: record.bariModerations,
    bari_scripting: record.bariScripting,
    bsurvey: record.bsurvey,
    complexity_as_spm: record.complexityAsSpm
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return
  res.setHeader('Cache-Control', 'no-store')
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'Cross-origin request denied.' })

  const session = verifySession(readCookie(req, 'sf_session'), process.env.SCRIPT_FLOW_SESSION_SECRET)
  if (!session) return res.status(401).json({ ok: false, error: 'Please sign in with your Bilendi account.' })
  if (session.role !== 'team_lead') return res.status(403).json({ ok: false, error: 'Only team leads can submit KPI records.' })

  const record = req.body
  if (!record || typeof record !== 'object' || !record.id || !String(record.projectName || '').trim()) {
    return res.status(400).json({ ok: false, error: 'A valid KPI entry with an ID and Project Name is required.' })
  }

  try {
    const result = await callAppsScript({
      operation: 'sync_job',
      user: { email: session.sub, role: session.role },
      job: toSheetJob(record)
    })
    return res.status(200).json({
      ok: true,
      action: result.action,
      row: result.row,
      message: 'KPI Weekly entry saved to Google Sheets.'
    })
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || 'Unable to save to Google Sheets.' })
  }
}
