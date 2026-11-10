import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, RefreshCw, Pencil, Trash2, FileSpreadsheet, Save, X } from 'lucide-react'
import './FormsWorkspace.css'
import { cachedRequest, getCachedData, invalidateCachedData, scriptFlowCacheKeys } from './services/dataCache'

async function request(action, data = {}) {
  const response = await fetch('/api/forms', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data })
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Request failed.')
  return result
}

const PROJECT_KEYS = [
  ['project_number', 'Project Number'],
  ['spm_project_number', 'SPM Project Number'],
  ['project_name', 'Project Name'],
  ['complexity', 'Complexity'],
  ['client', 'Client'],
  ['pm', 'PM'],
  ['tester', 'Tester']
]

const blankForm = { id: '', name: '', spreadsheetUrl: '', sheetName: '', headerRow: '1', fieldMappings: {}, fields: [] }

export default function FormsWorkspace({ user, onBack, initialFormId = '' }) {
  const isAdmin = user?.role === 'admin'
  const canDelete = ['team_lead', 'admin'].includes(user?.role)
  const [forms, setForms] = useState([])
  const [selected, setSelected] = useState(null)
  const [records, setRecords] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState('')
  const [draft, setDraft] = useState(blankForm)
  const [recordDraft, setRecordDraft] = useState({})
  const [recordEditor, setRecordEditor] = useState(false)
  const [editingId, setEditingId] = useState('')

  async function loadForms({ force = false } = {}) {
    const cacheKey = scriptFlowCacheKeys.forms(user?.email)
    setBusy(!getCachedData(cacheKey))
    try {
      const result = await cachedRequest(cacheKey, () => request('list'), { force })
      setForms(result.forms || [])
      if (initialFormId) {
        const initialForm = (result.forms || []).find(form => form.id === initialFormId)
        if (initialForm) await loadRecords(initialForm)
      } else if (selected) {
        const match = (result.forms || []).find(form => form.id === selected.id)
        if (!match) { setSelected(null); setRecords([]) }
        else setSelected(match)
      }
      setNotice('')
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function loadRecords(form, { force = false } = {}) {
    setSelected(form); setRecordEditor(false)
    const cacheKey = scriptFlowCacheKeys.formRecords(user?.email, form.id)
    setBusy(!getCachedData(cacheKey))
    try {
      const result = await cachedRequest(cacheKey, () => request('list-records', { formId: form.id }), { force })
      setRecords(result.records || []); setNotice('')
    } catch (error) { setRecords([]); setNotice(error.message) }
    finally { setBusy(false) }
  }

  useEffect(() => { loadForms() }, [initialFormId, user?.email])

  function addForm() { setDraft(blankForm); setEditor('add') }
  function editForm(form) {
    setDraft({ id: form.id, name: form.name, spreadsheetUrl: '', sheetName: form.sheetName, headerRow: String(form.headerRow || 1), fieldMappings: Object.fromEntries((form.fields || []).map(field => [field.name, field.projectKey || ''])), fields: form.fields || [] })
    setEditor('update')
    setNotice('Leave the spreadsheet URL blank to keep the existing spreadsheet.')
  }

  async function saveForm(event) {
    event.preventDefault(); setBusy(true)
    try {
      const form = { id: draft.id, name: draft.name.trim(), sheetName: draft.sheetName.trim(), headerRow: Number(draft.headerRow), fieldMappings: draft.fieldMappings || {} }
      if (draft.spreadsheetUrl.trim()) form.spreadsheetUrl = draft.spreadsheetUrl.trim()
      const action = editor
      const result = await request(action, { form })
      invalidateCachedData(scriptFlowCacheKeys.forms(user?.email))
      if (draft.id) invalidateCachedData(scriptFlowCacheKeys.formRecords(user?.email, draft.id))
      await loadForms({ force: true })
      if (result.form) await loadRecords(result.form, { force: true })
      if (action === 'add' && result.form) {
        setDraft({ id: result.form.id, name: result.form.name, spreadsheetUrl: '', sheetName: result.form.sheetName, headerRow: String(result.form.headerRow || 1), fieldMappings: {}, fields: result.form.fields || [] })
        setEditor('update')
        setNotice('Form added. You can now map its columns to KPI Migration project fields before employees use it.')
      } else {
        setEditor('')
        setNotice('Form configuration updated.')
      }
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function removeForm(form) {
    if (!window.confirm('Remove "' + form.name + '" from ScriptFlow?\n\nThe Google spreadsheet and all its data will remain untouched.')) return
    try {
      await request('remove', { formId: form.id })
      invalidateCachedData(scriptFlowCacheKeys.forms(user?.email), scriptFlowCacheKeys.formRecords(user?.email, form.id))
      if (selected?.id === form.id) { setSelected(null); setRecords([]) }
      await loadForms()
      setNotice('Form removed from ScriptFlow. The spreadsheet was not changed.')
    } catch (error) { setNotice(error.message) }
  }

  function newRecord() {
    const values = {}
    selected.fields.forEach(field => { values[field.name] = '' })
    setRecordDraft(values); setEditingId(''); setRecordEditor(true)
  }

  async function saveRecord(event) {
    event.preventDefault(); setBusy(true)
    try {
      const result = await request('save-record', { formId: selected.id, record: { id: editingId, values: recordDraft } })
      setRecordEditor(false); setEditingId('')
      await loadRecords(selected)
      setNotice((result.action === 'updated' ? 'Record updated.' : 'Record created.') + ' Spreadsheet row ' + result.row + '.')
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  async function deleteRecord(record) {
    if (!window.confirm('Delete this record from its source spreadsheet?')) return
    try {
      await request('delete-record', { formId: selected.id, id: record.id })
      invalidateCachedData(scriptFlowCacheKeys.formRecords(user?.email, selected.id))
      await loadRecords(selected, { force: true }); setNotice('Record deleted from the source spreadsheet.')
    } catch (error) { setNotice(error.message) }
  }

  return <main className="sf-forms-page">
    <header className="sf-forms-header">
      <div><span className="sf-forms-eyebrow">SCRIPTFLOW · CENTRAL WORKSPACE</span><h1>Forms workspace</h1><p>Each form reads and writes to its own original Google spreadsheet.</p></div>
      <div className="sf-forms-actions">
        <button className="sf-forms-button light" onClick={onBack}><ArrowLeft size={15}/> KPI Weekly</button>
        <button className="sf-forms-button light" onClick={() => loadForms({ force: true })} disabled={busy}><RefreshCw size={14}/> Refresh</button>
        {isAdmin && <button className="sf-forms-button primary" onClick={addForm}><Plus size={15}/> Add form</button>}
      </div>
    </header>
    {notice && <p className="sf-forms-notice">{notice}</p>}
    {editor && <form className="sf-form-editor" onSubmit={saveForm}>
      <div className="sf-form-editor-title"><h2>{editor === 'add' ? 'Add a form' : 'Update form'}</h2><button type="button" onClick={() => setEditor('')}><X size={16}/></button></div>
      <div className="sf-form-fields">
        <label>Form name<input required value={draft.name} onChange={e => setDraft(v => ({...v,name:e.target.value}))}/></label>
        <label>Google Sheets URL {editor === 'edit' && '(optional)'}<input type="url" required={editor === 'add'} value={draft.spreadsheetUrl} onChange={e => setDraft(v => ({...v,spreadsheetUrl:e.target.value}))} placeholder="Paste spreadsheet URL"/></label>
        <label>Worksheet tab name<input required value={draft.sheetName} onChange={e => setDraft(v => ({...v,sheetName:e.target.value}))}/></label>
        <label>Header row<input required type="number" min="1" max="100" value={draft.headerRow} onChange={e => setDraft(v => ({...v,headerRow:e.target.value}))}/></label>
      </div>
      <div className="sf-project-mapping">
        <div><h3>KPI Migration project fields</h3><p>Optional: map destination columns to values from the KPI Migration master record. Employees will select a project when creating a record.</p></div>
        {(draft.fields || []).map(field => <label key={field.name}>{field.name}<select value={draft.fieldMappings?.[field.name] || ''} onChange={event => setDraft(previous => ({ ...previous, fieldMappings: { ...(previous.fieldMappings || {}), [field.name]: event.target.value } }))}><option value="">Do not map</option>{PROJECT_KEYS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}
      </div>
      <div className="sf-form-actions"><button type="button" className="sf-forms-button light" onClick={() => setEditor('')}>Cancel</button><button className="sf-forms-button primary" disabled={busy}><Save size={14}/> Save form</button></div>
    </form>}
    <div className="sf-forms-columns">
      <section className="sf-forms-list"><h2>Available forms <span>{forms.length}</span></h2>
        {forms.map(form => <article className={'sf-form-item '+(selected?.id===form.id?'active':'')} key={form.id}>
          <button className="sf-form-select" onClick={() => loadRecords(form)}><FileSpreadsheet size={18}/><span><b>{form.name}</b><small>{form.sheetName} · {form.fields?.length || 0} fields</small></span></button>
          {isAdmin && <div className="sf-form-actions"><button title="Update" onClick={() => editForm(form)}><Pencil size={14}/></button><button title="Remove from ScriptFlow" onClick={() => removeForm(form)}><Trash2 size={14}/></button></div>}
        </article>)}
        {!forms.length && <p className="sf-forms-empty">{busy?'Loading forms…':'No forms registered yet.'}</p>}
      </section>
      <section className="sf-forms-records">
        {!selected ? <div className="sf-forms-empty">Select a form to view its records.</div> : <>
          <header><div><h2>{selected.name}</h2><p>Worksheet: {selected.sheetName}</p></div>{!recordEditor && <button className="sf-forms-button primary" onClick={newRecord}><Plus size={14}/> New record</button>}</header>
          {recordEditor ? <form onSubmit={saveRecord}>
            <div className="sf-dynamic-grid">{(selected.fields || []).map(field => <label key={field.name}>{field.name}{field.required && ' *'}
              {field.type === 'textarea' ? <textarea rows="3" required={field.required} value={recordDraft[field.name] ?? ''} onChange={e => setRecordDraft(v => ({...v,[field.name]:e.target.value}))}/> :
              <input type={['date','email','url','number'].includes(field.type)?field.type:'text'} required={field.required} value={recordDraft[field.name] ?? ''} onChange={e => setRecordDraft(v => ({...v,[field.name]:e.target.value}))}/>}
            </label>)}</div>
            <div className="sf-form-actions"><button type="button" className="sf-forms-button light" onClick={() => setRecordEditor(false)}>Cancel</button><button className="sf-forms-button primary" disabled={busy}><Save size={14}/> {editingId?'Update record':'Save record'}</button></div>
          </form> : <div className="sf-record-table-wrap">{busy?'Loading records…':records.length ? <table className="sf-record-table"><thead><tr>{(selected.fields||[]).slice(0,4).map(f=><th key={f.name}>{f.name}</th>)}<th>Actions</th></tr></thead><tbody>{records.map(record=><tr key={record.id}>{(selected.fields||[]).slice(0,4).map(f=><td key={f.name}>{String(record.values?.[f.name] ?? '') || '—'}</td>)}<td><button onClick={()=>{setRecordDraft({...record.values});setEditingId(record.id);setRecordEditor(true)}}><Pencil size={13}/> Edit</button>{canDelete && <button onClick={()=>deleteRecord(record)}><Trash2 size={13}/> Delete</button>}</td></tr>)}</tbody></table>:<p className="sf-forms-empty">No records found.</p>}</div>}
        </>}
      </section>
    </div>
    <footer className="sf-forms-footer">Removing a form only deactivates its ScriptFlow registration. The source spreadsheet and its data remain untouched.</footer>
  </main>
}
