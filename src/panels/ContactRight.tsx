import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ContactRight({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const onUntyped = useUntypeTracker(4, visible, onUntypeComplete)

  return (
    <nav className="contact-nav">
      <a onClick={() => onNavigate('home')}>
        <TypedText text="Home" icon="home" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('about')}>
        <TypedText text="About" icon="user" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('experience')}>
        <TypedText text="Experience" icon="trophy" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
      <a onClick={() => onNavigate('projects')}>
        <TypedText text="Projects" icon="code" visible={visible} speed={23} onUntyped={onUntyped} />
      </a>
    </nav>
  )
}

export default ContactRight
