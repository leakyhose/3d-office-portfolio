import { useEffect, useRef } from 'react'
import TypedText from '../components/TypedText'
import type { ViewName } from '../types'

export const SECTIONS: { view: ViewName; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'about', label: 'About', icon: 'user' },
  { view: 'experience', label: 'Experience', icon: 'trophy' },
  { view: 'projects', label: 'Projects', icon: 'code' },
  { view: 'contact', label: 'Contact', icon: 'envelope' },
]

export const hrefFor = (view: ViewName) => `#${view}`

/** Plain left click -> in-app navigation; modified clicks (new tab etc.) keep the browser default. */
export function navClick(view: ViewName, onNavigate: (v: ViewName, e?: React.MouseEvent) => void) {
  return (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onNavigate(view, e)
  }
}

interface NavLinkProps {
  view: ViewName
  label: string
  icon: string
  visible: boolean
  speed: number
  onNavigate: (v: ViewName, e?: React.MouseEvent) => void
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
  onNavigate: (v: ViewName, e?: React.MouseEvent) => void
  onHoverChange?: (hovering: boolean) => void
}

/** The other sections, at the foot of every panel (hidden in the stacked layout, which has a tab bar). */
export default function SectionNav({ current, visible, onNavigate, onHoverChange }: SectionNavProps) {
  // Unmounting under the pointer never fires mouseleave.
  const hoverRef = useRef(onHoverChange)
  useEffect(() => { hoverRef.current = onHoverChange })
  useEffect(() => () => hoverRef.current?.(false), [])
  return (
    <nav
      className="section-nav"
      aria-label="Sections"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      {SECTIONS.filter((s) => s.view !== current).map((s) => (
        <NavLink key={s.view} {...s} visible={visible} speed={25} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
