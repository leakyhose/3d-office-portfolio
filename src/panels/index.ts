import type { PanelProps, PanelId } from '../types'
import HomePanel from './HomePanel'
import AboutPanel from './AboutPanel'
import ExperiencePanel from './ExperiencePanel'
import ProjectsPanel from './ProjectsPanel'
import ContactPanel from './ContactPanel'

const PANELS: Record<PanelId, React.ComponentType<PanelProps>> = {
  home: HomePanel,
  about: AboutPanel,
  experience: ExperiencePanel,
  projects: ProjectsPanel,
  contact: ContactPanel,
}

export default PANELS
