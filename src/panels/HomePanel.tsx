import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import { NavLink } from './SectionNav'
import type { PanelProps } from '../types'

const MENU = [
  { view: 'about', label: 'About Me', icon: 'user' },
  { view: 'experience', label: 'Experience', icon: 'trophy' },
  { view: 'projects', label: 'Projects', icon: 'code' },
  { view: 'contact', label: 'Contact Me', icon: 'envelope' },
] as const

function HomePanel({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="home-panel" className="panel panel-right" tabIndex={-1} aria-label="Home">
        <h1 id="name-title">
          <TypedText text="Yiming Su" visible={visible} speed={35} />
        </h1>
        <nav id="menu" aria-label="Sections">
          {MENU.map((m) => (
            <NavLink key={m.view} {...m} visible={visible} speed={25} onNavigate={onNavigate} />
          ))}
        </nav>
      </section>
    </UntypeTrackerContext>
  )
}

export default HomePanel
