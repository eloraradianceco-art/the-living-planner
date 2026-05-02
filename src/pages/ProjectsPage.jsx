import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePlannerData } from '../context/PlannerContext.jsx'
import { getProjectProgress } from '../utils/scoring.js'

function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate }) {
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)

  const STATUS_ORDER = ['Active', 'In Progress', 'On Hold', 'Completed']
  const STATUS_COLOR = {
    Active: 'var(--teal)',
    'In Progress': 'var(--warning)',
    'On Hold': 'var(--muted)',
    Completed: 'var(--success)',
  }

  const filtered = filter === 'All' ? projects : projects.filter(p => p.status === filter)

  return (
    <div className="screen-stack">

      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <div>
            <p className="eyebrow">Projects</p>
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
              borderColor: filter===s ? 'var(--teal)' : 'var(--border2)',
              background: filter===s ? 'var(--teal-dim)' : 'transparent',
              color: filter===s ? 'var(--teal)' : 'var(--muted)'
            }}>{s}</button>
          ))}
        </div>
      </section>

      {/* ── Empty state ─────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <section className="card" style={{textAlign:'center', padding:'32px 20px'}}>
          <div style={{fontSize:'2rem', marginBottom:12}}>📁</div>
          <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)', marginBottom:6}}>No projects yet</div>
          <p className="muted" style={{fontSize:'.85rem', marginBottom:16}}>Projects connect your tasks and goals into focused workstreams.</p>
          <button className="primary-btn" onClick={() => onQuickCreate('project')}>Create your first project</button>
        </section>
      )}

      {/* ── Project cards ────────────────────────────────────────── */}
      {filtered.map((project) => {
        const linkedGoal = goals.find(g => g.id === project.goalId)
        const projectTasks = tasks.filter(t => t.linkedProjectId === project.id)
        const completedTasks = projectTasks.filter(t => t.completed).length
        const progress = getProjectProgress(project.id, tasks)
        const isExpanded = expandedId === project.id
        const overdueTasks = projectTasks.filter(t => !t.completed && isOverdue(t.date))

        return (
          <section key={project.id} className="card" style={{padding:'14px'}}>
            {/* Project header */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                  <div style={{fontWeight:700, fontSize:'1rem', color:'var(--text)'}}>{project.title}</div>
                  <span style={{
                    fontSize:'.68rem', padding:'2px 8px', borderRadius:999, fontWeight:700,
                    background: (STATUS_COLOR[project.status]||'var(--muted)')+'20',
                    color: STATUS_COLOR[project.status]||'var(--muted)'
                  }}>{project.status}</span>
                </div>
                {project.description && (
                  <div style={{fontSize:'.82rem', color:'var(--muted)', lineHeight:1.5, marginBottom:6}}>{project.description}</div>
                )}
              </div>
              <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:8}}>
                <button className="ghost-btn" style={{fontSize:'.75rem', padding:'4px 8px'}} onClick={() => onEdit('project', project)}>Edit</button>
                <button style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer'}} onClick={() => onDelete('project', project.id)}>✕</button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                <span style={{fontSize:'.75rem', color:'var(--muted)'}}>
                  {`${completedTasks}/${projectTasks.length} tasks · Due ${project.dueDate}`}
                </span>
                <span style={{fontSize:'.82rem', fontWeight:700, color: progress >= 100 ? 'var(--success)' : 'var(--teal)'}}>{progress}%</span>
              </div>
              <div style={{height:6, borderRadius:999, background:'var(--surface)', overflow:'hidden'}}>
                <div style={{
                  height:'100%', borderRadius:999,
                  width:`${progress}%`,
                  background: progress >= 100 ? 'var(--success)' : progress >= 60 ? 'var(--teal)' : progress >= 30 ? 'var(--warning)' : 'var(--danger)',
                  transition:'width .4s'
                }} />
              </div>
            </div>

            {/* Meta row */}
            <div style={{display:'flex', gap:12, fontSize:'.75rem', color:'var(--muted)', marginBottom:8, flexWrap:'wrap'}}>
              {linkedGoal && <span>🎯 {linkedGoal.title}</span>}
              {overdueTasks.length > 0 && <span style={{color:'var(--danger)', fontWeight:600}}>⚠ {overdueTasks.length} overdue</span>}
            </div>

            {/* Task list toggle */}
            {projectTasks.length > 0 && (
              <button onClick={() => setExpandedId(isExpanded ? null : project.id)}
                style={{background:'none', border:'none', color:'var(--teal)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, fontFamily:'inherit', padding:0, marginBottom: isExpanded ? 10 : 0}}>
                {isExpanded ? '▲ Hide tasks' : `▼ Show ${projectTasks.length} task${projectTasks.length!==1?'s':''}`}
              </button>
            )}

            {/* Expanded task list */}
            {isExpanded && (
              <div style={{borderTop:'1px solid var(--surface)', paddingTop:10}}>
                {projectTasks.map(task => (
                  <div key={task.id} style={{display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--surface)'}}>
                    <div style={{
                      width:18, height:18, borderRadius:'50%', border:'2px solid', flexShrink:0,
                      borderColor: task.completed ? 'var(--success)' : 'var(--teal)',
                      background: task.completed ? 'var(--success)' : 'transparent',
                      display:'grid', placeItems:'center'
                    }}>
                      {task.completed && <span style={{color:'white', fontSize:'.6rem', fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:'.88rem', color: task.completed ? 'var(--muted)' : 'var(--text)', fontWeight:500, textDecoration: task.completed ? 'line-through' : 'none'}}>{task.title}</div>
                      {task.date && <div style={{fontSize:'.72rem', color: isOverdue(task.date) && !task.completed ? 'var(--danger)' : 'var(--muted)'}}>{task.date}</div>}
                    </div>
                  </div>
                ))}
                <button className="ghost-btn" style={{fontSize:'.78rem', padding:'6px 12px', marginTop:8}} onClick={() => onQuickCreate('task', {linkedProjectId: project.id})}>
                  + Add task to this project
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}



export default ProjectsPage
