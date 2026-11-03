// Generation counter for TypedText's layout caches (detected anchors and
// measured line breaks): bumped whenever something can re-align or re-wrap
// text. Anchor detection reads computed styles, which in a nav click would
// force a style recalc of the whole page inside the click task.
export let layoutGen = 0
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { layoutGen++ })
  document.fonts?.addEventListener('loadingdone', () => { layoutGen++ })
}

/** Call when the page's layout mode changes without a resize. */
export function invalidateTypedLayout() {
  layoutGen++
}
