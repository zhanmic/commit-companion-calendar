/**
 * Operator (schedule) admin password — from environment only (not git).
 *
 * Env: OPERATOR_ADMIN_PASSWORD=…
 *
 * Unlock with ?admin=<password> (not ?admin=1). Clear with ?admin=0.
 * Does not unlock team billing — that uses TEAM_ADMIN_TOKENS.
 */
import { secretsEqual } from './teamAdminSecrets.js'

export function getOperatorAdminPassword() {
  const value = process.env.OPERATOR_ADMIN_PASSWORD
  return typeof value === 'string' ? value.trim() : ''
}

export function hasOperatorAdminPassword() {
  return Boolean(getOperatorAdminPassword())
}

export function verifyOperatorAdminPassword(password) {
  const expected = getOperatorAdminPassword()
  if (!expected || !password) return false
  return secretsEqual(String(password).trim(), expected)
}
