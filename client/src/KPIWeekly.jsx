import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownToLine, CheckCircle2, ClipboardList, FileSpreadsheet,
  Plus, RotateCcw, Search, Pencil, RefreshCw
} from 'lucide-react'
import * as XLSX from 'xlsx'
import './KPIWeekly.css'
import FormsWorkspace from './FormsWorkspace'

const STATUS_OPTIONS = [
  'New', 'QNR check', 'Ready', 'In progress', 'QA review',
  'Revisions', 'Blocked', 'Waiting for information', 'Completed', 'Cancelled'
]

const EXCEL_HEADERS = [
  'SW',
  'Project number',
  'SPM Project Number',
  'Project Name',
  'Tester',
  'PM',
  'Status',
  'Questions',
  'LOI',
  'Level',
  'QNR received on',
  'Date sent to QA',
  'Date sent to PM',
  'Launch date',
  'Test link (scripting time per Hrs)',
  'Changes time (hours)',
  'Testing time (hours)',
  'Mailing time',
  'Total estimated hours',
  'Hours worked',
  'Commissioning country',
  'Overlay',
  'Price Scripting',
  'Hours Commissioned',
  'Client',
  'BARI - OE CHECKS',
  'BARI - MODERATIONS',
  'BARI SCRIPTING',
  'BSurvey',
  'Complexity - As SPM',
  '__ScriptFlow_ID'
]

const INITIAL_FORM = {
  sw: '',
  projectNumber: '',
  spmProjectNumber: '',
  projectName: '',
  tester: '',
  pm: '',
  status: 'New',
  questions: '',
  loi: '',
  level: '',
  qnrReceivedOn: '',
  dateSentToQa: '',
  dateSentToPm: '',
  launchDate: '',
  testLink: '',
  scriptingTime: '',
  changesTime: '',
  testingTime: '',
  mailingTime: '',
  hoursWorked: '',
  commissioningCountry: '',
  overlay: '',
  priceScripting: '',
  hoursCommissioned: '',
  client: '',
  bariOeChecks: '',
  bariModerations: '',
  bariScripting: '',
  bsurvey: '',
  complexityAsSpm: ''
}

const FIELD_SECTIONS = [
  {
    title: 'Project identification',
    description: 'Main project references and people responsible.',
    fields: [
      ['sw', 'SW', 'text'],
      ['projectNumber', 'Project number', 'text'],
      ['spmProjectNumber', 'SPM Project Number', 'text'],
      ['projectName', 'Project Name', 'text', true],
      ['tester', 'Tester', 'text'],
      ['pm', 'PM', 'text'],
      ['client', 'Client', 'text'],
      ['commissioningCountry', 'Commissioning country', 'text']
    ]
  },
  {
    title: 'Project details',
    description: 'Questionnaire, status and complexity information.',
    fields: [
      ['status', 'Status', 'select'],
      ['questions', 'Questions', 'number'],
      ['loi', 'LOI', 'decimal'],
      ['level', 'Level', 'text'],
      ['complexityAsSpm', 'Complexity - As SPM', 'text'],
      ['overlay', 'Overlay', 'text']
    ]
  },
  {
    title: 'Important dates',
    description: 'Record the key dates used in the weekly KPI.',
    fields: [
      ['qnrReceivedOn', 'QNR received on', 'date'],
      ['dateSentToQa', 'Date sent to QA', 'date'],
      ['dateSentToPm', 'Date sent to PM', 'date'],
      ['launchDate', 'Launch date', 'date']
    ]
  },
  {
    title: 'Time and financial information',
    description: 'Estimated times are added automatically to calculate the total.',
    fields: [
      ['changesTime', 'Changes time (hours)', 'decimal'],
      ['testingTime', 'Testing time (hours)', 'decimal'],
      ['mailingTime', 'Mailing time', 'decimal'],
      ['hoursWorked', 'Hours worked', 'decimal'],
      ['priceScripting', 'Price Scripting', 'decimal'],
      ['hoursCommissioned', 'Hours Commissioned', 'decimal']
    ]
  },
  {
    title: 'BARI and other tools',
    description: 'Additional reporting fields from the KPI spreadsheet.',
    fields: [
      ['bariOeChecks', 'BARI - OE CHECKS', 'textarea'],
      ['bariModerations', 'BARI - MODERATIONS', 'textarea'],
      ['bariScripting', 'BARI SCRIPTING', 'textarea'],
      ['bsurvey', 'BSurvey', 'textarea']
    ]
  }
]

