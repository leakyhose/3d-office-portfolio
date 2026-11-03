import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import SectionNav from './SectionNav'
import { hrefFor, navClick } from './sections'
import type { PanelProps, ViewName } from '../types'

function AboutPanel({ visible, onNavigate, onUntypeComplete, showSectionNav }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  // Inline cross-links to other sections
  const link = (text: string, view: ViewName, extra = '') => ({
    text,
    className: `inline-link${extra}`,
    href: hrefFor(view),
    onClick: navClick(view, onNavigate),
  })

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="about-panel" className="panel panel-left" tabIndex={-1} aria-label="About">
        <h1 className="panel-title">
          <TypedText
            segments={[
              { text: "Hi! I'm " },
              { text: 'Yiming', className: 'title-accent' },
            ]}
            visible={visible} speed={35}
          />
        </h1>
        <div className="panel-body">
          <p className="body-text">
            <TypedText
              segments={[
                { text: "I'm currently a SWE intern at " },
                link('Shopify', 'experience', ' about-hl-shopify'),
                { text: ', and previously worked at ' },
                link('Botpress', 'experience', ' about-hl-botpress'),
                { text: ' and ' },
                link('Nokia', 'experience', ' about-hl-nokia'),
                { text: '.' },
              ]}
              visible={visible} speed={5}
            />
          </p>
          <p className="body-text">
            <TypedText
              segments={[
                { text: 'Currently studying at ' },
                link('UBC', 'experience', ' about-hl-ubc'),
                { text: ', where I work on ' },
                link('fullstack', 'projects', ' about-hl-skills'),
                { text: ' with an emphasis on the ' },
                link('backend', 'projects', ' about-hl-skills'),
                { text: ', and ' },
                link('agentic systems', 'projects', ' about-hl-skills'),
                { text: '.' },
              ]}
              visible={visible} speed={5}
            />
          </p>
          <p className="body-text">
            <TypedText
              segments={[
                { text: 'Outside of work, I love ' },
                { text: 'blender', className: 'interest' },
                { text: ', the ' },
                { text: 'NBA', className: 'interest' },
                { text: ', ' },
                { text: 'Minecraft', className: 'interest' },
                { text: ', and ' },
                { text: 'medieval history', className: 'interest' },
                { text: '.' },
              ]}
              visible={visible} speed={5}
            />
          </p>
        </div>
        {showSectionNav && <SectionNav current="about" visible={visible} onNavigate={onNavigate} />}
      </section>
    </UntypeTrackerContext>
  )
}

export default AboutPanel
