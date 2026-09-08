import { Fragment, type CSSProperties } from 'react'
import {
  colorForGroup,
  findGroup,
  highlightGroupsInName,
  visiblePracticeGroups,
} from '../lib/groups'
import { useTenant } from '../tenants/TenantContext'

function colorStyle(color: string): CSSProperties {
  return { '--group-color': color } as CSSProperties
}

interface GroupLabelProps {
  groups: string[]
  /** Active filter chips — narrows a shared session to the chosen groups. */
  selectedGroups?: Set<string>
  className?: string
}

/**
 * Group names for a session, each in its own color.
 * The card's fill stays on the first group; only the words split by color.
 */
export function GroupLabel({
  groups,
  selectedGroups,
  className = '',
}: GroupLabelProps) {
  const tenant = useTenant()
  const shown = visiblePracticeGroups(groups, selectedGroups)
  if (shown.length === 0) return null

  return (
    <span className={`group-label ${className}`.trim()}>
      {shown.map((id, index) => (
        <Fragment key={id}>
          {/* Real spaces around the slash keep long labels wrappable. */}
          {index > 0 ? (
            <>
              {' '}
              <span className="group-label__sep">/</span>{' '}
            </>
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

interface GroupColoredNameProps {
  name: string
  groups: string[]
}

/** A session title with its group words tinted to match their chips. */
export function GroupColoredName({ name, groups }: GroupColoredNameProps) {
  const tenant = useTenant()
  const segments = highlightGroupsInName(tenant, name, groups)

  return (
    <>
      {segments.map((segment, index) =>
        segment.color ? (
          <span
            key={`${index}-${segment.text}`}
            className="group-name"
            style={colorStyle(segment.color)}
          >
            {segment.text}
          </span>
        ) : (
          <Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}
