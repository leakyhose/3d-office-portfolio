import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ExperienceRight({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const onUntyped = useUntypeTracker(8, visible, onUntypeComplete)

  return (
    <div id="experience-panel" className="visible">
      <div className="experience-timeline">
        <div className="experience-entry">
          <img src="/botpress_logo.png" alt="" className="experience-logo" />
          <div className="experience-info">
            <span className="experience-name">
              <TypedText text="Botpress" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
            </span>
            <span className="experience-date">
              <TypedText text="May 2026 — Aug 2026" visible={visible} speed={10} onUntyped={onUntyped} untypeFrom="start" />
            </span>
          </div>
        </div>

        <div className="experience-arrow">
          <span className="experience-arrow-line" />
        </div>

        <div className="experience-entry">
          <img src="/nokia_logo.avif" alt="" className="experience-logo" />
          <div className="experience-info">
            <span className="experience-name">
              <TypedText text="Nokia" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
            </span>
            <span className="experience-date">
              <TypedText text="Jul 2024 — Aug 2024" visible={visible} speed={10} onUntyped={onUntyped} untypeFrom="start" />
            </span>
          </div>
        </div>
      </div>

      <nav className="about-nav">
        <a onClick={() => onNavigate('home')}>
          <TypedText text="Home" icon="home" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('about')}>
          <TypedText text="About" icon="user" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('projects')}>
          <TypedText text="Projects" icon="code" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
        <a onClick={() => onNavigate('contact')}>
          <TypedText text="Contact" icon="envelope" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
        </a>
      </nav>
    </div>
  )
}

export default ExperienceRight
