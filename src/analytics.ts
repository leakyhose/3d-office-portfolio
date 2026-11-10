// Umami (https://umami.is): cookieless visitor analytics. Loaded only in
// production builds (VITE_UMAMI_WEBSITE_ID overrides the site ID), and only once the page is
// idle so it never competes with the scene's first load. The tracker records
// a pageview per URL change (each #section counts) and a named event for any
// click on an element carrying data-umami-event.
// Public by design: the ID ships in every page's source.
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID ?? 'e7dbf317-90a8-4700-accc-b7c50223b4fe'
const SCRIPT_URL = (import.meta.env.VITE_UMAMI_SCRIPT_URL as string | undefined) ?? 'https://cloud.umami.is/script.js'

export function loadAnalytics() {
  if (!import.meta.env.PROD || !WEBSITE_ID) return
  const inject = () => {
    const s = document.createElement('script')
    s.defer = true
    s.src = SCRIPT_URL
    s.dataset.websiteId = WEBSITE_ID
    document.head.appendChild(s)
  }
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000))
  if (document.readyState === 'complete') idle(inject)
  else window.addEventListener('load', () => idle(inject), { once: true })
}
