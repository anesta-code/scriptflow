import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, AlertCircle, ArrowDownToLine, BriefcaseBusiness, CheckCircle2,
  ClipboardList, Clock3, LayoutDashboard, LogOut, Plus, RefreshCw, Search,
  ShieldCheck, Users, X, Pencil, FileSpreadsheet
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { isSupabaseConfigured, supabase } from './services/supabase'

const STATUSES = [
  ['new', 'New'], ['qnr_check', 'QNR check'], ['ready', 'Ready'],
  ['in_progress', 'In progress'], ['qa_review', 'QA review'],
  ['revisions', 'Revisions'], ['blocked', 'Blocked'],
  ['waiting_information', 'Waiting for information'], ['completed', 'Completed'], ['cancelled', 'Cancelled']
]
const STATUS_LABEL = Object.fromEntries(STATUSES)
const ROLE_ASSIGNMENTS = [
  { title: 'Project Manager', primary: 'main_pm_id', backup: 'backup_pm_id' },
  { title: 'Scripter', primary: 'main_scripter_id', backup: 'backup_scripter_id' },
  { title: 'Tester', primary: 'main_tester_id', backup: 'backup_tester_id' }
]
const FIELD_GROUPS = [
  { title: 'Identification', fields: [
    ['sw', 'SW'], ['project_number', "Project's number"], ['spm_project_number', 'SPM Project Number'],
    ['project_name', "Project's Name", 'required'], ['client', 'Client']
  ]},
  { title: 'Workflow and questionnaire', fields: [
    ['status', 'Status', 'status'], ['questions', 'Questions', 'number'], ['loi', 'LOI', 'decimal'],
    ['level', 'Level'], ['complexity_as_spm', 'Complexity - As SPM'],
    ['qnr_received_on', 'QNR received on', 'date'], ['date_sent_to_qa', 'Date sent to QA', 'date'],
    ['date_sent_to_pm', 'Date sent to PM', 'date'], ['launch_date', 'Launch date', 'date']
  ]},
  { title: 'Scripting and testing', fields: [
    ['test_link', 'Test link', 'url'],
    ['changes', 'Changes notes', 'textarea'], ['testing', 'Testing notes', 'textarea']
  ]},
  { title: 'Time and financials', fields: [
    ['budget', 'Budget', 'money'], ['hours_worked', 'Hours worked', 'decimal'],
    ['hours_commissioned', 'Hours commissioned', 'decimal'], ['price_scripting', 'Price scripting', 'money']
  ]},
  { title: 'Commissioning and tools', fields: [
    ['commissioning_country', 'Commissioning country'], ['overlay', 'Overlay'],
    ['bari_oe_checks', 'BARI - OE CHECKS', 'textarea'], ['bari_moderations', 'BARI - MODERATIONS', 'textarea'],
    ['bari_scripting', 'BARI SCRIPTING', 'textarea'], ['bsurvey', 'BSurvey', 'textarea']
  ]},
  { title: 'Additional notes', fields: [['notes', 'Internal notes', 'textarea']] }
]

const EXCEL_FIELDS = [
  ['sw', 'SW'], ['project_number', "Project's number"], ['spm_project_number', 'SPM Project Number'],
  ['project_name', "Project's Name"], ['main_tester_name', 'Tester'], ['main_pm_name', 'PM'],
  ['status', 'Status'], ['questions', 'Questions'], ['loi', 'LOI'], ['level', 'Level'],
  ['qnr_received_on', 'QNR received on'], ['date_sent_to_qa', 'Date sent to QA'],
  ['date_sent_to_pm', 'Date sent to PM'], ['launch_date', 'Launch date'],
  ['test_link_scripting_time', 'Test link (scripting time per Hrs)'],
  ['changes_time_hours', 'Changes time (hours)'], ['testing_time_hours', 'Testing time (hours)'],
  ['mailing_time_hours', 'Mailing time'], ['total_estimated_hours', 'Total estimated hours'],
  ['hours_worked', 'Hours worked'], ['commissioning_country', 'Commissioning country'],
  ['overlay', 'Overlay'], ['price_scripting', 'Price Scripting'],
  ['hours_commissioned', 'Hours Commissioned'], ['client', 'Client'],
  ['bari_oe_checks', 'BARI - OE CHECKS'], ['bari_moderations', 'BARI - MODERATIONS'],
  ['bari_scripting', 'BARI SCRIPTING'], ['bsurvey', 'BSurvey'],
  ['complexity_as_spm', 'Complexity - As SPM']
]

