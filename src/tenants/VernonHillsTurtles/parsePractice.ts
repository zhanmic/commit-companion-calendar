import type { PracticeNameFormat } from '../../lib/settings'
import type {
  ParsedPracticeName,
  PracticeParseContext,
  PracticeParser,
} from '../types'
import { parseVernonHillsLocation, parseVernonHillsSubTeams } from './groups'

/**
 * Vernon Hills titles lead with the group (`Green - Swim`, `Silver Comp - Dryland`).
 * Pool names usually live in the Commit description (`VHHS`, `LV`, `@ TK`).
 */
export const parseVernonHillsPractice: PracticeParser = (
  name: string,
  _format: PracticeNameFormat,
  context?: PracticeParseContext,
): ParsedPracticeName => {
  const locationSource = [name, context?.description].filter(Boolean).join(' ')
  return {
    subTeams: parseVernonHillsSubTeams(name),
    location: parseVernonHillsLocation(locationSource),
  }
}
