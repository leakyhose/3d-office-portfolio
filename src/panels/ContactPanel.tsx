import { useState, useEffect } from 'react'
import TypedText from '../components/TypedText'
import useUntypeTracker, { UntypeTrackerContext } from '../components/useUntypeTracker'
import SectionNav from './SectionNav'
import type { PanelProps } from '../types'

const EMAIL = 'yimingsu2007@gmail.com'

const LINKS = [
  { label: 'LinkedIn', icon: 'linkedin', text: 'in/yiming-su', href: 'https://www.linkedin.com/in/yiming-su/' },
  { label: 'GitHub', icon: 'github', text: 'leakyhose', href: 'https://github.com/leakyhose' },
]

function ContactPanel({ visible, onNavigate, onUntypeComplete, onNavHoverChange }: PanelProps) {
  const tracker = useUntypeTracker(visible, onUntypeComplete)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  // Clicking the address copies it (most visitors don't have a mail client
  // wired to mailto:); if the clipboard isn't available, fall back to mailto.
  const copyEmail = () => {
    const mailto = () => { window.location.href = `mailto:${EMAIL}` }
    if (!navigator.clipboard) return mailto()
    navigator.clipboard.writeText(EMAIL).then(() => setCopied(true), mailto)
  }

  return (
    <UntypeTrackerContext value={tracker}>
      <section id="contact-panel" className="panel panel-right" tabIndex={-1} aria-label="Contact">
        <h1 className="panel-title">
          <TypedText text="Contact" icon="envelope" visible={visible} speed={35} />
        </h1>
        <dl className="contact-list">
          <div className="contact-row">
            <dt className="contact-label">
              <TypedText text="Email" visible={visible} speed={25} />
              <span className={`contact-status${copied ? ' is-shown' : ''}`} role="status">
                {copied ? 'copied' : ''}
              </span>
            </dt>
            <dd>
              <button type="button" className="contact-value" onClick={copyEmail} title="Copy email address">
                <TypedText text={EMAIL} icon="at" visible={visible} speed={7} />
              </button>
            </dd>
          </div>
          {LINKS.map((l) => (
            <div className="contact-row" key={l.label}>
              <dt className="contact-label">
                <TypedText text={l.label} visible={visible} speed={25} />
              </dt>
              <dd>
                <a className="contact-value" href={l.href} target="_blank" rel="noreferrer">
                  <TypedText text={l.text} icon={l.icon} visible={visible} speed={7} />
                </a>
              </dd>
            </div>
          ))}
        </dl>
        <SectionNav current="contact" visible={visible} onNavigate={onNavigate} onHoverChange={onNavHoverChange} />
      </section>
    </UntypeTrackerContext>
  )
}

export default ContactPanel