function numberValue(value) {
  return value === '' ? 0 : Number(value) || 0
}

function buildExcelRow(record) {
  return {
    'SW': record.sw,
    'Project number': record.projectNumber,
    'SPM Project Number': record.spmProjectNumber,
    'Project Name': record.projectName,
    'Tester': record.tester,
    'PM': record.pm,
    'Status': record.status,
    'Questions': record.questions,
    'LOI': record.loi,
    'Level': record.level,
    'QNR received on': record.qnrReceivedOn,
    'Date sent to QA': record.dateSentToQa,
    'Date sent to PM': record.dateSentToPm,
    'Launch date': record.launchDate,
    'Test link (scripting time per Hrs)': [
      record.testLink,
      record.scriptingTime !== '' ? record.scriptingTime + ' hrs' : ''
    ].filter(Boolean).join(' | '),
    'Changes time (hours)': record.changesTime,
    'Testing time (hours)': record.testingTime,
    'Mailing time': record.mailingTime,
    'Total estimated hours': record.totalEstimatedHours,
    'Hours worked': record.hoursWorked,
    'Commissioning country': record.commissioningCountry,
    'Overlay': record.overlay,
    'Price Scripting': record.priceScripting,
    'Hours Commissioned': record.hoursCommissioned,
    'Client': record.client,
    'BARI - OE CHECKS': record.bariOeChecks,
    'BARI - MODERATIONS': record.bariModerations,
    'BARI SCRIPTING': record.bariScripting,
    'BSurvey': record.bsurvey,
    'Complexity - As SPM': record.complexityAsSpm,
    '__ScriptFlow_ID': ''
  }
}

