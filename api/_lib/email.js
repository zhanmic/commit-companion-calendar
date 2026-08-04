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
    const loc = row.location ? ` @ ${row.location}` : ''
    const groups = row.groups ? ` [${row.groups}]` : ''
    const kind = row.kind !== 'practice' ? ` (${row.kind})` : ''
    return `${row.day} ${row.time} — ${row.name}${loc}${groups}${kind}`
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
        ${digest.rows
          .map((row, index) => {
            const border =
              index === 0 ? '' : 'border-top:1px solid rgba(22,50,57,.1);'
            const meta = [
              row.kind !== 'practice' ? row.kind : null,
              row.groups || null,
              row.location || null,
            ]
              .filter(Boolean)
              .join(' · ')
            return `<tr>
              <td style="padding:0.75rem 0;${border};vertical-align:top">
                <div style="font-size:0.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6a8086">
                  ${escapeHtml(row.day)}
                </div>
                <div style="margin-top:0.2rem;font-weight:700;color:#163239">
                  ${escapeHtml(row.name)}
                </div>
                <div style="margin-top:0.15rem;color:#3d5a62;font-size:0.92rem">
                  ${escapeHtml(row.time)}${meta ? ` · ${escapeHtml(meta)}` : ''}
                </div>
              </td>
            </tr>`
          })
          .join('')}
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
