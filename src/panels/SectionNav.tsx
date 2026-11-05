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

/**
 * An invisible copy of the section nav's links (App.css .nav-warmup). On the
 * wide layout the Home menu is set larger than --fs-nav, so nothing on Home
 * uses the section nav's text and icon sizes: without this, the first swap
 * away from Home sets up VT323 and the icon font at those sizes (shaping,
 * glyph metrics) inside the swap's layout, in the middle of the flight.
 * Mounted once Home is idle, it pays for that up front.
 */
export function SectionNavWarmup() {
  return (
    <div className="nav-warmup" aria-hidden="true">
      {SECTIONS.map((s) => (
        <span key={s.view} className="nav-link">
          <i className={`hn hn-${s.icon}`} />
          {s.label}
        </span>
      ))}
    </div>
  )
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
