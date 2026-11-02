import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function HomeRight({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <div id="name-title" onClick={() => onNavigate('home')}>
        <TypedText text="Yiming Su" visible={visible} speed={35} />
      </div>
      <nav id="menu">
        <a onClick={() => onNavigate('about')}>
          <TypedText text="About Me" icon="user" visible={visible} speed={25} />
        </a>
        <a onClick={() => onNavigate('experience')}>
          <TypedText text="Experience" icon="trophy" visible={visible} speed={25} />
        </a>
        <a onClick={() => onNavigate('projects')}>
          <TypedText text="Projects" icon="code" visible={visible} speed={25} />
        </a>
        <a onClick={() => onNavigate('contact')}>
          <TypedText text="Contact Me" icon="envelope" visible={visible} speed={25} />
        </a>
      </nav>
    </UntypeTrackerContext>
  )
}

export default HomeRight
