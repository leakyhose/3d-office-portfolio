import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import { NavLink } from './SectionNav'
import type { PanelProps } from '../types'
import { VIEWS } from '../config/views'
import { narrowFillY, useScreenLayout } from '../layout'

const MENU = [
  { view: 'about', label: 'About Me', icon: 'user' },
  { view: 'experience', label: 'Experience', icon: 'trophy' },
  { view: 'projects', label: 'Projects', icon: 'code' },
  { view: 'contact', label: 'Contact Me', icon: 'envelope' },
] as const

/** The menu's top on the 1.84:1 frame: 39% down (NDC 0.22), beside the chair's back. */
const MENU_TOP_NDC = 0.22

function HomePanel({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  // On squarer screens the camera's narrowFill moves the chair; the menu
  // moves with it (App.css #menu).
  const { kind, width, height } = useScreenLayout()
  const fill = VIEWS.home.narrowFill
  const ref = VIEWS.home.refAspect
  const menuTop = kind === 'wide' && fill && ref ? (1 - narrowFillY(fill, ref, width / height, MENU_TOP_NDC)) / 2 : 0.39

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="home-panel" className="panel panel-right" tabIndex={-1} aria-label="Home" style={{ '--menu-top': menuTop } as React.CSSProperties}>
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
