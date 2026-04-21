import { getProjectProgress } from '../utils/scoring'

export default function ProjectsPage({ projects, tasks, goals, onEdit, onDelete, onQuickCreate }) {
  return (
    <div className="screen-stack">
      <section className="card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Build Zone</p>
            <h3>Projects</h3>
          </div>
          <button className="primary-btn" onClick={() => onQuickCreate('project')}>Add Project</button>
        </div>
      </section>

      {projects.map((project) => {
        const linkedGoal = goals.find((goal) => goal.id === project.goalId)
        return (
          <section className="card" key={project.id}>
            <div className="metric-row">
              <h3>{project.title}</h3>
              <span className="status-pill">{project.status}</span>
            </div>
            <p>{project.description}</p>
            <div className="metric-row">
              <span>Due {project.dueDate}</span>
              <strong>{getProjectProgress(project.id, tasks)}%</strong>
            </div>
            <p className="muted">Goal: {linkedGoal?.title || 'Not linked yet'}</p>
            <div className="item-actions aligned-right">
              <button className="ghost-btn" onClick={() => onEdit('project', project)}>Edit</button>
              <button className="ghost-btn" onClick={() => onDelete('project', project.id)}>Delete</button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
