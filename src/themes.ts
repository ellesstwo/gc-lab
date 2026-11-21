/**
 * Theme catalog (metadata only; the colors live in src/themes.css).
 *
 * GC Lab has one theme. The template's default "slate" values in
 * styles.css remain as the fallback underneath it.
 */

export const THEMES = [
  {
    id: 'gc-lab',
    label: 'GC Lab',
    description: 'Blue-black lab notebook with a teal accent and IBM Plex type.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'gc-lab'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'gc-lab'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
