import TypedText from '../components/TypedText'
import { SECTIONS, hrefFor, navClick } from './sections'
import type { NavEvent, ViewName } from '../types'

interface NavLinkProps {
  view: ViewName
  label: string
  icon: string
  visible: boolean
  speed: number
  onNavigate: (v: ViewName, e?: NavEvent) => void
}

export function NavLink({ view, label, icon, visible, speed, onNavigate }: NavLinkProps) {
  return (
    <a className="nav-link" href={hrefFor(view)} onClick={navClick(view, onNavigate)}>
      <TypedText text={label} icon={icon} visible={visible} speed={speed} />
    </a>
  )
}

interface SectionNavProps {
  current: ViewName
  visible: boolean
  onNavigate: (v: ViewName, e?: NavEvent) => void
}

/** The other sections, at the foot of every panel (hidden in the stacked layout, which has a tab bar). */
export default function SectionNav({ current, visible, onNavigate }: SectionNavProps) {
  return (
    <nav className="section-nav" aria-label="Sections">
      {SECTIONS.filter((s) => s.view !== current).map((s) => (
        <NavLink key={s.view} {...s} visible={visible} speed={25} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
