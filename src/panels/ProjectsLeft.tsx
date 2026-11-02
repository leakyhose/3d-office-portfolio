import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ProjectsLeft({ visible, onNavigate, onUntypeComplete, onHoverChange }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <nav
        className="projects-nav"
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        <a onClick={() => onNavigate('home')}>
          <TypedText text="Home" icon="home" visible={visible} speed={23} />
        </a>
        <a onClick={() => onNavigate('about')}>
          <TypedText text="About" icon="user" visible={visible} speed={23} />
        </a>
        <a onClick={() => onNavigate('experience')}>
          <TypedText text="Experience" icon="trophy" visible={visible} speed={23} />
        </a>
        <a onClick={() => onNavigate('contact')}>
          <TypedText text="Contact" icon="envelope" visible={visible} speed={23} />
        </a>
      </nav>
    </UntypeTrackerContext>
  )
}

export default ProjectsLeft
