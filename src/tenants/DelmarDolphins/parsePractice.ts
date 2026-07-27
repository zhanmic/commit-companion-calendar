import {
  parsePracticeNameFields,
  parsePracticeNameKeywords,
  type GroupLocationParsers,
} from '../../lib/nameFormat'
import type { PracticeNameFormat } from '../../lib/settings'
import type { ParsedPracticeName, PracticeParser } from '../types'
import { parseDelmaLocation, parseDelmaSubTeams } from './groups'

const DELMA_PARSERS: GroupLocationParsers = {
  parseSubTeams: parseDelmaSubTeams,
  parseLocation: parseDelmaLocation,
}

/**
 * Delmar titles are typically `Group - Location - Time`.
 * Settings can switch between field-split and keyword scan modes.
 */
export const parseDelmaPractice: PracticeParser = (
  name: string,
  format: PracticeNameFormat,
): ParsedPracticeName => {
  if (format.mode === 'keywords') {
    return parsePracticeNameKeywords(name, DELMA_PARSERS)
  }
  return parsePracticeNameFields(name, format, DELMA_PARSERS)
}