function pretty(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function dateLabel(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString()
}
function displayName(person) {
  return person?.full_name || person?.email || 'Unassigned'
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else onLogin(data.session)
  }
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark"><ClipboardList size={25}/></div><p className="eyebrow">SCRIPTING TEAM WORKSPACE</p>
    <h1>Welcome to ScriptFlow</h1><p className="muted">One workspace for every scripting job.</p>
    <form onSubmit={submit} className="form-stack">
      <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>
      {error && <p className="error-text">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form><p className="small muted">Accounts are created by the ScriptFlow administrator.</p>
  </section></main>
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!isSupabaseConfigured) { setConfigError('Supabase is not configured. Add your project URL and publishable key to client/.env.local, then restart Vite.'); setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    let active = true
    async function loadProfile() {
      if (!session?.user) { setProfile(null); return }
      const { data, error } = await supabase.from('profiles').select('id,full_name,email,role,is_active').eq('id', session.user.id).maybeSingle()
      if (!active) return
      if (error) setConfigError(`Unable to load your team profile: ${error.message}`)
      else if (!data) setConfigError('Your team profile was not found. Ask an administrator to create it in public.profiles.')
      else if (!data.is_active) { await supabase.auth.signOut(); setConfigError('Your account is inactive. Contact the ScriptFlow administrator.') }
      else { setProfile(data); setConfigError('') }
    }
    loadProfile()
    return () => { active = false }
  }, [session])
  async function logout() { await supabase.auth.signOut(); setProfile(null); setSession(null); navigate('/login') }
  if (loading) return <div className="loading-screen">Loading ScriptFlow…</div>
  if (!isSupabaseConfigured) return <SetupMessage message={configError}/>
  if (!session) return <Login onLogin={setSession}/>
  if (!profile) return <div className="loading-screen">{configError || 'Loading your profile…'}</div>
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><ClipboardList size={21}/></span><span>ScriptFlow<small>TEAM WORKSPACE</small></span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav><NavLink to="/" end><LayoutDashboard size={18}/> Dashboard</NavLink><NavLink to="/jobs"><BriefcaseBusiness size={18}/> Jobs</NavLink><NavLink to="/team"><Users size={18}/> Team</NavLink></nav>
      <div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(profile.full_name || profile.email).slice(0,1).toUpperCase()}</div><div><strong>{profile.full_name || profile.email}</strong><small>{pretty(profile.role)}</small></div></div><button className="ghost-button logout" onClick={logout}><LogOut size={16}/> Sign out</button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div><span className="eyebrow">SCRIPTING OPERATIONS</span><h2>Team workspace</h2></div><div className="top-user"><span className="status-dot"/>{profile.full_name || profile.email}</div></header>
      <Routes><Route path="/" element={<Dashboard/>}/><Route path="/jobs" element={<Jobs profile={profile}/>}/><Route path="/team" element={<Team profile={profile}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>
    </main>
  </div>
}
function SetupMessage({ message }) { return <main className="login-shell"><section className="login-card"><div className="brand-mark"><ShieldCheck/></div><h1>Finish ScriptFlow setup</h1><p className="muted">{message}</p><p className="small muted">See README.md for setup instructions. Use fictional data in this development instance.</p></section></main> }

