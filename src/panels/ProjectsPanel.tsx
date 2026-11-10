import { PROJECTS } from '../config/projects'
import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import SectionNav from './SectionNav'
import type { PanelProps } from '../types'

// A pixel "↗". Not the U+2197 glyph: VT323 doesn't have it, and the first
// system font-fallback lookup costs ~30 ms of layout when the panel mounts.
function ExternalMark() {
  return (
    <svg className="external-mark" viewBox="0 0 9 9" aria-hidden="true">
      <path d="M3 0h6v6H7V2H3zM5 2h2v2H5zM4 3h2v2H4zM3 4h2v2H3zM2 5h2v2H2zM1 6h2v2H1zM0 7h2v2H0z" />
    </svg>
  )
}

/*
 * A project is previewed on the monitor while it's "selected": hovered with a
 * mouse, focused from the keyboard, or tapped (outside its links) on touch.
 * The name opens the live project, the GitHub mark opens the source.
 */
function ProjectsPanel({ visible, onNavigate, onUntypeComplete, onProjectSelect, activeProject, showSectionNav }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  // The header's icons and image follow its name's typing (CSS, see
  // .project-header in App.css); they always keep their space.

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="projects-panel" className="panel panel-right" tabIndex={-1} aria-label="Projects">
        <h1 className="panel-title">
          <TypedText text="Projects" icon="code" visible={visible} speed={35} />
        </h1>
        <ul className="project-list">
          {PROJECTS.map(project => (
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
                  <img src={project.icon} alt="" className="project-icon" />
                  <a
                    className="project-name"
                    href={project.link}
                    target="_blank"
                    rel="noreferrer"
                    data-umami-event="project-open"
                    data-umami-event-project={project.id}
                  >
                    <TypedText text={project.name} visible={visible} speed={20} />
                    <ExternalMark />
                  </a>
                  <a
                    className="project-source"
                    href={project.github}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${project.name} source on GitHub`}
                    title="Source on GitHub"
                    data-umami-event="project-source"
                    data-umami-event-project={project.id}
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
          ))}
        </ul>
        {showSectionNav && <SectionNav current="projects" visible={visible} onNavigate={onNavigate} />}
      </section>
    </UntypeTrackerContext>
  )
}

export default ProjectsPanel
