import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function HomeRight({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const onUntyped = useUntypeTracker(5, visible, onUntypeComplete)

  return (
    <>
      <div id="name-title" onClick={() => onNavigate('home')}>
        <TypedText text="Yiming Su" visible={visible} speed={35} onUntyped={onUntyped} untypeFrom="start" />
      </div>
      <nav id="menu">
        <a onClick={() => onNavigate('about')}>
          <TypedText text="About Me" icon="user" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('experience')}>
          <TypedText text="Experience" icon="trophy" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('projects')}>
          <TypedText text="Projects" icon="code" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('contact')}>
          <TypedText text="Contact Me" icon="envelope" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
      </nav>
    </>
  )
}

export default HomeRight
