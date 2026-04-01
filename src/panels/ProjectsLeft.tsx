import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ProjectsLeft({ visible, onNavigate, onUntypeComplete, onHoverChange }: PanelProps) {
  const onUntyped = useUntypeTracker(4, visible, onUntypeComplete)

  return (
    <nav
      className="projects-nav"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <a onClick={() => onNavigate('home')}>
        <TypedText text="Home" icon="home" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('about')}>
        <TypedText text="About" icon="user" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('experience')}>
        <TypedText text="Experience" icon="trophy" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('contact')}>
        <TypedText text="Contact" icon="envelope" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
    </nav>
  )
}

export default ProjectsLeft