function Dashboard() {
  const [jobs, setJobs] = useState([]), [recent, setRecent] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(true)
  async function load() {
    setBusy(true); setError('')
    const [j, a] = await Promise.all([
      supabase.from('jobs').select('id,project_name,project_number,status,launch_date,main_scripter_id'),
      supabase.from('activities').select('id,action,description,created_at').order('created_at',{ascending:false}).limit(6)
    ])
    if (j.error || a.error) setError(j.error?.message || a.error?.message)
    else { setJobs(j.data || []); setRecent(a.data || []) }
    setBusy(false)
  }
  useEffect(()=>{ load() },[])
  const today = new Date().toISOString().slice(0,10)
  const stats = { total: jobs.length, active: jobs.filter(j=>!['completed','cancelled'].includes(j.status)).length, completed: jobs.filter(j=>j.status==='completed').length, overdue: jobs.filter(j=>j.launch_date && j.launch_date<today && !['completed','cancelled'].includes(j.status)).length }
  return <section className="page-content"><div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p className="muted">A live overview of the team's scripting workload.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="notice error-notice"><AlertCircle size={17}/>{error}</div>}
    <div className="stats-grid"><Stat icon={<BriefcaseBusiness/>} title="Total jobs" value={stats.total} tone="blue"/><Stat icon={<Activity/>} title="Active jobs" value={stats.active} tone="amber"/><Stat icon={<CheckCircle2/>} title="Completed" value={stats.completed} tone="green"/><Stat icon={<Clock3/>} title="Past launch date" value={stats.overdue} tone="red"/></div>
    <div className="content-card"><div className="card-heading"><div><h3>Recent activity</h3><p className="muted small">Latest updates recorded by the team</p></div></div>
      {busy ? <p className="muted">Loading activity…</p> : recent.length ? <div className="activity-list">{recent.map(item=><div className="activity-row" key={item.id}><span className="activity-icon"><Activity size={16}/></span><div><strong>{pretty(item.action)}</strong><p className="muted small">{item.description || 'Job activity'}</p></div><time>{new Date(item.created_at).toLocaleString()}</time></div>)}</div> : <EmptyState title="No activity yet" text="Create a job to start building your activity history."/>}
    </div>
  </section>
}
function Stat({icon,title,value,tone}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p>{title}</p><strong>{value}</strong></div></div> }

