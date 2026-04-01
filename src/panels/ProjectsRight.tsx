import { useEffect, useState, useMemo } from 'react'
import { PROJECTS } from '../config/projects'
import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ProjectsRight({ visible, onUntypeComplete, onProjectHover, activeProject }: PanelProps) {
  const onUntyped = useUntypeTracker(1 + PROJECTS.length * 3, visible, onUntypeComplete)
  const [typedNames, setTypedNames] = useState<Set<string>>(new Set())

  const nameTypedCallbacks = useMemo(() =>
    Object.fromEntries(PROJECTS.map(p => [p.id, () => setTypedNames(prev => new Set(prev).add(p.id))]))
  , [])

  useEffect(() => {
    if (!visible) {
      setTypedNames(new Set())
    }
  }, [visible])

  return (
    <div id="projects-panel" className="visible">
      <h1 className="panel-title">
        <TypedText text="Projects" visible={visible} speed={35} onUntyped={onUntyped} untypeFrom="start" />
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
              {typedNames.has(project.id) && <img src={project.icon} alt="" className="project-icon" />}
              <span className="project-name">
                <TypedText text={project.name} visible={visible} speed={20} reserveSpace={true} onTyped={nameTypedCallbacks[project.id]} onUntyped={onUntyped} untypeFrom="start" />
              </span>
              {typedNames.has(project.id) && (
                <>
                  <span
                    className="project-link-icon"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(project.github, '_blank', 'noreferrer')
                    }}
                  >
                    <i className="hn hn-github" />
                  </span>
                  <span className="project-link-icon project-link-ext">&#8599;</span>
                </>
              )}
            </div>
            <p className="project-desc">
              <TypedText text={project.desc} visible={visible} speed={8} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
            </p>
            <div className="project-tech-tags">
              <TypedText text={project.tech.join(' · ')} visible={visible} speed={10} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

export default ProjectsRight
