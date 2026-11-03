import { useState, useMemo } from 'react'
import { PROJECTS } from '../config/projects'
import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import SectionNav from './SectionNav'
import type { PanelProps } from '../types'

const HIDDEN = { visibility: 'hidden' } as const

/*
 * A project is previewed on the monitor while it's "selected": hovered with a
 * mouse, focused from the keyboard, or tapped (outside its links) on touch.
 * The name opens the live project, the GitHub mark opens the source.
 */
function ProjectsPanel({ visible, onNavigate, onUntypeComplete, onNavHoverChange, onProjectSelect, activeProject }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  // The icons follow the name's typing so each header reads left -> right.
  // They always occupy their space (visibility only), so nothing shifts.
  const [namePhase, setNamePhase] = useState<Record<string, 'typed' | 'gone'>>({})
  const nameCallbacks = useMemo(() =>
    Object.fromEntries(PROJECTS.map(p => [p.id, {
      onTyped: () => setNamePhase(prev => ({ ...prev, [p.id]: 'typed' })),
      onUntyped: () => setNamePhase(prev => ({ ...prev, [p.id]: 'gone' })),
    }]))
  , [])

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="projects-panel" className="panel panel-right" tabIndex={-1} aria-label="Projects">
        <h1 className="panel-title">
          <TypedText text="Projects" icon="code" visible={visible} speed={35} />
        </h1>
        <ul className="project-list">
          {PROJECTS.map(project => {
            const typed = visible && namePhase[project.id] === 'typed'
            return (
              <li
                key={project.id}
                className={`project${activeProject === project.id ? ' is-active' : ''}`}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') onProjectSelect?.(project.id) }}
                onFocus={() => onProjectSelect?.(project.id)}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) onProjectSelect?.(project.id)
                }}
              >
                <h2 className="project-header">
                  <img src={project.icon} alt="" className="project-icon" style={visible || namePhase[project.id] !== 'gone' ? undefined : HIDDEN} />
                  <a className="project-name" href={project.link} target="_blank" rel="noreferrer">
                    <TypedText text={project.name} visible={visible} speed={20} {...nameCallbacks[project.id]} />
                    <span className="external-mark" aria-hidden="true" style={typed ? undefined : HIDDEN}>&#8599;</span>
                  </a>
                  <a
                    className="project-source"
                    href={project.github}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${project.name} source on GitHub`}
                    title="Source on GitHub"
                    style={typed ? undefined : HIDDEN}
                  >
                    <i className="hn hn-github" aria-hidden="true" />
                  </a>
                </h2>
                <p className="project-desc">
                  <TypedText text={project.desc} visible={visible} speed={8} />
                </p>
                <p className="project-tech">
                  <TypedText text={project.tech.join(', ')} visible={visible} speed={10} />
                </p>
              </li>
            )
          })}
        </ul>
        <SectionNav current="projects" visible={visible} onNavigate={onNavigate} onHoverChange={onNavHoverChange} />
      </section>
    </UntypeTrackerContext>
  )
}

export default ProjectsPanel
