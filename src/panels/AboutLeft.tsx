import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function AboutLeft({ visible, onNavigate, onUntypeComplete }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)

  return (
    <UntypeTrackerContext value={tracker}>
      <div id="about-panel" className="visible">
        <h1 className="about-title">
          <TypedText
            segments={[
              { text: "Hi! I'm " },
              { text: "Yiming", className: "about-name" },
            ]}
            visible={visible} speed={35}
          />
        </h1>
        <p className="about-line">
          <TypedText
            segments={[
              { text: "I'm currently a SWE intern at " },
              { text: "Shopify", className: "about-highlight about-highlight-clickable about-hl-shopify", onClick: () => onNavigate('experience') },
              { text: ", and previously worked at " },
              { text: "Botpress", className: "about-highlight about-highlight-clickable about-hl-botpress", onClick: () => onNavigate('experience') },
              { text: " and " },
              { text: "Nokia", className: "about-highlight about-highlight-clickable about-hl-nokia", onClick: () => onNavigate('experience') },
              { text: "." },
            ]}
            visible={visible} speed={5}
          />
        </p>
        <p className="about-line">
          <TypedText
            segments={[
              { text: "Currently studying at " },
              { text: "UBC", className: "about-highlight about-highlight-clickable about-hl-ubc", onClick: () => onNavigate('experience') },
              { text: ", where I work on " },
              { text: "fullstack", className: "about-highlight about-highlight-clickable about-hl-skills", onClick: () => onNavigate('projects') },
              { text: " with an emphasis on the " },
              { text: "backend", className: "about-highlight about-highlight-clickable about-hl-skills", onClick: () => onNavigate('projects') },
              { text: ", and " },
              { text: "agentic systems", className: "about-highlight about-highlight-clickable about-hl-skills", onClick: () => onNavigate('projects') },
              { text: "." },
            ]}
            visible={visible} speed={5}
          />
        </p>
        <p className="about-line">
          <TypedText
            segments={[
              { text: "Outside of work, I love " },
              { text: "blender", className: "about-highlight-subtle" },
              { text: ", the " },
              { text: "NBA", className: "about-highlight-subtle" },
              { text: ", " },
              { text: "Minecraft", className: "about-highlight-subtle" },
              { text: ", and " },
              { text: "medieval history", className: "about-highlight-subtle" },
              { text: "." },
            ]}
            visible={visible} speed={5}
          />
        </p>
        <nav className="about-nav">
          <a onClick={() => onNavigate('home')}>
            <TypedText text="Home" icon="home" visible={visible} speed={25} />
          </a>
          <a onClick={() => onNavigate('experience')}>
            <TypedText text="Experience" icon="trophy" visible={visible} speed={25} />
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

export default AboutLeft
