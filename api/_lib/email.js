import { escapeHtml } from './http.js'

/** Confirmation email after subscribe. */
export function confirmEmailContent({
  tenantName,
  confirmUrl,
  frequency,
  groupsLabel,
}) {
  const subject = `Confirm your ${tenantName} schedule emails`
  const text = [
    `Confirm your My Swim Day subscription for ${tenantName}.`,
    ``,
    `Frequency: ${frequency}`,
    `Groups: ${groupsLabel}`,
    ``,
    `Confirm: ${confirmUrl}`,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].join('\n')

  const html = baseLayout({
    heading: `Confirm schedule emails`,
    bodyHtml: `
      <p style="margin:0 0 1rem;line-height:1.5;color:#3d5a62">
        Confirm your <strong>${escapeHtml(tenantName)}</strong> ${escapeHtml(frequency)}
        schedule emails (${escapeHtml(groupsLabel)}).
      </p>
      <p style="margin:0 0 1.25rem">
        <a href="${escapeHtml(confirmUrl)}"
           style="display:inline-block;background:#0b6e7a;color:#fff;text-decoration:none;
                  font-weight:700;padding:0.7rem 1.1rem;border-radius:999px">
          Confirm subscription
        </a>
      </p>
      <p style="margin:0;font-size:0.85rem;line-height:1.45;color:#6a8086">
        If you did not request this, ignore this email.
      </p>`,
  })

  return { subject, html, text }
}

/** Daily / weekly schedule digest. */
export function digestEmailContent({
  digest,
  tenantName,
  scheduleUrl,
  unsubscribeUrl,
  frequency,
}) {
  const subject = digest.empty
    ? `${digest.title} — no sessions`
    : digest.title

  const lines = digest.rows.map((row) => {
    const kind = row.kindLabel || kindTitle(row.kind)
    const groups =
      row.groupsLabel ||
      (Array.isArray(row.groups) ? row.groups.join(', ') : row.groups) ||
      ''
    const loc = row.location ? ` @ ${row.location}` : ''
    const groupPart = groups ? ` · ${groups}` : ''
    return `${row.day} · ${kind}${groupPart} — ${row.name}${loc} · ${row.time}`
  })

  const text = [
    digest.title,
    digest.subtitle,
    ``,
    ...(digest.empty ? ['No sessions for your selected filters.'] : lines),
    ``,
    scheduleUrl ? `View schedule: ${scheduleUrl}` : null,
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  const rowsHtml = digest.empty
    ? `<p style="margin:0;line-height:1.5;color:#3d5a62">No sessions for your selected filters.</p>`
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${digest.rows.map((row, index) => digestRowHtml(row, index)).join('')}
      </table>`

  const html = baseLayout({
    heading: digest.title,
    subheading: digest.subtitle,
    bodyHtml: `
      ${rowsHtml}
      ${
        scheduleUrl
          ? `<p style="margin:1.25rem 0 0">
              <a href="${escapeHtml(scheduleUrl)}" style="color:#0b6e7a;font-weight:700">
                Open ${escapeHtml(tenantName)} schedule
              </a>
            </p>`
          : ''
      }
      <p style="margin:1.25rem 0 0;font-size:0.8rem;line-height:1.45;color:#6a8086">
        You’re receiving ${escapeHtml(frequency)} My Swim Day emails.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6a8086">Unsubscribe</a>
      </p>`,
  })

  return {
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    },
  }
}

function digestRowHtml(row, index) {
  const border = index === 0 ? '' : 'border-top:1px solid rgba(22,50,57,.1);'
  const kind = row.kind || 'practice'
  const kindLabel = row.kindLabel || kindTitle(kind)
  const groups = Array.isArray(row.groups)
    ? row.groups
    : row.groupsLabel
      ? String(row.groupsLabel)
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : []
  const badges = [
    kindBadgeHtml(kind, kindLabel),
    ...groups.map((group) => groupBadgeHtml(group)),
  ].join(' ')

  const details = [row.time, row.location].filter(Boolean).join(' · ')

  return `<tr>
    <td style="padding:0.85rem 0;${border};vertical-align:top">
      <div style="font-size:0.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6a8086">
        ${escapeHtml(row.day)}
      </div>
      <div style="margin-top:0.35rem;line-height:1.6">
        ${badges}
      </div>
      <div style="margin-top:0.35rem;font-weight:700;color:#163239;font-size:1.02rem">
        ${escapeHtml(row.name)}
      </div>
      ${
        details
          ? `<div style="margin-top:0.2rem;color:#3d5a62;font-size:0.92rem">
              ${escapeHtml(details)}
            </div>`
          : ''
      }
    </td>
  </tr>`
}

function kindTitle(kind) {
  if (kind === 'meet') return 'Meet'
  if (kind === 'event') return 'Event'
  return 'Practice'
}

function kindBadgeHtml(kind, label) {
  const colors =
    kind === 'meet'
      ? { bg: '#fae8ff', fg: '#a21caf', border: '#e879f9' }
      : kind === 'event'
        ? { bg: '#e0e7ff', fg: '#4338ca', border: '#818cf8' }
        : { bg: '#dff5f7', fg: '#0b6e7a', border: '#5ec4cf' }
  return badgeHtml(label, colors)
}

function groupBadgeHtml(group) {
  return badgeHtml(group, {
    bg: '#eef3f5',
    fg: '#163239',
    border: 'rgba(22,50,57,.18)',
  })
}

function badgeHtml(label, { bg, fg, border }) {
  return `<span style="display:inline-block;margin:0 0.25rem 0.2rem 0;padding:0.15rem 0.5rem;
    border:1px solid ${border};border-radius:999px;background:${bg};color:${fg};
    font-size:0.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
    font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">${escapeHtml(label)}</span>`
}

function baseLayout({ heading, subheading, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f7f8;color:#163239;
  font-family:Georgia,'Times New Roman',serif">
  <div style="max-width:32rem;margin:0 auto;padding:1.5rem 1rem 2rem">
    <div style="font-size:0.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0b6e7a">
      My Swim Day
    </div>
    <h1 style="margin:0.45rem 0 0.25rem;font-size:1.45rem;line-height:1.25">
      ${escapeHtml(heading)}
    </h1>
    ${
      subheading
        ? `<p style="margin:0 0 1.1rem;color:#6a8086">${escapeHtml(subheading)}</p>`
        : `<div style="height:1rem"></div>`
    }
    <div style="padding:1rem 1.1rem;border:1px solid rgba(22,50,57,.12);border-radius:1rem;
      background:rgba(255,255,255,.92)">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`
}
