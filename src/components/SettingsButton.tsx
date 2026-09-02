import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isScheduleAdmin } from '../lib/admin'
import { groupOrder } from '../lib/groups'
import {
  MONTH_DETAIL_OPTIONS,
  NAME_FIELD_OPTIONS,
  PRACTICE_PARSE_MODE_OPTIONS,
  type MonthDetailLevel,
  type NameField,
  type PracticeParseMode,
  type ScheduleSettings,
} from '../lib/settings'
import {
  TEAM_ADMIN_EVENT,
  hasTeamAdminSession,
  notifyTeamAdminChanged,
  unlockTeamAdminWithPassword,
} from '../lib/teamAdmin'
import { useTenant } from '../tenants/TenantContext'

type SettingsTab = 'calendar' | 'team'

interface SettingsButtonProps {
  className?: string
  settings: ScheduleSettings
  onChange: (next: ScheduleSettings) => void
}

export function SettingsButton({
  className = '',
  settings,
  onChange,
}: SettingsButtonProps) {
  const tenant = useTenant()
  const groups = groupOrder(tenant)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('calendar')
  const [admin, setAdmin] = useState(false)
  const [teamAdmin, setTeamAdmin] = useState(false)
  const [password, setPassword] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const format = settings.practiceNameFormat

  useEffect(() => {
    setAdmin(isScheduleAdmin())
    setTeamAdmin(hasTeamAdminSession(tenant.slug))
  }, [tenant.slug])

  useEffect(() => {
    function onTeamAdmin(event: Event) {
      const detail = (event as CustomEvent).detail as {
        tenantSlug?: string
        active?: boolean
      }
      if (
        !detail?.tenantSlug ||
        detail.tenantSlug.toLowerCase() !== tenant.slug.toLowerCase()
      ) {
        return
      }
      setTeamAdmin(Boolean(detail.active))
    }
    window.addEventListener(TEAM_ADMIN_EVENT, onTeamAdmin)
    return () => window.removeEventListener(TEAM_ADMIN_EVENT, onTeamAdmin)
  }, [tenant.slug])

  useEffect(() => {
    if (!open) {
      setTab('calendar')
      setPassword('')
      setManageError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function patch(partial: Partial<ScheduleSettings>) {
    onChange({ ...settings, ...partial })
  }

  function patchFormat(
    partial: Partial<ScheduleSettings['practiceNameFormat']>,
  ) {
    patch({
      practiceNameFormat: {
        ...format,
        ...partial,
      },
    })
  }

  function setFieldAt(index: number, value: NameField) {
    const fields = [...format.fields]
    fields[index] = value
    patchFormat({ fields })
  }

  function toggleDefaultGroup(team: string) {
    const selected = new Set(settings.defaultGroups)
    if (selected.has(team)) selected.delete(team)
    else selected.add(team)
    patch({
      defaultGroups: groups.filter((t) => selected.has(t)),
    })
  }

  async function onManageTeamSubmit(event: FormEvent) {
    event.preventDefault()
    setManageBusy(true)
    setManageError(null)
    const result = await unlockTeamAdminWithPassword(tenant.slug, password)
    setManageBusy(false)
    if (!result.ok) {
      setManageError(result.error)
      return
    }
    setTeamAdmin(true)
    setPassword('')
    setOpen(false)
  }

  function openTeamBilling() {
    notifyTeamAdminChanged(tenant.slug, true, { openBilling: true })
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={`settings${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="settings__button"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="settings__icon"
          aria-hidden
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          className="settings__panel"
          role="dialog"
          aria-label="Settings"
        >
          <div className="settings__tabs" role="tablist" aria-label="Settings">
            <button
              type="button"
              role="tab"
              id={`${panelId}-tab-calendar`}
              aria-selected={tab === 'calendar'}
              aria-controls={`${panelId}-panel-calendar`}
              className={`settings__tab${
                tab === 'calendar' ? ' settings__tab--active' : ''
              }`}
              onClick={() => setTab('calendar')}
            >
              Calendar
            </button>
            <button
              type="button"
              role="tab"
              id={`${panelId}-tab-team`}
              aria-selected={tab === 'team'}
              aria-controls={`${panelId}-panel-team`}
              className={`settings__tab${
                tab === 'team' ? ' settings__tab--active' : ''
              }`}
              onClick={() => {
                setTab('team')
                setManageError(null)
              }}
            >
              Team
            </button>
          </div>

          {tab === 'calendar' ? (
            <div
              id={`${panelId}-panel-calendar`}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-calendar`}
              className="settings__tab-panel"
            >
              {admin ? (
                <>
                  <p className="settings__heading">Schedule</p>

                  <label className="settings__switch">
                    <input
                      type="checkbox"
                      checked={settings.includeTeamEvents}
                      onChange={(e) =>
                        patch({ includeTeamEvents: e.target.checked })
                      }
                    />
                    <span>
                      <span className="settings__switch-label">
                        Include team events
                      </span>
                      <span className="settings__switch-hint">
                        Calendar items like meetings, breaks, and cancellations
                      </span>
                    </span>
                  </label>

                  <label className="settings__switch">
                    <input
                      type="checkbox"
                      checked={settings.queryMeets}
                      onChange={(e) =>
                        patch({ queryMeets: e.target.checked })
                      }
                    />
                    <span>
                      <span className="settings__switch-label">
                        Query meets
                      </span>
                      <span className="settings__switch-hint">
                        Fetch Commit meet entries and show them on the week
                      </span>
                    </span>
                  </label>
                </>
              ) : null}

              <p
                className={`settings__heading${
                  admin ? ' settings__heading--spaced' : ''
                }`}
              >
                Defaults on load
              </p>
              <p className="settings__switch-hint">
                Selected on page load. Change here, then reload to apply.
              </p>
              <div
                className="settings__groups"
                role="group"
                aria-label="Default groups"
              >
                {groups.map((team) => {
                  const active = settings.defaultGroups.includes(team)
                  return (
                    <button
                      key={team}
                      type="button"
                      className={`settings__group-chip${
                        active ? ' settings__group-chip--active' : ''
                      }`}
                      aria-pressed={active}
                      onClick={() => toggleDefaultGroup(team)}
                    >
                      {team}
                    </button>
                  )
                })}
              </div>
              <div
                className="settings__groups"
                role="group"
                aria-label="Default event and meet filters"
              >
                <button
                  type="button"
                  className={`settings__group-chip${
                    settings.defaultShowEvents
                      ? ' settings__group-chip--active'
                      : ''
                  }${
                    settings.includeTeamEvents
                      ? ''
                      : ' settings__group-chip--disabled'
                  }`}
                  aria-pressed={settings.defaultShowEvents}
                  aria-disabled={!settings.includeTeamEvents}
                  disabled={!settings.includeTeamEvents}
                  onClick={() =>
                    patch({ defaultShowEvents: !settings.defaultShowEvents })
                  }
                >
                  Event
                </button>
                <button
                  type="button"
                  className={`settings__group-chip${
                    settings.defaultShowMeets
                      ? ' settings__group-chip--active'
                      : ''
                  }${
                    settings.queryMeets
                      ? ''
                      : ' settings__group-chip--disabled'
                  }`}
                  aria-pressed={settings.defaultShowMeets}
                  aria-disabled={!settings.queryMeets}
                  disabled={!settings.queryMeets}
                  onClick={() =>
                    patch({ defaultShowMeets: !settings.defaultShowMeets })
                  }
                >
                  Meet
                </button>
              </div>

              <p className="settings__heading settings__heading--spaced">
                Month view
              </p>
              <div
                className="settings__stack"
                role="radiogroup"
                aria-label="Month view detail"
              >
                {MONTH_DETAIL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={settings.monthDetailLevel === option.value}
                    className={`settings__choice${
                      settings.monthDetailLevel === option.value
                        ? ' settings__choice--active'
                        : ''
                    }`}
                    onClick={() =>
                      patch({
                        monthDetailLevel: option.value as MonthDetailLevel,
                      })
                    }
                  >
                    <span className="settings__choice-label">
                      {option.label}
                    </span>
                    <span className="settings__choice-hint">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              <p className="settings__heading settings__heading--spaced">
                Practice name format
              </p>
              <div
                className="settings__stack"
                role="radiogroup"
                aria-label="Practice name format"
              >
                {PRACTICE_PARSE_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={format.mode === option.value}
                    className={`settings__choice${
                      format.mode === option.value
                        ? ' settings__choice--active'
                        : ''
                    }`}
                    onClick={() =>
                      patchFormat({
                        mode: option.value as PracticeParseMode,
                      })
                    }
                  >
                    <span className="settings__choice-label">
                      {option.label}
                    </span>
                    <span className="settings__choice-hint">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              {format.mode === 'fields' ? (
                <div className="settings__format">
                  <label className="settings__field">
                    <span className="settings__field-label">Separator</span>
                    <input
                      type="text"
                      className="settings__input"
                      value={format.separator}
                      maxLength={3}
                      aria-label="Name separator"
                      onChange={(e) => {
                        const next = e.target.value
                        if (next.length > 0) patchFormat({ separator: next })
                      }}
                    />
                  </label>

                  <p className="settings__field-label">Field order</p>
                  <div className="settings__fields">
                    {format.fields.map((field, index) => (
                      <label
                        key={`${field}-${index}`}
                        className="settings__field"
                      >
                        <span className="settings__field-index">
                          {index + 1}
                        </span>
                        <select
                          className="settings__select"
                          value={field}
                          aria-label={`Field ${index + 1}`}
                          onChange={(e) =>
                            setFieldAt(index, e.target.value as NameField)
                          }
                        >
                          {NAME_FIELD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="settings__switch-hint">
                    Example: Sr - BCHS - 5:30 → group Sr, location BCHS; time is
                    ignored (API times are used).
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              id={`${panelId}-panel-team`}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-team`}
              className="settings__tab-panel"
            >
              {teamAdmin ? (
                <div className="settings__team">
                  <p className="settings__switch-hint">
                    You’re signed in as team admin for {tenant.displayName}.
                  </p>
                  <button
                    type="button"
                    className="settings__manage-btn"
                    onClick={openTeamBilling}
                  >
                    Open team billing
                  </button>
                </div>
              ) : (
                <form className="settings__team" onSubmit={onManageTeamSubmit}>
                  <p className="settings__switch-hint">
                    Enter the team password to manage subscription and billing
                    for {tenant.displayName}.
                  </p>
                  <label className="settings__field">
                    <span className="settings__field-label">
                      Team password
                    </span>
                    <input
                      type="password"
                      className="settings__input"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      disabled={manageBusy}
                    />
                  </label>
                  {manageError ? (
                    <p className="settings__team-error" role="alert">
                      {manageError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="settings__manage-btn"
                    disabled={manageBusy}
                  >
                    {manageBusy ? 'Checking…' : 'Continue'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
