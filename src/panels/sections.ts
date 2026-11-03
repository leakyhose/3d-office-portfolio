import type { NavEvent, ViewName } from '../types'

export const SECTIONS: { view: ViewName; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'about', label: 'About', icon: 'user' },
  { view: 'experience', label: 'Experience', icon: 'trophy' },
  { view: 'projects', label: 'Projects', icon: 'code' },
  { view: 'contact', label: 'Contact', icon: 'envelope' },
]

export const hrefFor = (view: ViewName) => `#${view}`

/** Plain left click -> in-app navigation; modified clicks (new tab etc.) keep the browser default. */
export function navClick(view: ViewName, onNavigate: (v: ViewName, e?: NavEvent) => void) {
  return (e: NavEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onNavigate(view, e)
  }
}
