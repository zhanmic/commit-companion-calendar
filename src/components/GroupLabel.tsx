import { Fragment, type CSSProperties } from 'react'
import { colorForGroup, findGroup, visiblePracticeGroups } from '../lib/groups'
import { useTenant } from '../tenants/TenantContext'

function colorStyle(color: string): CSSProperties {
  return { '--group-color': color } as CSSProperties
}

interface GroupLabelProps {
  groups: string[]
  /** Active filter chips — narrows a shared session to the chosen groups. */
  selectedGroups?: Set<string>
  className?: string
  /** Text between names. Keep the spaces — they let long labels wrap. */
  separator?: string
}

/**
 * Group names for a session, each in its own color.
 * The card's fill stays on the first group; only the words split by color.
 */
export function GroupLabel({
  groups,
  selectedGroups,
  className = '',
  separator = ' / ',
}: GroupLabelProps) {
  const tenant = useTenant()
  const shown = visiblePracticeGroups(groups, selectedGroups)
  if (shown.length === 0) return null

  return (
    <span className={`group-label ${className}`.trim()}>
      {shown.map((id, index) => (
        <Fragment key={id}>
          {index > 0 ? (
            <span className="group-label__sep">{separator}</span>
          ) : null}
          <span
            className="group-label__name"
            style={colorStyle(colorForGroup(tenant, id))}
          >
            {findGroup(tenant, id)?.label ?? id}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
