import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'

function AboutLeft({ visible, onNavigate, onUntypeComplete }) {
  const onUntyped = useUntypeTracker(8, visible, onUntypeComplete)

  return (
    <div id="about-panel" className="visible">
      <h1 className="about-title">
        <TypedText text="Hi! I'm Yiming" visible={visible} speed={35} reserveSpace={true} onUntyped={onUntyped} />
      </h1>
      <p className="about-line">
        <TypedText
          segments={[
            { text: "I'm an incoming SDE intern at " },
            { text: "Botpress", className: "about-highlight about-highlight-clickable about-hl-botpress", onClick: () => onNavigate('experience') },
            { text: ", and prev worked at " },
            { text: "Nokia", className: "about-highlight about-highlight-clickable about-hl-nokia", onClick: () => onNavigate('experience') },
            { text: "." },
          ]}
          visible={visible} speed={5} reserveSpace={true} onUntyped={onUntyped}
        />
      </p>
      <p className="about-line">
        <TypedText
          segments={[
            { text: "I'm currently studying at " },
            { text: "UBC", className: "about-highlight about-highlight-clickable about-hl-ubc", onClick: () => onNavigate('experience') },
            { text: ", and I'm interested in agentic systems, fullstack development, and data science." },
          ]}
          visible={visible} speed={5} reserveSpace={true} onUntyped={onUntyped}
        />
      </p>
      <p className="about-line about-line-short">
        <TypedText text="Also a big fan of blender, the NBA, Minecraft, medieval history." visible={visible} speed={5} reserveSpace={true} onUntyped={onUntyped} />
      </p>
      <nav className="about-nav">
        <a onClick={() => onNavigate('home')}>
          <TypedText text="Home" icon="home" visible={visible} speed={25} onUntyped={onUntyped} />
        </a>
        <a onClick={() => onNavigate('experience')}>
          <TypedText text="Experience" icon="trophy" visible={visible} speed={25} onUntyped={onUntyped} />
        </a>
        <a onClick={() => onNavigate('projects')}>
          <TypedText text="Projects" icon="code" visible={visible} speed={25} onUntyped={onUntyped} />
        </a>
        <a onClick={() => onNavigate('contact')}>
          <TypedText text="Contact" icon="envelope" visible={visible} speed={25} onUntyped={onUntyped} />
        </a>
      </nav>
    </div>
  )
}

export default AboutLeft
