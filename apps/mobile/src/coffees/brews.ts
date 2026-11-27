import {
  formatBrewRatio,
  formatBrewSeconds,
  formatSteepMinutes,
} from '@coffee-companion/brew-display'
import { SEALED_BREW } from './copy'
import type { BrewRow } from './types'

export function brewSummary(brew: BrewRow): string {
  if (brew.sealed) return SEALED_BREW
  const outputLabel = brew.method === 'Espresso' ? 'Yield' : 'Water'
  const parts: Array<string> = []
  if (brew.grindSetting) parts.push(`Grind ${brew.grindSetting}`)
  if (brew.dose) parts.push(`Dose ${brew.dose}g`)
  if (brew.output) parts.push(`${outputLabel} ${brew.output}g`)
  const ratio = formatBrewRatio(brew.dose, brew.output)
  if (ratio) parts.push(`Ratio ${ratio}`)
  // As each method's list shows it: Espresso in plain seconds, as on the
  // Espresso list.
  if (brew.time != null) {
    const time =
      brew.method === 'Espresso'
        ? `${brew.time}s`
        : brew.method === 'Cold Brew'
          ? formatSteepMinutes(brew.time)
          : formatBrewSeconds(brew.time)
    parts.push(`Time ${time}`)
  }
  return parts.join(' · ')
}
