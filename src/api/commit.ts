import type { WebsiteData2a, WebsiteData2b } from '../types'

const API_BASE = 'https://utility.commitswimming.com'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`Commit API ${res.status}: ${path}`)
  }
  return res.json() as Promise<T>
}

export function fetchTeamConfig(superTeamId: string) {
  return getJson<WebsiteData2a>(
    `/website-data-2a?superTeamId=${encodeURIComponent(superTeamId)}`,
  )
}

export function fetchScheduleData(superTeamId: string, includeMeets = false) {
  return getJson<WebsiteData2b>(
    `/website-data-2b?superTeamId=${encodeURIComponent(superTeamId)}&includeMeets=${includeMeets ? 'true' : 'false'}`,
  )
}
