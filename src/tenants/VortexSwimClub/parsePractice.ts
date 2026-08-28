import type { PracticeNameFormat } from '../../lib/settings'
import type {
  ParsedPracticeName,
  PracticeParseContext,
  PracticeParser,
} from '../types'
import { parseVortexLocation, parseVortexSubTeams } from './groups'

/**
 * Vortex titles list groups in prose (`Peak / Elite`, `Storm and Cyclone`).
 * Pool names usually live in the Commit description.
 */
export const parseVortexPractice: PracticeParser = (
  name: string,
  _format: PracticeNameFormat,
  context?: PracticeParseContext,
): ParsedPracticeName => {
  const locationSource = [name, context?.description].filter(Boolean).join(' ')
  return {
    subTeams: parseVortexSubTeams(name),
    location: parseVortexLocation(locationSource),
  }
}
