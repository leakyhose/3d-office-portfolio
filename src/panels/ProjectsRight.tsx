import { useState, useMemo } from 'react'
import { PROJECTS } from '../config/projects'
import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

const HIDDEN = { visibility: 'hidden' } as const

function ProjectsRight({ visible, onUntypeComplete, onProjectHover, activeProject }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  // Header icons follow the name's typing so the row reads left -> right:
  // the project icon shows while the name is on screen, the trailing link
  // icons once the name has finished typing. They always occupy their space
  // (visibility only), so the header never shifts.
  const [namePhase, setNamePhase] = useState<Record<string, 'typed' | 'gone'>>({})

  const nameCallbacks = useMemo(() =>
    Object.fromEntries(PROJECTS.map(p => [p.id, {
      onTyped: () => setNamePhase(prev => ({ ...prev, [p.id]: 'typed' })),
      onUntyped: () => setNamePhase(prev => ({ ...prev, [p.id]: 'gone' })),
    }]))
  , [])

  return (
    <UntypeTrackerContext value={tracker}>
      <div id="projects-panel" className="visible">
        <h1 className="panel-title">
          <TypedText text="Projects" icon="code" visible={visible} speed={35} />
        </h1>
        <div className="project-list">
          {PROJECTS.map(project => (
            <a
              key={project.id}
              href={project.link}
              target="_blank"
              rel="noreferrer"
              className={`project-card${activeProject === project.id ? ' project-card-active' : ''}`}
              onMouseEnter={() => onProjectHover?.(project.id)}
            >
              <div className="project-card-header">
                <img src={project.icon} alt="" className="project-icon" style={visible || namePhase[project.id] !== 'gone' ? undefined : HIDDEN} />
                <span className="project-name">
                  <TypedText text={project.name} visible={visible} speed={20} {...nameCallbacks[project.id]} />
                </span>
                <span
                  className="project-link-icon"
                  style={visible && namePhase[project.id] === 'typed' ? undefined : HIDDEN}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(project.github, '_blank', 'noreferrer')
                  }}
                >
                  <i className="hn hn-github" />
                </span>
                <span className="project-link-icon project-link-ext" style={visible && namePhase[project.id] === 'typed' ? undefined : HIDDEN}>&#8599;</span>
              </div>
              <p className="project-desc">
                <TypedText text={project.desc} visible={visible} speed={8} />
              </p>
              <div className="project-tech-tags">
                <TypedText text={project.tech.join(' · ')} visible={visible} speed={10} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </UntypeTrackerContext>
  )
}

export default ProjectsRight
