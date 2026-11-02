import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import useIsMobile from '../hooks/useIsMobile'
import type { PanelProps } from '../types'

function ExperienceRight({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const isMobile = useIsMobile()
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <div id="experience-panel" className="visible">
        {isMobile && (
          <div className={`experience-timeline${visible ? '' : ' is-erasing'}`}>
            <div className="experience-entry">
              <img src="/shopify_logo.svg" alt="" className="experience-logo" />
              <div className="experience-info">
                <span className="experience-name">
                  <TypedText text="Shopify" visible={visible} speed={25} />
                </span>
                <span className="experience-date">
                  <TypedText text="Sep 2026 — Dec 2026" visible={visible} speed={10} />
                </span>
              </div>
            </div>

            <div className="experience-arrow">
              <span className="experience-arrow-line" />
            </div>

            <div className="experience-entry">
              <img src="/botpress_logo.png" alt="" className="experience-logo" />
              <div className="experience-info">
                <span className="experience-name">
                  <TypedText text="Botpress" visible={visible} speed={25} />
                </span>
                <span className="experience-date">
                  <TypedText text="May 2026 — Aug 2026" visible={visible} speed={10} />
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
                  <TypedText text="Nokia" visible={visible} speed={25} />
                </span>
                <span className="experience-date">
                  <TypedText text="Jul 2024 — Aug 2024" visible={visible} speed={10} />
                </span>
              </div>
            </div>
          </div>
        )}

        <nav className="about-nav">
          <a onClick={() => onNavigate('home')}>
            <TypedText text="Home" icon="home" visible={visible} speed={25} />
          </a>
          <a onClick={() => onNavigate('about')}>
            <TypedText text="About" icon="user" visible={visible} speed={25} />
          </a>
          <a onClick={() => onNavigate('projects')}>
            <TypedText text="Projects" icon="code" visible={visible} speed={25} />
          </a>
          <a onClick={() => onNavigate('contact')}>
            <TypedText text="Contact" icon="envelope" visible={visible} speed={25} />
          </a>
        </nav>
      </div>
    </UntypeTrackerContext>
  )
}

export default ExperienceRight
