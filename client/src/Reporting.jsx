import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Settings2, RefreshCw, Users, X, Save, Filter } from 'lucide-react'
import './Reporting.css'

const STATUS_ORDER = ['Pending', 'In-progress', 'Complete', 'Cancel']
const ACTIVE_STATUSES = ['Pending', 'In-progress']

function weekBounds(value) {
  const date = new Date(value + 'T12:00:00')
  const day = (date.getDay() + 6) % 7
  const start = new Date(date)
  start.setDate(date.getDate() - day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return [start, end]
}

function dateInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function complexityNumber(value) {
  const match = String(value || '').match(/[1-5]/)
  return match ? Number(match[0]) : 0
}

function complexityLabel(value, config) {
  const n = complexityNumber(value)
  const group = (config.complexity || []).find(item => n >= Number(item.min) && n <= Number(item.max))
  return group ? group.label : 'Unspecified'
}

function statusLabel(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'completed' || text === 'complete') return 'Complete'
  if (text === 'cancelled' || text === 'canceled' || text === 'cancel') return 'Cancel'
  if (text === 'in progress' || text === 'in-progress') return 'In-progress'
  return 'Pending'
}

function mondayOf(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

export default function Reporting({ user, onBack }) {
  const isManager = ['admin', 'team_lead'].includes(user?.role)
  const [tab, setTab] = useState('daily')
  const [data, setData] = useState({ records: [], assignmentHistory: [], config: null })
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('')
  const [showAllStatuses, setShowAllStatuses] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filterScripter, setFilterScripter] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterComplexity, setFilterComplexity] = useState('all')
  const [search, setSearch] = useState('')
  const [weekDate, setWeekDate] = useState(dateInputValue(mondayOf(new Date())))
  const [draft, setDraft] = useState(null)

  async function load() {
    setBusy(true)
    try {
      const response = await fetch('/api/kpi-weekly', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reporting-data' })
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load reporting.')
      setData({ records: result.records || [], assignmentHistory: result.assignmentHistory || [], config: result.config })
      setDraft(JSON.parse(JSON.stringify(result.config)))
      setNotice('')
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  const config = data.config || { statuses: [], complexity: [], clusters: [], weekly: {} }
  const members = data.records
  const scripters = useMemo(() => {
    const names = new Set()
    ;(data.config?.clusters || []).forEach(cluster => (cluster.members || []).forEach(email => names.add(email)))
    // Keep the column set aligned with the team directory returned with KPI data.
    return Array.from(new Set(members.map(record => String(record.sw || '').trim()).filter(Boolean))).sort()
  }, [members, data.config])
  const columns = useMemo(() => {
    const clusterNames = (config.clusters || []).flatMap(cluster => cluster.members || [])
    const known = new Map()
    // Records store the display name; resolve against cluster directory by matching known team names from the config.
    clusterNames.forEach(email => known.set(email.toLowerCase(), email))
    const names = new Set(scripters)
    return Array.from(names).sort((a,b) => a.localeCompare(b))
  }, [scripters, config.clusters])

  const visibleStatuses = showAllStatuses ? STATUS_ORDER : ACTIVE_STATUSES
  const filtered = useMemo(() => data.records.filter(record => {
    const status = statusLabel(record.status)
    if (!visibleStatuses.includes(status)) return false
    if (filterScripter !== 'all' && String(record.sw || '').trim() !== filterScripter) return false
    if (filterStatus !== 'all' && status !== filterStatus) return false
    if (filterComplexity !== 'all' && complexityLabel(record.complexityAsSpm, config) !== filterComplexity) return false
    const term = search.trim().toLowerCase()
    if (term && ![record.projectName, record.projectNumber, record.spmProjectNumber, record.client].some(v => String(v || '').toLowerCase().includes(term))) return false
    return true
  }), [data.records, visibleStatuses, filterScripter, filterStatus, filterComplexity, search, config])

  const dailyRows = useMemo(() => {
    const labels = (config.complexity || []).map(item => item.label).concat('Unspecified')
    return visibleStatuses.flatMap(status => labels.map(complexity => ({
      key: status + '|' + complexity, status, complexity,
      counts: columns.map(name => filtered.filter(record => String(record.sw || '').trim() === name && statusLabel(record.status) === status && complexityLabel(record.complexityAsSpm, config) === complexity).length),
      unassigned: filtered.filter(record => !String(record.sw || '').trim() && statusLabel(record.status) === status && complexityLabel(record.complexityAsSpm, config) === complexity).length
    })).filter(row => row.counts.some(Boolean) || row.unassigned))
  }, [visibleStatuses, config, columns, filtered])

  const [weekStart, weekEnd] = weekBounds(weekDate)
  const weeklyEvents = useMemo(() => data.assignmentHistory.filter(event => {
    const timestamp = new Date(event.timestamp)
    return timestamp >= weekStart && timestamp < weekEnd
  }), [data.assignmentHistory, weekStart.getTime(), weekEnd.getTime()])
  const newAssignments = weeklyEvents.filter(event => event.eventType === 'new_assignment')
  const reassignments = weeklyEvents.filter(event => event.eventType === 'reassignment' || event.eventType === 'unassignment')
  const clusterRows = (config.clusters || []).map(cluster => {
    const emails = new Set(cluster.members || [])
    const names = columns.filter(name => {
      const member = data.teamMembers?.find(item => item.name === name)
      return member && emails.has(member.email.toLowerCase())
    })
    // Resolve stored SW display names against the canonical member directory.
    const assignedNames = (cluster.members || []).map(email => {
      const member = data.teamMembers?.find(item => item.email.toLowerCase() === email.toLowerCase())
      return member?.name || email
    })
    const perScripter = assignedNames.map(name => ({
      name,
      count: newAssignments.filter(event => event.newScripter === name).length
    }))
    return { ...cluster, perScripter, total: perScripter.reduce((sum, item) => sum + item.count, 0) }
  })
  const weeklyTotals = clusterRows.reduce((sum, cluster) => sum + cluster.total, 0)

  async function saveConfig() {
    if (!draft) return
    setBusy(true)
    try {
      const response = await fetch('/api/kpi-weekly', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-reporting-config', config: draft })
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to save Reporting Configuration.')
      setData(previous => ({ ...previous, config: result.config }))
      setDraft(JSON.parse(JSON.stringify(result.config)))
      setNotice('Reporting Configuration saved.')
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  function openDrilldown(status, complexity, scripter) {
    setSelected({ status, complexity, scripter })
  }

  const drilldownRecords = selected ? data.records.filter(record =>
    statusLabel(record.status) === selected.status &&
    complexityLabel(record.complexityAsSpm, config) === selected.complexity &&
    (selected.scripter === 'Unassigned' ? !String(record.sw || '').trim() : String(record.sw || '').trim() === selected.scripter)
  ) : []

  return <main className="sf-reporting-page">
    <header className="sf-reporting-header">
      <div><span className="sf-reporting-eyebrow">SCRIPTFLOW · TEAM PERFORMANCE</span><h1>Reporting</h1><p>Daily workload and weekly assignment activity, sourced from your KPI spreadsheet.</p></div>
      <div className="sf-reporting-actions"><button className="sf-reporting-btn light" onClick={onBack}>KPI Migration</button><button className="sf-reporting-btn light" onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
    </header>
    <nav className="sf-reporting-tabs">
      <button className={tab === 'daily' ? 'active' : ''} onClick={() => {setTab('daily');setSelected(null)}}><BarChart3 size={16}/> Daily Reporting</button>
      {isManager && <button className={tab === 'weekly' ? 'active' : ''} onClick={() => {setTab('weekly');setSelected(null)}}><CalendarDays size={16}/> Weekly Reporting</button>}
      {isManager && <button className={tab === 'config' ? 'active' : ''} onClick={() => {setTab('config');setSelected(null)}}><Settings2 size={16}/> Reporting Configuration</button>}
    </nav>
    {notice && <div className="sf-reporting-notice">{notice}</div>}
    {busy && !data.config ? <div className="sf-reporting-empty">Loading reporting data…</div> : <>
      {tab === 'daily' && <>
        <section className="sf-reporting-summary">
          <div><small>Projects in current view</small><strong>{filtered.length}</strong></div>
          <div><small>Pending</small><strong>{filtered.filter(r => statusLabel(r.status) === 'Pending').length}</strong></div>
          <div><small>In progress</small><strong>{filtered.filter(r => statusLabel(r.status) === 'In-progress').length}</strong></div>
          <div><small>Unassigned</small><strong>{filtered.filter(r => !String(r.sw || '').trim()).length}</strong></div>
        </section>
        <section className="sf-reporting-panel">
          <div className="sf-reporting-panel-head"><div><h2>Daily workload by scripter</h2><p>Counts are grouped by status and SPM complexity. Select a count to inspect its projects.</p></div><label className="sf-reporting-toggle"><input type="checkbox" checked={showAllStatuses} onChange={e => setShowAllStatuses(e.target.checked)}/> Show all statuses</label></div>
          {isManager && <div className="sf-reporting-filters">
            <label><Filter size={14}/> Scripter<select value={filterScripter} onChange={e=>setFilterScripter(e.target.value)}><option value="all">All scripters</option>{columns.map(name=><option key={name}>{name}</option>)}</select></label>
            <label>Status<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="all">All visible statuses</option>{visibleStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
            <label>Complexity<select value={filterComplexity} onChange={e=>setFilterComplexity(e.target.value)}><option value="all">All complexity</option>{(config.complexity||[]).map(item=><option key={item.label}>{item.label}</option>)}<option>Unspecified</option></select></label>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search project or client"/>
          </div>}
          <div className="sf-reporting-table-wrap"><table className="sf-reporting-table"><thead><tr><th>Status</th><th>Complexity</th>{columns.map(name=><th key={name}>{name}</th>)}<th>Unassigned</th><th>Total</th></tr></thead><tbody>
            {dailyRows.map(row=><tr key={row.key}><td><span className={'sf-reporting-status '+row.status.toLowerCase().replace(/[^a-z]+/g,'-')}>{row.status}</span></td><td>{row.complexity}</td>{row.counts.map((count,index)=><td key={columns[index]}>{count ? <button className="sf-reporting-count" onClick={()=>openDrilldown(row.status,row.complexity,columns[index])}>{count}</button> : '—'}</td>)}<td>{row.unassigned ? <button className="sf-reporting-count" onClick={()=>openDrilldown(row.status,row.complexity,'Unassigned')}>{row.unassigned}</button> : '—'}</td><td><b>{row.counts.reduce((sum,n)=>sum+n,0)+row.unassigned}</b></td></tr>)}
            {!dailyRows.length && <tr><td colSpan={columns.length+4} className="sf-reporting-empty-cell">No projects match the selected view.</td></tr>}
          </tbody></table></div>
        </section>
        {selected && <section className="sf-reporting-panel"><div className="sf-reporting-panel-head"><div><h2>{selected.status} · {selected.complexity} · {selected.scripter}</h2><p>{drilldownRecords.length} matching projects</p></div><button className="sf-reporting-icon-btn" onClick={()=>setSelected(null)}><X size={16}/></button></div><ProjectList records={drilldownRecords}/></section>}
      </>}
      {tab === 'weekly' && isManager && <>
        <section className="sf-reporting-panel"><div className="sf-reporting-panel-head"><div><h2>Weekly assignment overview</h2><p>Counts new assignments by assignment timestamp, not record creation date. Reassignments are reported separately.</p></div><label className="sf-reporting-date">Week containing <input type="date" value={weekDate} onChange={e=>setWeekDate(e.target.value)}/></label></div>
          <p className="sf-reporting-week-range">{weekStart.toLocaleDateString()} – {new Date(weekEnd.getTime()-86400000).toLocaleDateString()}</p>
          <div className="sf-reporting-summary"><div><small>New assignments</small><strong>{newAssignments.length}</strong></div><div><small>Reassignments</small><strong>{reassignments.filter(e=>e.eventType==='reassignment').length}</strong></div><div><small>Unassignments</small><strong>{reassignments.filter(e=>e.eventType==='unassignment').length}</strong></div><div><small>Cluster total</small><strong>{weeklyTotals}</strong></div></div>
          <div className="sf-reporting-table-wrap"><table className="sf-reporting-table"><thead><tr><th>Cluster</th>{clusterRows.flatMap(c=>c.perScripter).map((person,i)=><th key={i}>{person.name}</th>)}<th>Cluster total</th></tr></thead><tbody>{clusterRows.map(cluster=><tr key={cluster.id}><td><b>{cluster.name}</b></td>{clusterRows.flatMap(c=>c.perScripter).map((person,i)=><td key={i}>{cluster.perScripter.find(p=>p.name===person.name)?.count ?? '—'}</td>)}<td><b>{cluster.total}</b></td></tr>)}<tr><td><b>Team total</b></td>{clusterRows.flatMap(c=>c.perScripter).map((person,i)=><td key={i}><b>{newAssignments.filter(e=>e.newScripter===person.name).length}</b></td>)}<td><b>{weeklyTotals}</b></td></tr></tbody></table></div>
        </section>
        <section className="sf-reporting-panel"><div className="sf-reporting-panel-head"><div><h2>Assignment changes</h2><p>Reassignments and unassignments are not included in the new-assignment total.</p></div></div><ProjectList records={reassignments.map(event=>({id:event.id,projectName:event.projectName,projectNumber:event.projectNumber,status:event.eventType.replace('_',' '),sw:event.newScripter||'Unassigned',client:event.previousScripter?'From: '+event.previousScripter:'',submittedAt:event.timestamp}))}/></section>
      </>}
      {tab === 'config' && isManager && draft && <section className="sf-reporting-panel">
        <div className="sf-reporting-panel-head"><div><h2>Reporting Configuration</h2><p>Changes are shared with everyone and recorded in the configuration history sheet.</p></div><button className="sf-reporting-btn primary" onClick={saveConfig} disabled={busy}><Save size={14}/> Save configuration</button></div>
        <div className="sf-reporting-config-section"><h3>Clusters and membership</h3><p>Each team member belongs to one cluster. Cluster lead is a separate designation and does not change their ScriptFlow role.</p>
          {draft.clusters.map((cluster,index)=><div className="sf-reporting-cluster" key={cluster.id}><div className="sf-reporting-cluster-top"><input aria-label="Cluster name" value={cluster.name} onChange={e=>setDraft(v=>({...v,clusters:v.clusters.map((c,i)=>i===index?{...c,name:e.target.value}:c)}))}/><label>Cluster lead<select value={cluster.leadEmail||''} onChange={e=>setDraft(v=>({...v,clusters:v.clusters.map((c,i)=>i===index?{...c,leadEmail:e.target.value}:c)}))}><option value="">Not set</option>{(data.teamMembers||[]).map(member=><option key={member.email} value={member.email}>{member.name}</option>)}</select></label></div>
            <div className="sf-reporting-member-grid">{(data.teamMembers||[]).map(member=><label key={member.email}><input type="checkbox" checked={(cluster.members||[]).includes(member.email.toLowerCase())} onChange={e=>setDraft(v=>({...v,clusters:v.clusters.map((c,i)=>i===index?{...c,members:e.target.checked?[...(c.members||[]),member.email.toLowerCase()]:c.members.filter(email=>email!==member.email.toLowerCase())}:c)}))}/><span>{member.name}<small>{member.roleLabel}</small></span></label>)}</div>
          </div>)}
          <button className="sf-reporting-btn light" onClick={()=>setDraft(v=>({...v,clusters:[...v.clusters,{id:'cluster-'+Date.now(),name:'New cluster',leadEmail:'',members:[]}]}))}><Users size={14}/> Add cluster</button>
        </div>
        <div className="sf-reporting-config-section"><h3>Status and complexity groupings</h3><p>Initial complexity ranges: Easy 1–2, Medium 3, High 4–5. Active workload view defaults to Pending and In-progress.</p>
          <div className="sf-reporting-config-grid">{draft.complexity.map((item,index)=><label key={item.label}>{item.label}<div><input type="number" min="1" max="5" value={item.min} onChange={e=>setDraft(v=>({...v,complexity:v.complexity.map((c,i)=>i===index?{...c,min:Number(e.target.value)}:c)}))}/><span>to</span><input type="number" min="1" max="5" value={item.max} onChange={e=>setDraft(v=>({...v,complexity:v.complexity.map((c,i)=>i===index?{...c,max:Number(e.target.value)}:c)}))}/></div></label>)}</div>
          <div className="sf-reporting-status-config">{draft.statuses.map((item,index)=><label key={item.name}><input type="checkbox" checked={item.visible} onChange={e=>setDraft(v=>({...v,statuses:v.statuses.map((s,i)=>i===index?{...s,visible:e.target.checked}:s)}))}/>{item.name}<small>{item.active?'Included in active workload':'Shown in all-status view'}</small></label>)}</div>
        </div>
      </section>}
    </>}
    <footer className="sf-reporting-footer">ScriptFlow · Reporting · Google Sheets</footer>
  </main>
}

function ProjectList({ records }) {
  return <div className="sf-reporting-table-wrap"><table className="sf-reporting-table"><thead><tr><th>Project</th><th>Project number</th><th>Status / change</th><th>SW</th><th>Details</th></tr></thead><tbody>{records.map(record=><tr key={record.id}><td><b>{record.projectName||'—'}</b></td><td>{record.projectNumber||'—'}</td><td>{record.status||'—'}</td><td>{record.sw||'Unassigned'}</td><td>{record.client||record.complexityAsSpm||'—'}</td></tr>)}{!records.length&&<tr><td colSpan="5" className="sf-reporting-empty-cell">No records to display.</td></tr>}</tbody></table></div>
}
