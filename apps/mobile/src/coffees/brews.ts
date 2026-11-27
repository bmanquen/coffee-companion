import { formatBrewRatio } from '@coffee-companion/brew-display'
import { SEALED_BREW } from './copy'
import type { BrewRow } from './types'

// 165 → "2m 45s", 64800 → "18h", 0 → "0s": the web Brews lists' format.
export function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean)
  return parts.length ? parts.join(' ') : '0s'
}

export function brewSummary(brew: BrewRow): string {
  if (brew.sealed) return SEALED_BREW
  const outputLabel = brew.method === 'Espresso' ? 'Yield' : 'Water'
  const parts: Array<string> = []
  if (brew.grindSetting) parts.push(`Grind ${brew.grindSetting}`)
  if (brew.dose) parts.push(`Dose ${brew.dose}g`)
  if (brew.output) parts.push(`${outputLabel} ${brew.output}g`)
  const ratio = formatBrewRatio(brew.dose, brew.output)
  if (ratio) parts.push(`Ratio ${ratio}`)
  // Espresso reads in plain seconds, as on the Espresso list.
  if (brew.seconds != null) {
    const time =
      brew.method === 'Espresso'
        ? `${brew.seconds}s`
        : formatSeconds(brew.seconds)
    parts.push(`Time ${time}`)
  }
  return parts.join(' · ')
}
