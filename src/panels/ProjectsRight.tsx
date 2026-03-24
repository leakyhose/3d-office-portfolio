import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'
import type { PanelProps } from '../types'

function ProjectsRight({ visible, onUntypeComplete }: PanelProps) {
  const onUntyped = useUntypeTracker(2, visible, onUntypeComplete)

  return (
    <div id="projects-panel" className="visible">
      <h1 className="panel-title">
        <TypedText text="Projects" icon="folder-open" visible={visible} speed={35} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
      </h1>
      <p className="panel-line">
        <TypedText text="Coming soon..." visible={visible} speed={20} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
      </p>
    </div>
  )
}

export default ProjectsRight
