const API_BASE = 'https://utility.commitswimming.com'

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`Commit API ${res.status}: ${path}`)
  }
  return res.json()
}

export function fetchTeamConfig(superTeamId) {
  return getJson(
    `/website-data-2a?superTeamId=${encodeURIComponent(superTeamId)}`,
  )
}

export function fetchScheduleData(superTeamId, includeMeets = false) {
  return getJson(
    `/website-data-2b?superTeamId=${encodeURIComponent(superTeamId)}&includeMeets=${includeMeets ? 'true' : 'false'}`,
  )
}
