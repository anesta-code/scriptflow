import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileSpreadsheet, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import './DynamicFormPage.css'

async function request(action, data = {}) {
  const response = await fetch('/api/forms', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data })
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'The request failed.')
  return result
}

export default function DynamicFormPage({ form, user, onBack }) {
  const [records, setRecords] = useState([])
  const [values, setValues] = useState({})
  const [editingId, setEditingId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const canDelete = ['team_lead', 'admin'].includes(user?.role)
  const fields = Array.isArray(form.fields) ? form.fields : []

  async function loadRecords() {
    setBusy(true)
    try {
      const result = await request('list-records', { formId: form.id })
      setRecords(result.records || [])
      setNotice('')
    } catch (error) {
      setNotice('Could not load records: ' + error.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { loadRecords() }, [form.id])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return records
    return records.filter(record => fields.some(field =>
      String(record.values?.[field.name] ?? '').toLowerCase().includes(term)
    ))
  }, [records, search, fields])

  function startNew() {
    const next = {}
    fields.forEach(field => { next[field.name] = '' })
    setValues(next)
    setEditingId('')
    setIsEditing(true)
    setNotice('')
  }

  function startEdit(record) {
    setValues({ ...(record.values || {}) })
    setEditingId(record.id)
    setIsEditing(true)
    setNotice('')
  }

  async function saveRecord(event) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    try {
      const result = await request('save-record', {
        formId: form.id,
        record: { id: editingId, values }
      })
      setIsEditing(false)
      setEditingId('')
      await loadRecords()
      setNotice((result.action === 'updated' ? 'Record updated.' : 'New record added.') +
        (result.row ? ' Spreadsheet row ' + result.row + '.' : ''))
    } catch (error) {
      setNotice('Could not save record: ' + error.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeRecord(record) {
    if (!canDelete) return
    if (!window.confirm('Delete this record from the source spreadsheet? This cannot be undone.')) return
    setBusy(true)
    try {
      await request('delete-record', { formId: form.id, id: record.id })
      await loadRecords()
      setNotice('Record deleted from the source spreadsheet.')
    } catch (error) {
      setNotice('Could not delete record: ' + error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kpi-app">
      <aside className="kpi-sidebar">
        <div className="kpi-brand"><span className="kpi-brand-icon"><FileSpreadsheet size={22}/></span><span>ScriptFlow<small>REPORTING WORKSPACE</small></span></div>
        <div className="kpi-nav-label">REPORTING</div>
        <button className="kpi-nav-item" onClick={onBack}><ArrowLeft size={17}/> Back to reporting</button>
        <div className="kpi-available-forms">
          <div className="kpi-available-forms-heading">CURRENT FORM</div>
          <div className="kpi-form-nav-item active"><FileSpreadsheet size={15}/><span>{form.name}</span></div>
        </div>
        <div className="kpi-sidebar-note"><span className="kpi-live-dot"/> Google Sheets mode<small>Records are read from and saved to this form's original spreadsheet.</small></div>
      </aside>
      <main className="kpi-main">
        <header className="kpi-topbar">
          <div><span className="kpi-eyebrow">SCRIPTING OPERATIONS</span><h2>Team reporting</h2></div>
          <div className="kpi-user-area"><span className="kpi-user-email">{user?.email} · {user?.role?.replace(/_/g, ' ')}</span></div>
        </header>
        <div className="kpi-content">
          <div className="kpi-page-heading">
            <div><span className="kpi-eyebrow">GOOGLE SHEETS · LIVE RECORDS</span><h1>{form.name}</h1><p>Records from the {form.sheetName} worksheet.</p></div>
            {!isEditing && <button className="kpi-button primary" onClick={startNew}><Plus size={16}/> New record</button>}
          </div>
          {notice && <div className="kpi-notice">{notice}</div>}
          {isEditing ? (
            <form className="dfp-editor" onSubmit={saveRecord}>
              <div className="dfp-editor-heading"><div><h2>{editingId ? 'Edit record' : 'New record'}</h2><p>Complete the fields below. Required fields are marked with *.</p></div></div>
              <div className="dfp-fields">
                {fields.map(field => <label className="dfp-field" key={field.name}>
                  <span>{field.name}{field.required ? ' *' : ''}</span>
                  {field.type === 'textarea'
                    ? <textarea rows="3" required={Boolean(field.required)} value={values[field.name] ?? ''} onChange={event => setValues(previous => ({...previous,[field.name]:event.target.value}))}/>
                    : <input type={['date','email','url','number'].includes(field.type) ? field.type : 'text'} required={Boolean(field.required)} value={values[field.name] ?? ''} onChange={event => setValues(previous => ({...previous,[field.name]:event.target.value}))}/>}
                </label>)}
              </div>
              <div className="dfp-actions"><button type="button" className="kpi-button secondary" onClick={() => setIsEditing(false)}>Cancel</button><button className="kpi-button primary" disabled={busy}><Save size={15}/>{busy ? 'Saving…' : editingId ? 'Update record' : 'Save record'}</button></div>
            </form>
          ) : (
            <section className="kpi-submissions">
              <div className="kpi-submissions-heading">
                <div><h2>All records <span>{records.length}</span></h2><p>Live records loaded from the original spreadsheet.</p></div>
                <div className="kpi-submission-actions">
                  <div className="kpi-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records…"/></div>
                  <button className="kpi-button secondary" onClick={loadRecords} disabled={busy}><RefreshCw size={14}/> Refresh</button>
                </div>
              </div>
              {busy && !records.length ? <div className="kpi-empty"><RefreshCw size={22}/><strong>Loading records…</strong></div> : filteredRecords.length ? (
                <div className="kpi-table-wrap"><table className="kpi-table">
                  <thead><tr>{fields.map(field => <th key={field.name}>{field.name}</th>)}<th>Actions</th></tr></thead>
                  <tbody>{filteredRecords.map((record,index) => <tr key={record.id || index}>
                    {fields.map(field => <td key={field.name}>{String(record.values?.[field.name] ?? '') || '—'}</td>)}
                    <td className="kpi-record-actions">
                      <button className="kpi-button secondary kpi-edit-button" onClick={() => startEdit(record)}><Pencil size={13}/> Edit</button>
                      {canDelete && <button className="kpi-button danger kpi-edit-button" onClick={() => removeRecord(record)} disabled={busy}><Trash2 size={13}/> Delete</button>}
                    </td>
                  </tr>)}</tbody>
                </table></div>
              ) : <div className="kpi-empty"><FileSpreadsheet size={24}/><strong>{records.length ? 'No matching records' : 'No records found'}</strong><p>Use New record to add the first entry.</p></div>}
            </section>
          )}
          <footer className="kpi-footer">ScriptFlow · {form.name} · Google Sheets connection</footer>
        </div>
      </main>
    </div>
  )
}