function Jobs({ profile }) {
  const [jobs,setJobs] = useState([]), [people,setPeople] = useState([]), [showForm,setShowForm] = useState(false), [editing,setEditing] = useState(null)
  const [query,setQuery] = useState(''), [status,setStatus] = useState('all'), [error,setError] = useState(''), [busy,setBusy] = useState(true)
  const canManage = ['admin','team_lead','scripter'].includes(profile.role)
  async function load() {
    setBusy(true); setError('')
    const [j,p] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at',{ascending:false}),
      supabase.from('profiles').select('id,full_name,email,role,is_active').eq('is_active',true).order('full_name')
    ])
    if (j.error || p.error) setError(j.error?.message || p.error?.message)
    else { setJobs(j.data || []); setPeople(p.data || []) }
    setBusy(false)
  }
  useEffect(()=>{ load() },[])
  const peopleById = useMemo(()=>Object.fromEntries(people.map(p=>[p.id,p])),[people])
  const filtered = useMemo(()=>jobs.filter(j=>{
    const term = query.trim().toLowerCase()
    const matches = !term || [j.sw,j.project_number,j.spm_project_number,j.project_name,j.client].some(v=>String(v||'').toLowerCase().includes(term))
    return matches && (status==='all' || j.status===status)
  }),[jobs,query,status])
  function exportExcel() {
    const rows = filtered.map(job => Object.fromEntries(EXCEL_FIELDS.map(([key,label])=>{
      if (key === 'test_link_scripting_time') {
        const parts = []
        if (job.test_link) parts.push(job.test_link)
        if (job.scripting_time_hours !== null && job.scripting_time_hours !== undefined && job.scripting_time_hours !== '') {
          parts.push(`${job.scripting_time_hours} hrs`)
        }
        return [label, parts.join(' | ')]
      }
      if (key.endsWith('_name')) {
        const idKey = key.replace('_name','_id')
        const name = displayName(peopleById[job[idKey]])
        return [label, name === 'Unassigned' ? '' : name]
      }
      return [label, key==='status' ? (STATUS_LABEL[job[key]] || job[key] || '') : (job[key] ?? '')]
    })))
    const ws = XLSX.utils.json_to_sheet(rows, { header: EXCEL_FIELDS.map(x=>x[1]) })
    ws['!cols'] = EXCEL_FIELDS.map(([key,label])=>({wch:Math.max(14,Math.min(32,label.length+4))}))
    ws['!autofilter'] = { ref: ws['!ref'] || 'A1' }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Jobs')
    XLSX.writeFile(wb,`ScriptFlow_Jobs_${new Date().toISOString().slice(0,10)}.xlsx`)
  }
  async function saveJob(form) {
    const fd = new FormData(form), payload = {}
    const numericFields = [
      'questions', 'loi', 'budget', 'scripting_time_hours',
      'changes_time_hours', 'testing_time_hours', 'mailing_time_hours',
      'total_estimated_hours', 'hours_worked', 'price_scripting',
      'hours_commissioned'
    ]

    for (const [key, value] of fd.entries()) {
      if (numericFields.includes(key)) {
        payload[key] = value.trim() === '' ? null : Number(value)
      } else {
        payload[key] = value.trim() === '' ? null : value.trim()
      }
    }

    if (!payload.project_name) {
      setError("Project's Name is required.")
      return
    }

    if (payload.questions !== null && payload.questions !== undefined &&
        (!Number.isInteger(payload.questions) || payload.questions < 0)) {
      setError('Questions must be a whole number.')
      return
    }

    const timeFields = [
      'scripting_time_hours', 'changes_time_hours',
      'testing_time_hours', 'mailing_time_hours'
    ]

    for (const key of timeFields) {
      if (payload[key] !== null &&
          (!Number.isFinite(payload[key]) || payload[key] < 0)) {
        setError('Estimated time values must be valid non-negative numbers.')
        return
      }
    }

    if (timeFields.some(key => payload[key] !== null)) {
      payload.total_estimated_hours = timeFields.reduce(
        (total, key) => total + (payload[key] || 0), 0
      )
    } else {
      payload.total_estimated_hours = null
    }
    const {data:userData} = await supabase.auth.getUser()
    setError('')
    let result
    if (editing) result = await supabase.from('jobs').update(payload).eq('id',editing.id).select().single()
    else result = await supabase.from('jobs').insert({...payload,created_by:userData.user.id}).select().single()
    if (result.error) { setError(result.error.message); return }
    await supabase.from('activities').insert({job_id:result.data.id,user_id:userData.user.id,action:editing?'job_updated':'job_created',description:`${editing?'Updated':'Created'} job: ${result.data.project_name}`})
    // The job is already safely saved in Supabase. A Sheets failure must not undo it.
    const syncResult = await supabase.functions.invoke('sync-job-to-google-sheet', {
      body: { job_id: result.data.id }
    })
    if (syncResult.error) {
      setError(`Job saved in ScriptFlow, but Google Sheets sync failed. ${syncResult.error.message} You can edit and save the job again to retry.`)
    } else if (syncResult.data && syncResult.data.error) {
      setError(`Job saved in ScriptFlow, but Google Sheets sync failed. ${syncResult.data.error} You can edit and save the job again to retry.`)
    }
    setShowForm(false); setEditing(null); await load()
  }
  function openEdit(job) { setEditing(job); setShowForm(true); setError('') }
  function openCreate() { setEditing(null); setShowForm(true); setError('') }
  return <section className="page-content">
    <div className="page-heading"><div><p className="eyebrow">WORK MANAGEMENT</p><h1>Jobs</h1><p className="muted">One record per scripting project, from questionnaire receipt to completion.</p></div><div className="heading-actions"><button className="secondary-button" onClick={exportExcel} disabled={!filtered.length}><FileSpreadsheet size={16}/> Export Excel</button>{canManage && <button className="primary-button" onClick={openCreate}><Plus size={17}/> New job</button>}</div></div>
    {error && <div className="notice error-notice"><AlertCircle size={17}/>{error}</div>}
    <div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search SW, project number, name or client…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="icon-button" title="Refresh jobs" onClick={load}><RefreshCw size={17}/></button></div>
    <div className="content-card jobs-card"><div className="card-heading"><div><h3>All jobs <span className="count-pill">{filtered.length}</span></h3><p className="muted small">Primary and backup assignments are shown separately.</p></div></div>
      {busy ? <div className="empty-state">Loading jobs…</div> : filtered.length ? <div className="table-wrap"><table className="jobs-table"><thead><tr><th>Job</th><th>Status</th><th>PM</th><th>Scripter</th><th>Tester</th><th>Launch date</th><th></th></tr></thead><tbody>{filtered.map(job=><tr key={job.id}>
        <td><strong>{job.project_name}</strong><small>{[job.sw,job.project_number,job.spm_project_number].filter(Boolean).join(' · ') || 'No reference yet'}</small><small>{job.client || 'No client'}</small></td>
        <td><span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status] || pretty(job.status)}</span></td>
        <td><AssignmentCell main={job.main_pm_id} backup={job.backup_pm_id} people={peopleById}/></td>
        <td><AssignmentCell main={job.main_scripter_id} backup={job.backup_scripter_id} people={peopleById}/></td>
        <td><AssignmentCell main={job.main_tester_id} backup={job.backup_tester_id} people={peopleById}/></td>
        <td>{dateLabel(job.launch_date)}</td><td><button className="icon-button" title="Edit job" onClick={()=>openEdit(job)}><Pencil size={16}/></button></td>
      </tr>)}</tbody></table></div> : <EmptyState title="No jobs found" text="Create your first job or adjust your search filters."/>}
    </div>
    {showForm && <JobModal job={editing} people={people} onClose={()=>{setShowForm(false);setEditing(null)}} onSubmit={saveJob}/>}
  </section>
}
function AssignmentCell({main,backup,people}) { return <div className="assignment-cell"><span>{displayName(people[main])}</span><small>Backup: {displayName(people[backup])}</small></div> }
function JobModal({job,people,onClose,onSubmit}) {
  const [saving,setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    await onSubmit(e.currentTarget)
    setSaving(false)
  }

  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="job-modal">
      <header className="modal-header">
        <div>
          <p className="eyebrow">JOB DETAILS</p>
          <h2>{job?'Edit job':'Create a job'}</h2>
          <p className="muted small">Enter the information available now. You can complete the remaining fields later.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose}><X/></button>
      </header>

      <form onSubmit={submit} className="job-form">
        {FIELD_GROUPS.slice(0, 3).map(group =>
          <div className="form-section" key={group.title}>
            <h3>{group.title}</h3>
            <div className="form-grid">
              {group.fields.map(([key,label,type]) =>
                <Field key={key} name={key} label={label} type={type} value={job?.[key]}/>
              )}
            </div>
          </div>
        )}

        <EstimatedTimeSection job={job}/>

        {FIELD_GROUPS.slice(3).map(group =>
          <div className="form-section" key={group.title}>
            <h3>{group.title}</h3>
            <div className="form-grid">
              {group.fields.map(([key,label,type]) =>
                <Field key={key} name={key} label={label} type={type} value={job?.[key]}/>
              )}
            </div>
          </div>
        )}

        <div className="form-section">
          <h3>Team assignments</h3>
          <p className="muted small">Choose one primary and one backup person for each responsibility.</p>
          <div className="assignment-grid">
            {ROLE_ASSIGNMENTS.map(role =>
              <div className="assignment-panel" key={role.title}>
                <h4>{role.title}</h4>
                <label>Primary
                  <select name={role.primary} defaultValue={job?.[role.primary]||''}>
                    <option value="">Not assigned</option>
                    {people.map(p=><option key={p.id} value={p.id}>{displayName(p)}</option>)}
                  </select>
                </label>
                <label>Backup
                  <select name={role.backup} defaultValue={job?.[role.backup]||''}>
                    <option value="">Not assigned</option>
                    {people.map(p=><option key={p.id} value={p.id}>{displayName(p)}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>
            {saving?'Saving…':job?'Save changes':'Create job'}
          </button>
        </div>
      </form>
    </section>
  </div>
}

function EstimatedTimeSection({job}) {
  const timeFields = [
    ['scripting_time_hours', 'Scripting time (hours)'],
    ['changes_time_hours', 'Changes time (hours)'],
    ['testing_time_hours', 'Testing time (hours)'],
    ['mailing_time_hours', 'Mailing time (hours)']
  ]

  const [times, setTimes] = useState(() => ({
    scripting_time_hours: job?.scripting_time_hours ?? '',
    changes_time_hours: job?.changes_time_hours ?? '',
    testing_time_hours: job?.testing_time_hours ?? '',
    mailing_time_hours: job?.mailing_time_hours ?? ''
  }))

  const hasTime = Object.values(times).some(value => value !== '')
  const total = hasTime
    ? timeFields.reduce((sum, [key]) => sum + (Number(times[key]) || 0), 0)
    : ''

  function updateTime(key, value) {
    setTimes(previous => ({...previous, [key]: value}))
  }

  return <div className="form-section">
    <h3>Estimated time</h3>
    <p className="muted small">Enter the estimated hours for each activity. The total is calculated automatically.</p>
    <div className="form-grid">
      {timeFields.map(([key,label]) =>
        <label key={key}>
          {label}
          <input
            name={key}
            type="number"
            min="0"
            step="0.25"
            value={times[key]}
            onChange={e=>updateTime(key,e.target.value)}
            placeholder="0"
          />
        </label>
      )}
      <label>
        Total estimated hours
        <input
          type="number"
          value={total === '' ? '' : total.toFixed(2)}
          readOnly
          aria-readonly="true"
        />
      </label>
      <input type="hidden" name="total_estimated_hours" value={total === '' ? '' : total}/>
    </div>
  </div>
}

function Field({name,label,type,value}) {
  const val = value ?? ''
  if (type==='status') return <label>{label}<select name={name} defaultValue={val || 'new'}>{STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  if (type==='textarea') return <label className="span-2">{label}<textarea name={name} rows="3" defaultValue={val}/></label>
  const inputType = type==='date'?'date':type==='url'?'url':(['number','decimal','money'].includes(type)?'number':'text')
  return <label>{label}<input name={name} type={inputType} min={['number','decimal','money'].includes(type)?'0':undefined} step={type==='number'?'1':(['decimal','money'].includes(type)?'0.01':undefined)} defaultValue={val} required={type==='required'}/></label>
}

function Team({ profile }) {
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const [invite, setInvite] = useState({
    full_name: '',
    email: '',
    role: 'scripter'
  })

  const isAdmin = profile?.role === 'admin'

  async function loadPeople() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,is_active,created_at')
      .order('full_name', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setPeople(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadPeople()
  }, [])

  async function callManagement(actionData) {
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const { data, error } = await supabase.functions.invoke(
        'manage-team',
        { body: actionData }
      )

      if (error) {
        let details = error.message

        if (error.context) {
          try {
            const responseBody = await error.context.json()
            details = responseBody.error || responseBody.message || details
          } catch (e) {
            // Keep the original error.
          }
        }

        throw new Error(details)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setSuccess(data?.message || 'Operation completed successfully.')

      await loadPeople()
      return true

    } catch (err) {
      console.error('Team management error:', err)
      setError(err.message || 'An unexpected error occurred.')
      return false

    } finally {
      setBusy(false)
    }
  }

  async function inviteMember(e) {
    e.preventDefault()

    if (!invite.email.trim()) {
      setError('Email address is required.')
      return
    }

    const completed = await callManagement({
      action: 'invite',
      email: invite.email.trim(),
      full_name: invite.full_name.trim(),
      role: invite.role
    })

    if (completed) {
      setInvite({
        full_name: '',
        email: '',
        role: 'scripter'
      })
    }
  }

  async function updateMember(e, member) {
    e.preventDefault()

    const form = new FormData(e.currentTarget)

    await callManagement({
      action: 'update_member',
      member_id: member.id,
      full_name: form.get('full_name'),
      role: form.get('role')
    })
  }

  async function toggleActive(member) {
    const nextStatus = !member.is_active

    const confirmed = window.confirm(
      nextStatus
        ? `Reactivate ${member.full_name || member.email}?`
        : `Deactivate ${member.full_name || member.email}?`
    )

    if (!confirmed) return

    await callManagement({
      action: 'set_active',
      member_id: member.id,
      is_active: nextStatus
    })
  }

  const activeCount = people.filter(p => p.is_active).length
  const inactiveCount = people.filter(p => !p.is_active).length

  const filteredPeople = people.filter(member => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && member.is_active) ||
      (filter === 'inactive' && !member.is_active)

    const term = query.trim().toLowerCase()

    const matchesSearch =
      !term ||
      (member.full_name || '').toLowerCase().includes(term) ||
      (member.email || '').toLowerCase().includes(term) ||
      (member.role || '').toLowerCase().includes(term)

    return matchesFilter && matchesSearch
  })

  return (
    <section className="page-content">

      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE</p>
          <h1>Team Management</h1>
          <p className="muted">
            Manage team members, roles and account access.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={loadPeople}
          disabled={loading || busy}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && (
        <div className="notice error-notice">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {success && (
        <div className="notice">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}

      {/* Team statistics */}
      <div className="stats-grid">
        <Stat
          icon={<Users />}
          title="Total members"
          value={people.length}
          tone="blue"
        />

        <Stat
          icon={<CheckCircle2 />}
          title="Active members"
          value={activeCount}
          tone="green"
        />

        <Stat
          icon={<AlertCircle />}
          title="Inactive members"
          value={inactiveCount}
          tone="red"
        />
      </div>

      {/* Invite member */}
      {isAdmin && (
        <div className="content-card">
          <div className="card-heading">
            <div>
              <h3><Plus size={18} /> Add team member</h3>
              <p className="muted small">
                Invite a new user or add an existing Supabase account.
              </p>
            </div>
          </div>

          <form onSubmit={inviteMember} className="form-stack">
            <div className="form-grid">

              <label>
                Full name
                <input
                  value={invite.full_name}
                  onChange={e => setInvite({
                    ...invite,
                    full_name: e.target.value
                  })}
                  placeholder="Team member name"
                />
              </label>

              <label>
                Email address
                <input
                  type="email"
                  required
                  value={invite.email}
                  onChange={e => setInvite({
                    ...invite,
                    email: e.target.value
                  })}
                  placeholder="name@example.com"
                />
              </label>

              <label>
                Initial role
                <select
                  value={invite.role}
                  onChange={e => setInvite({
                    ...invite,
                    role: e.target.value
                  })}
                >
                  <option value="scripter">Scripter</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

            </div>

            <div>
              <button
                className="primary-button"
                disabled={busy}
                type="submit"
              >
                <Plus size={16} />
                {busy ? 'Processing…' : 'Add team member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Member directory */}
      <div className="content-card">

        <div className="card-heading">
          <div>
            <h3>
              Team members
              <span className="count-pill">{filteredPeople.length}</span>
            </h3>

            <p className="muted small">
              {isAdmin
                ? 'View active and inactive accounts and manage their access.'
                : 'Team members and their current roles.'}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              placeholder="Search name, email or role…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Status filters */}
        <div className="team-filters">
          <button
            type="button"
            className={filter === 'all' ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilter('all')}
          >
            All ({people.length})
          </button>

          <button
            type="button"
            className={filter === 'active' ? 'filter-button active' : 'filter-button'}
            onClick={() => setFilter('active')}
          >
            Active ({activeCount})
          </button>

          {isAdmin && (
            <button
              type="button"
              className={filter === 'inactive' ? 'filter-button active' : 'filter-button'}
              onClick={() => setFilter('inactive')}
            >
              Inactive ({inactiveCount})
            </button>
          )}
        </div>

        {loading ? (
          <p className="muted">Loading team members…</p>
        ) : filteredPeople.length ? (

          <div className="team-grid">

            {filteredPeople.map(member => (
              <div
                className={`team-card ${!member.is_active ? 'inactive-member' : ''}`}
                key={member.id}
              >

                <div className="avatar large">
                  {(member.full_name || member.email || '?')
                    .slice(0, 1).toUpperCase()}
                </div>

                <div className="team-member-info">

                  {isAdmin ? (
                    <form
                      className="form-stack"
                      onSubmit={e => updateMember(e, member)}
                    >

                      <label>
                        Full name
                        <input
                          name="full_name"
                          defaultValue={member.full_name || ''}
                          placeholder="Full name"
                        />
                      </label>

                      <p className="muted small">
                        {member.email}
                      </p>

                      <label>
                        Role
                        <select
                          name="role"
                          defaultValue={member.role}
                          disabled={member.id === profile.id}
                        >
                          <option value="admin">Admin</option>
                          <option value="team_lead">Team Lead</option>
                          <option value="scripter">Scripter</option>
                          <option value="reviewer">Reviewer</option>
                        </select>
                      </label>

                      <button
                        className="secondary-button"
                        type="submit"
                        disabled={busy}
                      >
                        Save changes
                      </button>

                    </form>
                  ) : (
                    <>
                      <strong>
                        {member.full_name || 'Name not set'}
                      </strong>

                      <p className="muted small">{member.email}</p>

                      <span className="role-pill">
                        {pretty(member.role)}
                      </span>
                    </>
                  )}

                </div>

                <div className="team-member-status">

                  <span className={`presence ${
                    member.is_active ? 'online' : 'offline'
                  }`}>
                    {member.is_active ? 'Active' : 'Inactive'}
                  </span>

                  {isAdmin && member.id !== profile.id && (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy}
                      onClick={() => toggleActive(member)}
                    >
                      {member.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}

                </div>

              </div>
            ))}

          </div>

        ) : (
          <EmptyState
            title={
              filter === 'inactive'
                ? 'No inactive members'
                : 'No team members found'
            }
            text={
              filter === 'inactive'
                ? 'Deactivated accounts will appear here.'
                : 'Try changing your search or filter.'
            }
          />
        )}

      </div>
    </section>
  )
}

function EmptyState({title,text}) { return <div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={22}/></div><strong>{title}</strong><p className="muted small">{text}</p></div> }

export default App
