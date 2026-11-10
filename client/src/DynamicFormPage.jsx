import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
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

export default function DynamicFormPage({ form, user }) {
  const [records, setRecords] = useState([])
  const [values, setValues] = useState({})
  const [editingId, setEditingId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [projects, setProjects] = useState([])
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(false)
  const canDelete = ['team_lead', 'admin'].includes(user?.role)
  const fields = Array.isArray(form.fields) ? form.fields : []
  const mappedFields = fields.filter(field => field.projectKey)
  const usesProjectReference = mappedFields.length > 0
  const filteredProjects = projects.filter(project => [project.projectNumber, project.spmProjectNumber, project.projectName, project.client].some(value => String(value || '').toLowerCase().includes(projectSearch.trim().toLowerCase())))

  function valueForProjectKey(project, key) {
    const values = { project_number: project.projectNumber, spm_project_number: project.spmProjectNumber, project_name: project.projectName, complexity: project.complexity, client: project.client, pm: project.pm, tester: project.tester }
    return values[key] ?? ''
  }

  async function loadProjects() {
    setProjectsLoading(true)
    try {
      const result = await request('list-projects')
      setProjects(result.projects || [])
    } catch (error) {
      setNotice('Could not load KPI Migration projects: ' + error.message)
    } finally {
      setProjectsLoading(false)
    }
  }

  function chooseProject(project) {
    setSelectedProjectId(project.id)
    setProjectSearch([project.projectNumber, project.spmProjectNumber, project.projectName].filter(Boolean).join(' · '))
    setValues(previous => {
      const next = { ...previous }
      mappedFields.forEach(field => { next[field.name] = valueForProjectKey(project, field.projectKey) })
      return next
    })
  }

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
    setSelectedProjectId('')
    setProjectSearch('')
    setIsEditing(true)
    setNotice('')
    if (usesProjectReference) loadProjects()
  }

  function startEdit(record) {
    setValues({ ...(record.values || {}) })
    setEditingId(record.id)
    setSelectedProjectId(record.projectId || '')
    setProjectSearch('')
    setIsEditing(true)
    setNotice('')
    if (usesProjectReference) loadProjects()
  }

  async function saveRecord(event) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    try {
      const result = await request('save-record', {
        formId: form.id,
        record: { id: editingId, values, projectId: selectedProjectId }
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
    <div className="kpi-content">
      <div className="kpi-page-heading">
        <div><span className="kpi-eyebrow">GOOGLE SHEETS · LIVE RECORDS</span><h1>{form.name}</h1><p>Records from the {form.sheetName} worksheet.</p></div>
        {!isEditing && <button className="kpi-button primary" onClick={startNew}><Plus size={16}/> New record</button>}
      </div>
      {notice && <div className="kpi-notice">{notice}</div>}
      {isEditing ? (
        <form className="dfp-editor" onSubmit={saveRecord}>
          <div className="dfp-editor-heading"><div><h2>{editingId ? 'Edit record' : 'New record'}</h2><p>Complete the fields below. Required fields are marked with *.</p></div></div>
          {usesProjectReference && <section className="dfp-project-picker">
            <div><h3>Select a KPI Migration project</h3><p>Search by Project Number, SPM Project Number or Project Name. Mapped fields will be filled automatically.</p></div>
            <input type="search" value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder="Search project number, SPM number or name…" />
            {projectsLoading ? <p>Loading KPI projects…</p> : <div className="dfp-project-results">{filteredProjects.slice(0, 30).map(project => <button type="button" key={project.id} className={selectedProjectId === project.id ? 'selected' : ''} onClick={() => chooseProject(project)}><strong>{project.projectName || 'Unnamed project'}</strong><span>Project: {project.projectNumber || '—'} · SPM: {project.spmProjectNumber || '—'}</span></button>)}{!filteredProjects.length && <p>No matching projects found.</p>}</div>}
          </section>}
          <div className="dfp-fields">
            {fields.map(field => <label className={'dfp-field ' + (field.projectKey ? 'dfp-mapped-field' : '')} key={field.name}>
              <span>{field.name}{field.required ? ' *' : ''}</span>
              {field.type === 'textarea'
                ? <textarea rows="3" required={Boolean(field.required)} value={values[field.name] ?? ''} readOnly={Boolean(field.projectKey)} onChange={event => setValues(previous => ({...previous,[field.name]:event.target.value}))}/>
                : <input type={['date','email','url','number'].includes(field.type) ? field.type : 'text'} required={Boolean(field.required)} value={values[field.name] ?? ''} readOnly={Boolean(field.projectKey)} onChange={event => setValues(previous => ({...previous,[field.name]:event.target.value}))}/>}
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
  )
}