function Field({ field, value, onChange }) {
  const [name, label, type, required] = field
  if (type === 'select') {
    return (
      <label className="kpi-field">
        <span>{label}{required && <b className="required-mark"> *</b>}</span>
        <select name={name} value={value} onChange={event => onChange(name, event.target.value)} required={required}>
          {value && !STATUS_OPTIONS.includes(value) && <option value={value}>{value}</option>}{STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    )
  }
  if (type === 'textarea') {
    return (
      <label className="kpi-field kpi-span-2">
        <span>{label}</span>
        <textarea rows="3" name={name} value={value} onChange={event => onChange(name, event.target.value)} />
      </label>
    )
  }
  const inputType = type === 'decimal' || type === 'number' ? 'number' : type
  return (
    <label className="kpi-field">
      <span>{label}{required && <b className="required-mark"> *</b>}</span>
      <input
        name={name}
        type={inputType}
        value={value}
        onChange={event => onChange(name, event.target.value)}
        required={required}
        min={type === 'number' || type === 'decimal' ? '0' : undefined}
        step={type === 'number' ? '1' : type === 'decimal' ? '0.01' : undefined}
      />
    </label>
  )
}

export default function KPIWeekly({ user, signOut }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [records, setRecords] = useState([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('records')
  const [editingId, setEditingId] = useState('')
  const [isLoadingRecords, setIsLoadingRecords] = useState(true)
  const canEdit = Boolean(user && ['admin', 'team_lead', 'scripter'].includes(user.role))
  const canDelete = Boolean(user && ['admin', 'team_lead'].includes(user.role))
  const [deletingId, setDeletingId] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const totalEstimatedHours = useMemo(() => {
    const hasTime = [form.scriptingTime, form.changesTime, form.testingTime, form.mailingTime]
      .some(value => value !== '')
    if (!hasTime) return ''
    return numberValue(form.scriptingTime) +
      numberValue(form.changesTime) +
      numberValue(form.testingTime) +
      numberValue(form.mailingTime)
  }, [form.scriptingTime, form.changesTime, form.testingTime, form.mailingTime])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return records
    return records.filter(item =>
      [item.projectName, item.projectNumber, item.spmProjectNumber, item.client, item.tester, item.pm]
        .some(value => String(value || '').toLowerCase().includes(term))
    )
  }, [records, search])

  async function loadRecords() {
    setIsLoadingRecords(true)
    try {
      const response = await fetch('/api/kpi-weekly', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      })
      const responseText = await response.text()
      let result
      try {
        result = JSON.parse(responseText)
      } catch {
        throw new Error('Server returned HTTP ' + response.status + ' instead of JSON: ' + responseText.slice(0, 180))
      }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load KPI records.')
      setRecords(Array.isArray(result.records) ? result.records : [])
      setNotice('')
    } catch (error) {
      setNotice('Could not load KPI Migration records: ' + error.message)
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => { loadRecords() }, [])

  function editRecord(record) {
    if (!canEdit) return
    const next = { ...INITIAL_FORM }
    Object.keys(next).forEach(key => {
      if (record[key] !== undefined && record[key] !== null) next[key] = String(record[key])
    })
    setForm(next)
    setEditingId(record.id)
    setActiveTab('form')
    setNotice('Editing ' + (record.projectName || 'KPI record') + '. Changes will update its existing spreadsheet row.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startNewRecord() {
    setForm(INITIAL_FORM)
    setEditingId('')
    setActiveTab('form')
    setNotice('')
  }

  function updateField(name, value) {
    setForm(previous => ({ ...previous, [name]: value }))
    setNotice('')
  }

  async function submitForm(event) {
    event.preventDefault()
    if (isSaving) return
    if (!form.projectName.trim()) {
      setNotice('Project Name is required.')
      return
    }
    if (form.questions !== '' && (!Number.isInteger(Number(form.questions)) || Number(form.questions) < 0)) {
      setNotice('Questions must be a whole number greater than or equal to zero.')
      return
    }

    const record = {
      ...form,
      projectName: form.projectName.trim(),
      totalEstimatedHours: totalEstimatedHours,
      id: editingId || (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : 'kpi-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      submittedAt: new Date().toISOString()
    }

    setIsSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/kpi-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      })
      const result = await response.json()
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'The KPI entry could not be saved.')
      }

      setEditingId('')
      setForm(INITIAL_FORM)
      setActiveTab('records')
      await loadRecords()
      setNotice((result.action === 'updated' ? 'Updated existing KPI record' : 'Added new KPI record') + ' successfully (spreadsheet row ' + result.row + ').')
    } catch (error) {
      setNotice('Google Sheets save failed: ' + error.message + ' Your form data is still here; you can retry.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRecord(record) {
    if (!canDelete || !record.id) return
    const confirmed = window.confirm('Delete this KPI record from the KPI weekly spreadsheet? This action cannot be undone.')
    if (!confirmed) return
    setDeletingId(record.id)
    setNotice('')
    try {
      const response = await fetch('/api/kpi-weekly', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: record.id })
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to delete the KPI record.')
      await loadRecords()
      setNotice('KPI record deleted from the KPI weekly spreadsheet.')
    } catch (error) {
      setNotice('Could not delete KPI record: ' + error.message)
    } finally {
      setDeletingId('')
    }
  }
  function exportExcel() {
    if (!records.length) return
    const rows = records.map(buildExcelRow)
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS })
    worksheet['!cols'] = EXCEL_HEADERS.map(header => ({ wch: Math.max(14, Math.min(34, header.length + 3)) }))
    worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1' }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KPI weekly')
    XLSX.writeFile(workbook, 'KPI_Weekly_preview.xlsx')
  }

  function clearSession() { loadRecords() }

  if (activeTab === 'forms') return <FormsWorkspace user={user} onBack={() => setActiveTab('records')} />

  return (
    <div className="kpi-app">
      <aside className="kpi-sidebar">
        <div className="kpi-brand">
          <span className="kpi-brand-icon"><ClipboardList size={22} /></span>
          <span>ScriptFlow<small>REPORTING WORKSPACE</small></span>
        </div>
        <div className="kpi-nav-label">REPORTING</div>
        <button type="button" className={activeTab === 'records' ? 'kpi-nav-item active' : 'kpi-nav-item'} onClick={() => setActiveTab('records')}><FileSpreadsheet size={17} /> KPI Migration</button>
        <button type="button" className={activeTab === 'form' ? 'kpi-nav-item active' : 'kpi-nav-item'} onClick={startNewRecord}><Plus size={17} /> New KPI record</button>
        <button type="button" className={activeTab === 'forms' ? 'kpi-nav-item active' : 'kpi-nav-item'} onClick={() => setActiveTab('forms')}><ClipboardList size={17} /> Forms workspace</button>
        <div className="kpi-sidebar-note">
          <span className="kpi-live-dot" />
          Google Sheets mode
          <small>Successful submissions are written to the KPI weekly spreadsheet.</small>
        </div>
      </aside>

      <main className="kpi-main">
        <header className="kpi-topbar">
          <div>
            <span className="kpi-eyebrow">SCRIPTING OPERATIONS</span>
            <h2>Team reporting</h2>
          </div>
          <div className="kpi-user-area">
            <span className="kpi-preview-label connected"><span /> Google Sheets integration</span>
            {user && <span className="kpi-user-email">{user.email} · {user.role.replace(/_/g, ' ')}</span>}
            <button type="button" className="kpi-button secondary kpi-logout" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="kpi-content">
          <div className="kpi-page-heading">
            <div>
              <span className="kpi-eyebrow">GOOGLE SHEETS · LIVE RECORDS</span>
              <h1>{activeTab === 'form' ? (editingId ? 'Edit KPI record' : 'New KPI record') : 'KPI Migration'}</h1>
              <p>{activeTab === 'form' ? 'Enter or update a record in the KPI spreadsheet.' : 'All KPI records currently stored in the Google Sheets migration tab.'}</p>
            </div>
            <div className="kpi-heading-actions">
              {activeTab === 'form' && <button type="button" className="kpi-button secondary" onClick={() => { setForm(INITIAL_FORM); setEditingId(''); setNotice('Form cleared.') }}>
                <RotateCcw size={16} /> Clear form
              </button>}
              <button type="button" className="kpi-button primary" onClick={exportExcel} disabled={!records.length}>
                <ArrowDownToLine size={16} /> Export records
              </button>
            </div>
          </div>

          <div className="kpi-stats">
            <div className="kpi-stat-card"><span className="kpi-stat-icon"><FileSpreadsheet size={18} /></span><div><small>Total KPI records</small><strong>{records.length}</strong></div></div>
            <div className="kpi-stat-card"><span className="kpi-stat-icon hours"><Activity size={18} /></span><div><small>Estimated hours</small><strong>{records.reduce((sum, item) => sum + Number(item.totalEstimatedHours || 0), 0).toFixed(2)}</strong></div></div>
            <div className="kpi-stat-card"><span className="kpi-stat-icon ready"><CheckCircle2 size={18} /></span><div><small>Data source</small><strong className="kpi-mode-value">Google Sheets</strong></div></div>
          </div>

          {notice && <div className={'kpi-notice ' + (notice.indexOf('Google Sheets save failed:') === 0 ? 'error' : '')}><CheckCircle2 size={17} />{notice}</div>}

          {activeTab === 'form' && <form onSubmit={submitForm}>
            <div className="kpi-form-layout">
              <div className="kpi-form-column">
                {FIELD_SECTIONS.map(section => (
                  <section className="kpi-section" key={section.title}>
                    <div className="kpi-section-heading">
                      <h3>{section.title}</h3>
                      <p>{section.description}</p>
                    </div>
                    <div className="kpi-fields-grid">
                      {section.fields.map(field => (
                        <Field key={field[0]} field={field} value={form[field[0]]} onChange={updateField} />
                      ))}
                      {section.title === 'Time and financial information' && (
                        <>
                          <label className="kpi-field">
                            <span>Test link (URL)</span>
                            <input type="url" value={form.testLink} onChange={event => updateField('testLink', event.target.value)} placeholder="https://" />
                          </label>
                          <label className="kpi-field">
                            <span>Scripting time (hours)</span>
                            <input type="number" min="0" step="0.01" value={form.scriptingTime} onChange={event => updateField('scriptingTime', event.target.value)} />
                          </label>
                          <label className="kpi-field">
                            <span>Total estimated hours <small className="kpi-auto-label">AUTO-CALCULATED</small></span>
                            <input type="number" value={totalEstimatedHours === '' ? '' : totalEstimatedHours.toFixed(2)} readOnly />
                          </label>
                        </>
                      )}
                    </div>
                  </section>
                ))}
                <div className="kpi-form-actions">
                  <p><span className="required-mark">*</span> Required field</p>
                  <button className="kpi-button primary submit" type="submit" disabled={isSaving}>{isSaving ? (editingId ? 'Updating record...' : 'Saving to Google Sheets...') : <><Plus size={17} /> {editingId ? 'Update KPI record' : 'Save to KPI Weekly'}</>}</button>
                </div>
              </div>

              <aside className="kpi-help-card">
                <div className="kpi-help-icon"><ClipboardList size={20} /></div>
                <h3>About this form</h3>
                <p>This form follows the KPI Weekly column headers you supplied and writes mapped fields to the existing sheet.</p>
                <ul>
                  <li>Project Name is required.</li>
                  <li>Total estimated hours are calculated from scripting, changes, testing and mailing time.</li>
                  <li>The test link and scripting time are combined into the existing spreadsheet column.</li>
                  <li>A hidden <strong>__ScriptFlow_ID</strong> is used to identify each submitted record.</li>
                </ul>
                <div className="kpi-warning"><strong>Existing record protection</strong><span>When you edit a listed record, ScriptFlow reuses its permanent spreadsheet ID so the same row is updated instead of adding a duplicate.</span></div>
              </aside>
            </div>
          </form>}

          {activeTab === 'records' && <section className="kpi-submissions">
            <div className="kpi-submissions-heading">
              <div><h2>All KPI records <span>{records.length}</span></h2><p>Live records loaded directly from the KPI Migration spreadsheet tab.</p></div>
              <div className="kpi-submission-actions">
                <div className="kpi-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search project or client..." /></div>
                <button type="button" className="kpi-button secondary" onClick={clearSession} disabled={isLoadingRecords}><RefreshCw size={14} /> Refresh</button>
              </div>
            </div>
            {isLoadingRecords ? <div className="kpi-empty"><RefreshCw size={22} /><strong>Loading KPI records...</strong></div> : filteredRecords.length ? (
              <div className="kpi-table-wrap">
                <table className="kpi-table">
                  <thead><tr><th>Project name</th><th>Project number</th><th>SPM number</th><th>Tester</th><th>PM</th><th>Status</th><th>Est. hours</th><th>Action</th></tr></thead>
                  <tbody>{filteredRecords.map(item => (
                    <tr key={item.id || item.sheetRow}>
                      <td><strong>{item.projectName}</strong><small>{item.client || 'No client'}</small></td>
                      <td>{item.projectNumber || '—'}</td>
                      <td>{item.spmProjectNumber || '—'}</td>
                      <td>{item.tester || '—'}</td>
                      <td>{item.pm || '—'}</td>
                      <td><span className="kpi-status">{item.status}</span></td>
                      <td>{Number(item.totalEstimatedHours || 0).toFixed(2)}</td>
                      <td className="kpi-record-actions">
                        {canEdit && item.id && <button type="button" className="kpi-button secondary kpi-edit-button" onClick={() => editRecord(item)}><Pencil size={13} /> Edit</button>}
                        {canDelete && item.id && <button type="button" className="kpi-button danger kpi-edit-button" onClick={() => deleteRecord(item)} disabled={deletingId === item.id}>{deletingId === item.id ? 'Deleting…' : 'Delete'}</button>}
                        {!canEdit && <span className="kpi-readonly">View only</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="kpi-empty"><FileSpreadsheet size={24} /><strong>{records.length ? 'No matching entries' : 'No KPI records found'}</strong><p>{records.length ? 'Try another search term.' : 'The KPI spreadsheet does not contain any project records yet.'}</p></div>
            )}
          </section>}

          <footer className="kpi-footer">ScriptFlow · KPI Weekly · Google Sheets connection</footer>
        </div>
      </main>
    </div>
  )
}
