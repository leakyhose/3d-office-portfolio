import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import SectionNav from './SectionNav'
import { EXPERIENCE } from '../config/experience'
import type { PanelProps } from '../types'

// Newest first. In the wide layout the sheet on the desk shows these, so the
// list is only kept for screen readers there (the sheet is a canvas texture).
const ENTRIES = [...EXPERIENCE].reverse()

function ExperiencePanel({ visible, onNavigate, onUntypeComplete, onNavHoverChange }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="experience-panel" className="panel panel-right" tabIndex={-1} aria-label="Experience">
        <h1 className="panel-title">
          <TypedText text="Experience" icon="trophy" visible={visible} speed={35} />
        </h1>
        <ol className={`experience-list${visible ? '' : ' is-erasing'}`}>
          {ENTRIES.map((e) => (
            <li key={e.company} className="experience-entry">
              <img src={e.logo} alt="" className="experience-logo" />
              <div className="experience-info">
                <span className="experience-name">
                  <TypedText text={e.company} visible={visible} speed={25} />
                  {e.current && <span className="experience-now"><TypedText text="now" visible={visible} speed={25} /></span>}
                </span>
                <span className="experience-role">
                  <TypedText text={e.role} visible={visible} speed={10} />
                </span>
                <span className="experience-date">
                  <TypedText text={e.dates} visible={visible} speed={10} />
                </span>
              </div>
            </li>
          ))}
        </ol>
        <SectionNav current="experience" visible={visible} onNavigate={onNavigate} onHoverChange={onNavHoverChange} />
      </section>
    </UntypeTrackerContext>
  )
}

export default ExperiencePanel
