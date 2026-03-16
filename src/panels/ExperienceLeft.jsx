import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'

function ExperienceLeft({ visible, onNavigate, onUntypeComplete }) {
  const onUntyped = useUntypeTracker(4, visible, onUntypeComplete)

  return (
    <div id="experience-panel" className="visible">
      <nav className="about-nav">
        <a onClick={() => onNavigate('home')}>
          <TypedText text="Home" icon="home" visible={visible} speed={25} onUntyped={onUntyped} />
        </a>
        <a onClick={() => onNavigate('about')}>
          <TypedText text="About" icon="user" visible={visible} speed={25} onUntyped={onUntyped} />
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

export default ExperienceLeft
