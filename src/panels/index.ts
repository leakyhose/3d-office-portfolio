import type { PanelProps, PanelId } from '../types'
import HomeRight from './HomeRight'
import AboutLeft from './AboutLeft'
import ContactLeft from './ContactLeft'
import ContactRight from './ContactRight'
import ExperienceRight from './ExperienceRight'
import ProjectsLeft from './ProjectsLeft'
import ProjectsRight from './ProjectsRight'

const PANELS: Record<PanelId, React.ComponentType<PanelProps>> = {
  'home': HomeRight,
  'about': AboutLeft,
  'contact-left': ContactLeft,
  'contact-right': ContactRight,
  'experience': ExperienceRight,
  'projects-nav': ProjectsLeft,
  'projects': ProjectsRight,
}

export default PANELS
