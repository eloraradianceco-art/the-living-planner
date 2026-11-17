// Projects.
import { useState } from 'react'
import { Target, Folder, Check } from 'lucide-react'
import { isOverdue, shortDate, fmtRange } from '../lib/dates.js'
import { normalizeSteps, getProjectProgress } from '../lib/steps.js'
import { PageNav } from '../components/PageNav.jsx'
import { ReadyToComplete, isReadyDismissed, StepsChecklist } from '../components/StepsChecklist.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { PageHeader } from '../components/PageHeader.jsx'

function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate, onStepsChange, onUpdate, onToggle }) {
  const [filter, setFilter] = useState('All')
  const [, bumpReady] = useState(0) // re-render after "Not yet" on a finished project
  const [expandedId, setExpandedId] = useState(null)

  const STATUS_ORDER = ['Active', 'In Progress', 'On Hold', 'Completed']
  const STATUS_STYLE = {
    Active:        { color:'var(--brass-fg)',  bg: 'var(--brass-dim)' },
    'In Progress': { color: '#B26B12',        bg: 'rgba(233,149,42,.14)' },
    'On Hold':     { color: 'var(--muted)',   bg: 'var(--stone2)' },
    Completed:     { color: 'var(--success)', bg: 'rgba(34,197,94,.12)' },
  }
  const rank = (p) => { const i = STATUS_ORDER.indexOf(p.status); return i < 0 ? 0 : i }
  const filtered = (filter === 'All' ? projects : projects.filter(p => p.status === filter))
    .slice().sort((a, b) => rank(a) - rank(b))

  return (
    <div className="screen-stack">
      <PageHeader icon={Folder} title="Projects" subtitle="Big things, one step at a time." />

      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Your projects</p>
            <div style={{fontSize:'.78rem', color:'var(--muted)', marginTop:2}}>
              {projects.filter(p=>p.status!=='Completed').length} active · {projects.filter(p=>p.status==='Completed').length} done
            </div>
          </div>
          <button className="primary-btn" style={{fontSize:'.8rem', padding:'6px 14px'}} onClick={() => onQuickCreate('project')}>+ Project</button>
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {['All', ...STATUS_ORDER].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding:'5px 12px', borderRadius:999, border:'1.5px solid', fontSize:'.78rem',
              cursor:'pointer', fontFamily:'inherit', fontWeight:600,
              borderColor: filter===s ? 'var(--brass)' : 'var(--border2)',
              background: filter===s ? 'var(--brass-dim)' : 'transparent',
              color: filter===s ? 'var(--brass-fg)' : 'var(--muted)'
            }}>{s}</button>
          ))}
        </div>
      </section>

      {filtered.length === 0 && (
        <section className="card">
          <EmptyState icon="📁"
            title={projects.length ? `No ${filter.toLowerCase()} projects` : 'Build something meaningful'}
            message={projects.length ? 'Try another filter.' : 'Name the project, then list the steps. Check them off as you go.'}
            action={projects.length ? null : '+ Add your first project'} onAction={() => onQuickCreate('project')} />
        </section>
      )}

      {filtered.map((project) => {
        const linkedGoal = goals.find(g => g.id === project.goalId)
        const projectTasks = tasks.filter(t => t.linkedProjectId === project.id)
        const completedTasks = projectTasks.filter(t => t.completed).length
        const steps = normalizeSteps(project.steps)
        const stepsDone = steps.filter(st => st.done).length
        const progress = getProjectProgress(project, tasks)
        const isExpanded = expandedId === project.id
        const overdueTasks = projectTasks.filter(t => !t.completed && isOverdue(t.date))
        const st = STATUS_STYLE[project.status] || STATUS_STYLE['On Hold']
        const summary = [
          steps.length ? `${stepsDone}/${steps.length} steps` : null,
          projectTasks.length ? `${completedTasks}/${projectTasks.length} tasks` : null,
        ].filter(Boolean).join(' · ') || 'No steps yet'

        return (
          <section key={project.id} className="card" style={{padding:'16px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                  <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)'}}>{project.title}</div>
                  <span style={{fontSize:'.68rem', padding:'2px 8px', borderRadius:999, fontWeight:700, background: st.bg, color: st.color}}>{project.status}</span>
                </div>
                {project.description && (
                  <div style={{fontSize:'.82rem', color:'var(--muted)', lineHeight:1.5, marginBottom:6}}>{project.description}</div>
                )}
              </div>
              <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.75rem', padding:'4px 8px'}} onClick={() => onEdit('project', project)}>Edit</button>
                <button style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer'}} onClick={() => onDelete('project', project.id)} aria-label="Delete project">✕</button>
              </div>
            </div>

            <div style={{marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                <span style={{fontSize:'.75rem', color:'var(--muted)'}}>
                  {summary}{project.dueDate ? ` · Due ${shortDate(project.dueDate)}` : ''}
                </span>
                <span style={{fontSize:'.82rem', fontWeight:700, color: progress >= 100 ? 'var(--success)' : 'var(--brass-fg)'}}>{progress}%</span>
              </div>
              <div style={{height:6, borderRadius:999, background:'var(--stone2)', overflow:'hidden'}}>
                <div style={{
                  height:'100%', borderRadius:999, width:`${progress}%`,
                  background: progress >= 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--brass2), var(--brass))',
                  transition:'width .4s'
                }} />
              </div>
            </div>

            {(linkedGoal || overdueTasks.length > 0) && (
              <div style={{display:'flex', gap:12, fontSize:'.75rem', color:'var(--muted)', flexWrap:'wrap', alignItems:'center'}}>
                {linkedGoal && <span style={{display:'inline-flex', alignItems:'center', gap:5}}><Target size={13} color="var(--brass)" /> {linkedGoal.title}</span>}
                {overdueTasks.length > 0 && <span style={{color:'var(--danger)', fontWeight:600}}>⚠ {overdueTasks.length} overdue</span>}
              </div>
            )}

            {project.status !== 'Completed' && onUpdate && progress >= 100 && (
              <ReadyToComplete id={project.id} kind="project" onDismiss={() => bumpReady((n) => n + 1)} onComplete={() => onUpdate('project', { ...project, status: 'Completed' }, 'edit')} />
            )}

            <StepsChecklist
              steps={steps}
              onChange={(next) => onStepsChange && onStepsChange(project.id, next)}
              onSchedule={(step) => onQuickCreate('task', { title: step.text, linkedProjectId: project.id, linkedGoalId: project.goalId || '' })}
              hideDoneNote={progress >= 100}
              completeSlot={project.status !== 'Completed' && onUpdate && progress < 100 && (
                <button type="button" className="steps-complete-btn" onClick={() => onUpdate('project', { ...project, status: 'Completed' }, 'edit')}>Mark project complete</button>
              )} />

            <div style={{display:'flex', gap:12, alignItems:'center', marginTop:12, flexWrap:'wrap'}}>
              {projectTasks.length > 0 && (
                <button onClick={() => setExpandedId(isExpanded ? null : project.id)}
                  style={{background:'none', border:'none', color:'var(--ink2)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0}}>
                  {isExpanded ? '▲ Hide tasks' : `▼ Show ${projectTasks.length} scheduled task${projectTasks.length!==1?'s':''}`}
                </button>
              )}
              <button onClick={() => onQuickCreate('task', { linkedProjectId: project.id, linkedGoalId: project.goalId || '' })}
                style={{background:'none', border:'none', color:'var(--brass-fg)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0}}>
                + Schedule a task
              </button>
              {project.status !== 'Completed' && onUpdate && progress >= 100 && isReadyDismissed('project', project.id) && (
                <button onClick={() => onUpdate('project', { ...project, status: 'Completed' }, 'edit')}
                  style={{background:'none', border:'none', color:'var(--success)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0}}>Mark project complete</button>
              )}
            </div>

            {isExpanded && (
              <div style={{borderTop:'1px solid var(--border)', paddingTop:8, marginTop:10}}>
                {projectTasks.map(task => (
                  <div key={task.id} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)'}}>
                    <button type="button" onClick={() => onToggle && onToggle(task.id)}
                      aria-label={task.completed ? 'Mark task not done' : 'Mark task done'}
                      className={'step-check' + (task.completed ? ' done' : '')}>
                      {task.completed && <Check size={13} strokeWidth={3} color="var(--warm-white)" />}
                    </button>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:'.88rem', color: task.completed ? 'var(--muted)' : 'var(--text)', fontWeight:500, textDecoration: task.completed ? 'line-through' : 'none'}}>{task.title}</div>
                      {task.date && <div style={{fontSize:'.72rem', color: isOverdue(task.date) && !task.completed ? 'var(--danger)' : 'var(--muted)'}}>{shortDate(task.date)}{task.time ? ` · ${fmtRange(task.time, task.endTime)}` : ''}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <PageNav />
    </div>
  )
}

export { ProjectsPage }
