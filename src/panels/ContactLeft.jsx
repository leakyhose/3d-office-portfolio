import { useState, useEffect } from 'react'
import TypedText from '../components/TypedText'
import useUntypeTracker from '../components/useUntypeTracker'

function ContactLeft({ visible, onUntypeComplete }) {
  const onUntyped = useUntypeTracker(7, visible, onUntypeComplete)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(t)
  }, [copied])

  const copyEmail = (e) => {
    e.preventDefault()
    navigator.clipboard.writeText('yimingsu2007@gmail.com')
    setCopied(true)
  }

  return (
    <div id="contact-panel" className="visible">
      <div className="contact-main">
        <h1 className="contact-title">
          <TypedText text="Find me here:" icon="location-pin" visible={visible} speed={35} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
        </h1>

        <div className="contact-links-row">
          <a className="contact-pill" href="mailto:yimingsu2007@gmail.com" onClick={copyEmail}>
            <span className={`contact-pill-label${copied ? ' contact-copied' : ''}`}>
              {copied ? 'Copied!' : <TypedText text="Email" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />}
            </span>
            <TypedText text="yimingsu2007@gmail.com" icon="at" visible={visible} speed={7} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
          </a>
          <a className="contact-pill" href="https://www.linkedin.com/in/yiming-su/" target="_blank" rel="noreferrer">
            <span className="contact-pill-label">
              <TypedText text="LinkedIn" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
            </span>
            <TypedText text="yiming-su" icon="linkedin" visible={visible} speed={7} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
          </a>
          <a className="contact-pill" href="https://github.com/leakyhose" target="_blank" rel="noreferrer">
            <span className="contact-pill-label">
              <TypedText text="GitHub" visible={visible} speed={25} onUntyped={onUntyped} untypeFrom="start" />
            </span>
            <TypedText text="leakyhose" icon="github" visible={visible} speed={7} reserveSpace={true} onUntyped={onUntyped} untypeFrom="start" />
          </a>
        </div>
      </div>
    </div>
  )
}

export default ContactLeft
