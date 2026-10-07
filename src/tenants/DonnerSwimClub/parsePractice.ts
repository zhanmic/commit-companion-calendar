import type { PracticeNameFormat } from '../../lib/settings'
import type {
  ParsedPracticeName,
  PracticeParseContext,
  PracticeParser,
} from '../types'
import { parseDonnerLocation, parseDonnerSubTeams } from './groups'

/**
 * Donner titles are group names (`Novice`, `Age Group/Senior`).
 * Pool names usually live in the Commit description.
 */
export const parseDonnerPractice: PracticeParser = (
  name: string,
  _format: PracticeNameFormat,
  context?: PracticeParseContext,
): ParsedPracticeName => {
  const locationSource = [name, context?.description].filter(Boolean).join(' ')
  return {
    subTeams: parseDonnerSubTeams(name),
    location: parseDonnerLocation(locationSource),
  }
}
