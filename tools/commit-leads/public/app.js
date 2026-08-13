const statsEl = document.getElementById('stats')
const metaEl = document.getElementById('meta')
const bodyEl = document.getElementById('leads-body')
const targetEl = document.getElementById('target')
const searchEl = document.getElementById('search')
const detailBody = document.getElementById('detail-body')
const leadModal = document.getElementById('lead-modal')
const usasProgressEl = document.getElementById('usas-progress')
const logDiscover = document.getElementById('log-discover')
const logProcess = document.getElementById('log-process')
const exportStatus = document.getElementById('export-status')
const tipEl = document.getElementById('floating-tip')

let selectedId = null
let discoverBusy = false
let processBusy = false
let modalOpen = false
let lastLiveRefresh = 0
let liveRefreshQueued = false
let leadsCache = []
let sortKey = 'id'
let sortDir = 'asc'
let busyPollTimer = null

const STATUS_OPTIONS = [
  'new',
  'identified',
  'researched',
  'drafted',
  'contacted',
  'replied',
  'demo',
  'disqualified',
  'won',
  'lost',
]

function placeTip(anchor) {
  const text = anchor.getAttribute('data-tip')
  if (!text || !tipEl) return
  tipEl.textContent = text
  tipEl.hidden = false
  const gap = 8
  const rect = anchor.getBoundingClientRect()
  const tipRect = tipEl.getBoundingClientRect()
  let left = rect.left
  let top = rect.bottom + gap
  if (top + tipRect.height > window.innerHeight - 8) {
    top = rect.top - tipRect.height - gap
  }
  if (top < 8) top = 8
  if (left + tipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tipRect.width - 8
  }
  if (left < 8) left = 8
  tipEl.style.left = `${Math.round(left)}px`
  tipEl.style.top = `${Math.round(top)}px`
}

function hideTip() {
  if (tipEl) tipEl.hidden = true
}

document.addEventListener('mouseover', (e) => {
  const el = e.target?.closest?.('[data-tip]')
  if (el) placeTip(el)
})
document.addEventListener('mouseout', (e) => {
  const el = e.target?.closest?.('[data-tip]')
  if (el) hideTip()
})
document.addEventListener('focusin', (e) => {
  const el = e.target?.closest?.('[data-tip]')
  if (el) placeTip(el)
})
document.addEventListener('focusout', hideTip)
window.addEventListener('scroll', hideTip, true)
window.addEventListener('resize', hideTip)

function appendLog(el, line) {
  const html = colorizeStatusInText(String(line ?? ''))
  el.insertAdjacentHTML(
    'beforeend',
    `${el.childNodes.length ? '\n' : ''}<span class="log-line">${html}</span>`,
  )
  el.scrollTop = el.scrollHeight
}

function statusPill(status) {
  const s = String(status || 'new').toLowerCase()
  return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(s)}</span>`
}

function colorizeStatusInText(text) {
  const escaped = escapeHtml(text)
  return escaped.replace(
    /\b(new|identified|researched|drafted|contacted|replied|demo|disqualified|won|lost)\b/gi,
    (match) => statusPill(match.toLowerCase()),
  )
}

function setBusyUi() {
  document.querySelectorAll('#usas-form button').forEach((btn) => {
    btn.disabled = discoverBusy
  })
  document.querySelectorAll('[data-action="seed"]').forEach((btn) => {
    btn.disabled = discoverBusy
  })
  document.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.dataset.action
    if (action === 'seed' || action === 'export') return
    btn.disabled = processBusy
  })
  const queueBtn = document.getElementById('btn-process-queue')
  const oneBtn = document.getElementById('btn-process-one')
  const draftQueueBtn = document.getElementById('btn-draft-queue')
  const draftOneBtn = document.getElementById('btn-draft-one')
  if (queueBtn) queueBtn.disabled = processBusy
  if (oneBtn) oneBtn.disabled = processBusy
  if (draftQueueBtn) draftQueueBtn.disabled = processBusy
  if (draftOneBtn) draftOneBtn.disabled = processBusy
  const stopBtn = document.getElementById('stop-process')
  const stopDraftBtn = document.getElementById('stop-draft')
  const stopOutreach = document.getElementById('btn-stop-outreach')
  if (stopBtn) stopBtn.disabled = !processBusy
  if (stopDraftBtn) stopDraftBtn.disabled = !processBusy
  if (stopOutreach) stopOutreach.disabled = !processBusy
  const genAll = document.getElementById('btn-gen-all')
  const genOne = document.getElementById('btn-gen-draft')
  if (genAll) genAll.disabled = processBusy
  if (genOne) genOne.disabled = processBusy
  const addBtn = document.querySelector('#add-form button[type="submit"]')
  if (addBtn) addBtn.disabled = discoverBusy
}

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

function renderStats(summary) {
  const counts = summary.statusCounts || {}
  const pills = [
    ['Total', summary.total],
    ['Need FP', summary.pendingFingerprint ?? 0],
    ['Need enrich', summary.pendingEnrich ?? 0],
    ['Need score', summary.pendingScore ?? 0],
    ['Need draft', summary.pendingDraft ?? 0],
    ['Commit ID', summary.withSuperTeamId],
    ['Email', summary.withEmail],
  ]
  statsEl.innerHTML = pills
    .map(([k, v]) => `<div class="stat"><strong>${v}</strong> ${k}</div>`)
    .join('')

  renderStatusCounts(counts, summary.total)

  const busy = summary.busy || {}
  discoverBusy = !!busy.discover
  processBusy = !!busy.process
  setBusyUi()
  syncBusyPolling()

  metaEl.textContent = `Local UI · Ollama ${summary.model || '—'} · discover ${
    discoverBusy ? 'BUSY' : 'idle'
  } · process ${processBusy ? 'BUSY' : 'idle'}`

  if (usasProgressEl) {
    usasProgressEl.innerHTML = `One-shot import of the full Find a Team directory (~2,400 clubs with
          websites). Download cached ~24h. Already-imported websites are skipped.`
  }
}

function renderStatusCounts(counts, total) {
  const el = document.getElementById('status-counts')
  if (!el) return
  const active = document.getElementById('filter-status')?.value || ''
  const ordered = [
    ...STATUS_OPTIONS,
    ...Object.keys(counts).filter((s) => !STATUS_OPTIONS.includes(s)),
  ]
  const parts = [
    `<button type="button" class="status-count${!active ? ' active' : ''}" data-status-filter="">
      <span class="status-count-label">All</span>
      <strong>${Number(total ?? 0).toLocaleString()}</strong>
    </button>`,
  ]
  for (const status of ordered) {
    const n = counts[status] ?? 0
    if (n === 0 && !STATUS_OPTIONS.includes(status)) continue
    parts.push(
      `<button type="button" class="status-count${active === status ? ' active' : ''}" data-status-filter="${escapeHtml(status)}">
        ${statusPill(status)}
        <strong>${Number(n).toLocaleString()}</strong>
      </button>`,
    )
  }
  el.innerHTML = parts.join('')
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Parse USA Swimming region_notes: "TX · Austin · size 2298 · excellence Silver · source: …" */
function parseRegionNotes(notes) {
  const parts = String(notes ?? '')
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
  const out = {
    state: null,
    city: null,
    size: null,
    excellence: null,
    source: null,
    raw: notes || null,
  }
  for (const p of parts) {
    const sizeMatch = p.match(/^size\s+(\d[\d,]*)$/i)
    const excelMatch = p.match(/^excellence\s+(.+)$/i)
    const sourceMatch = p.match(/^source:\s*(.+)$/i)
    if (/^[A-Z]{2}$/.test(p)) out.state = p
    else if (sizeMatch) out.size = sizeMatch[1].replace(/,/g, '')
    else if (excelMatch) out.excellence = excelMatch[1].trim()
    else if (sourceMatch) out.source = sourceMatch[1].trim()
    else if (!out.city) out.city = p
  }
  return out
}

function renderTargetOptions(leads) {
  const current = targetEl.value
  targetEl.innerHTML =
    `<option value="">Select a lead…</option>` +
    leads
      .map(
        (l) =>
          `<option value="${l.id}">#${l.id} ${escapeHtml(l.team_name || l.website_url || 'lead')}</option>`,
      )
      .join('')
  if (current && [...targetEl.options].some((o) => o.value === current)) {
    targetEl.value = current
  }
}

function leadSortValue(lead, key) {
  const region = parseRegionNotes(lead.region_notes)
  switch (key) {
    case 'id':
      return lead.id
    case 'team':
      return (lead.team_name || '').toLowerCase()
    case 'state':
      return (region.state || '').toLowerCase()
    case 'size':
      return region.size ? Number(region.size) : -1
    case 'status':
      return (lead.status || '').toLowerCase()
    case 'fit':
      return lead.fit_score ?? -1
    case 'email':
      return (lead.contact_email || '').toLowerCase()
    case 'commit':
      return (lead.super_team_id || '').toLowerCase()
    default:
      return ''
  }
}

function syncFilterOptions(leads) {
  const statusEl = document.getElementById('filter-status')
  const stateEl = document.getElementById('filter-state')
  if (!statusEl || !stateEl) return

  const prevStatus = statusEl.value
  const prevState = stateEl.value

  const statuses = [
    ...new Set([
      ...STATUS_OPTIONS,
      ...leads.map((l) => l.status).filter(Boolean),
    ]),
  ]
  statusEl.innerHTML =
    `<option value="">All</option>` +
    statuses
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join('')
  if ([...statusEl.options].some((o) => o.value === prevStatus)) {
    statusEl.value = prevStatus
  }

  const states = [
    ...new Set(
      leads
        .map((l) => parseRegionNotes(l.region_notes).state)
        .filter(Boolean),
    ),
  ].sort()
  stateEl.innerHTML =
    `<option value="">All</option>` +
    states
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join('')
  if ([...stateEl.options].some((o) => o.value === prevState)) {
    stateEl.value = prevState
  }
}

function filteredSortedLeads() {
  const statusF = document.getElementById('filter-status')?.value || ''
  const stateF = document.getElementById('filter-state')?.value || ''
  const commitF = document.getElementById('filter-commit')?.value || ''

  let rows = leadsCache.filter((l) => {
    if (statusF && l.status !== statusF) return false
    const region = parseRegionNotes(l.region_notes)
    if (stateF && region.state !== stateF) return false
    if (commitF === 'yes' && !l.super_team_id) return false
    if (commitF === 'no' && l.super_team_id) return false
    return true
  })

  rows = [...rows].sort((a, b) => {
    const av = leadSortValue(a, sortKey)
    const bv = leadSortValue(b, sortKey)
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
    if (cmp === 0) cmp = a.id - b.id
    return sortDir === 'asc' ? cmp : -cmp
  })
  return rows
}

function updateSortHeaders() {
  document.querySelectorAll('#leads-table th.sortable').forEach((th) => {
    if (th.dataset.sort === sortKey) th.dataset.dir = sortDir
    else delete th.dataset.dir
  })
}

function applyLeadView() {
  const rows = filteredSortedLeads()
  renderLeads(rows)
  updateSortHeaders()
  const countEl = document.getElementById('leads-count')
  if (countEl) {
    const total = leadsCache.length
    countEl.textContent =
      rows.length === total
        ? `${total.toLocaleString()} leads`
        : `${rows.length.toLocaleString()} of ${total.toLocaleString()} leads`
  }
}

function renderLeads(leads) {
  bodyEl.innerHTML = leads
    .map((l) => {
      const active = l.id === selectedId ? 'active' : ''
      const region = parseRegionNotes(l.region_notes)
      const status = l.status || 'new'
      return `<tr class="${active}" data-id="${l.id}" data-status="${escapeHtml(status)}">
        <td>${l.id}</td>
        <td>${escapeHtml(l.team_name || '—')}<div class="mono">${escapeHtml(l.website_url || '')}</div></td>
        <td>${escapeHtml(region.state || '—')}${region.city ? `<div class="mono">${escapeHtml(region.city)}</div>` : ''}</td>
        <td>${region.size ? Number(region.size).toLocaleString() : '—'}</td>
        <td>${statusPill(status)}</td>
        <td>${l.fit_score ?? '—'}</td>
        <td class="mono">${escapeHtml(l.contact_email || '—')}</td>
        <td class="mono">${escapeHtml(l.super_team_id || '—')}</td>
      </tr>`
    })
    .join('')
}

async function refresh(opts = {}) {
  const light = opts.light === true
  const q = searchEl.value.trim()
  const [summary, leadsRes] = await Promise.all([
    fetchJson('/api/summary'),
    fetchJson(`/api/leads?q=${encodeURIComponent(q)}`),
  ])
  renderStats(summary)
  leadsCache = leadsRes.leads || []
  syncFilterOptions(leadsCache)
  applyLeadView()
  if (!light) {
    const all = await fetchJson('/api/leads')
    renderTargetOptions(all.leads)
  }
  if (modalOpen && selectedId) await showDetail(selectedId, { keepOpen: true })
}

/** Throttled list refresh while a batch is running. */
function scheduleLiveRefresh(immediate = false) {
  const gap = immediate ? 400 : 1200
  const now = Date.now()
  if (now - lastLiveRefresh < gap) {
    if (!liveRefreshQueued) {
      liveRefreshQueued = true
      setTimeout(() => {
        liveRefreshQueued = false
        scheduleLiveRefresh(immediate)
      }, gap - (now - lastLiveRefresh))
    }
    return
  }
  lastLiveRefresh = now
  refresh({ light: true }).catch(() => {})
}

function syncBusyPolling() {
  const shouldPoll = discoverBusy || processBusy
  if (shouldPoll && !busyPollTimer) {
    busyPollTimer = setInterval(() => {
      refresh({ light: true }).catch(() => {})
    }, 2000)
  } else if (!shouldPoll && busyPollTimer) {
    clearInterval(busyPollTimer)
    busyPollTimer = null
  }
}

function closeModal() {
  modalOpen = false
  if (leadModal) leadModal.hidden = true
  document.body.classList.remove('modal-open')
}

function openModal() {
  modalOpen = true
  if (leadModal) leadModal.hidden = false
  document.body.classList.add('modal-open')
}

async function showDetail(id, opts = {}) {
  selectedId = id
  const res = await fetchJson(`/api/leads/${id}`)
  const lead = res.lead
  const drafts = res.drafts || {}
  if (!opts.keepOpen) openModal()
  const modalTitle = document.getElementById('modal-title')
  if (modalTitle) {
    modalTitle.textContent = lead.team_name || `Lead #${lead.id}`
  }
  const region = parseRegionNotes(lead.region_notes)
  const sizeLabel = region.size
    ? Number(region.size).toLocaleString()
    : '—'
  const initialTouch = opts.touch || 1
  detailBody.innerHTML = `
    <div class="detail-grid">
      <div><dt>ID</dt><dd>${lead.id}</dd></div>
      <div><dt>Team</dt><dd>${escapeHtml(lead.team_name)}</dd></div>
      <div><dt>Website</dt><dd><a href="${escapeHtml(lead.website_url || '#')}" target="_blank" rel="noreferrer">${escapeHtml(lead.website_url || '—')}</a></dd></div>
      <div><dt>State</dt><dd>${escapeHtml(region.state || '—')}</dd></div>
      <div><dt>City / region</dt><dd>${escapeHtml(region.city || '—')}</dd></div>
      <div><dt>Team size</dt><dd>${sizeLabel}</dd></div>
      <div><dt>Club excellence</dt><dd>${escapeHtml(region.excellence || '—')}</dd></div>
      <div><dt>Address</dt><dd>${escapeHtml(lead.contact_address || '—')}</dd></div>
      <div><dt>Email</dt><dd class="mono">${escapeHtml(lead.contact_email || '—')}</dd></div>
      <div><dt>Phone</dt><dd>${escapeHtml(lead.contact_phone || '—')}</dd></div>
      <div><dt>superTeamId</dt><dd class="mono">${escapeHtml(lead.super_team_id || '—')}</dd></div>
      <div><dt>Timezone</dt><dd>${escapeHtml(lead.timezone || '—')}</dd></div>
      <div><dt>Fit / buyer</dt><dd>${lead.fit_score ?? '—'} · ${escapeHtml(lead.buyer_guess || '—')}</dd></div>
      <div>
        <dt>Status</dt>
        <dd class="status-edit">
          ${statusPill(lead.status || 'new')}
          <select class="status-select" id="status-select">
            ${STATUS_OPTIONS.map(
              (s) =>
                `<option value="${s}" ${s === lead.status ? 'selected' : ''}>${s}</option>`,
            ).join('')}
          </select>
        </dd>
      </div>
    </div>
    <p class="hint">Evidence: ${escapeHtml(lead.evidence || 'none')} · confidence ${lead.confidence ?? '—'} · contact source ${escapeHtml(lead.contact_source || '—')}${region.source ? ` · ${escapeHtml(region.source)}` : ''}</p>
    ${lead.region_notes ? `<p class="hint">Region notes: ${escapeHtml(lead.region_notes)}</p>` : ''}
    ${lead.fit_notes ? `<div class="notes">${escapeHtml(lead.fit_notes)}</div>` : ''}
    <section class="outreach" aria-label="Outreach drafts">
      <div class="outreach-head">
        <h3>Outreach drafts (3 touches)</h3>
        <p class="hint">
          researched = enrich done · drafted = touches 1–3 ready · contacted = you sent.
          Calendar window + Ollama customize each touch. Mail opens a draft only.
        </p>
      </div>
      <div class="touch-tabs" id="touch-tabs" role="tablist">
        <button type="button" data-touch="1" class="${initialTouch === 1 ? 'active' : ''}">1 · First</button>
        <button type="button" data-touch="2" class="${initialTouch === 2 ? 'active' : ''}">2 · Follow-up</button>
        <button type="button" data-touch="3" class="${initialTouch === 3 ? 'active' : ''}">3 · Close loop</button>
      </div>
      <p class="hint">Click tabs 2 and 3 to review follow-ups — Generate all 3 fills every tab.</p>
      <p id="touch-meta" class="hint touch-meta"></p>
      <label class="field">
        <span>Subject</span>
        <input id="draft-subject" type="text" value="" placeholder="Email subject" />
      </label>
      <div class="field draft-body-field">
        <span>Body</span>
        <div class="draft-body-split">
          <label class="draft-pane">
            <span class="draft-pane-label">HTML</span>
            <textarea id="draft-body" rows="14" placeholder="&lt;p&gt;…&lt;/p&gt; with &lt;a href&gt; links"></textarea>
          </label>
          <div class="draft-pane">
            <span class="draft-pane-label">Preview</span>
            <div id="draft-body-preview" class="draft-html-preview" aria-label="Email preview"></div>
          </div>
        </div>
      </div>
      <div id="draft-hooks" class="hooks"></div>
      <div class="outreach-actions">
        <button type="button" class="primary" id="btn-gen-all" data-tip="Generate / regenerate all 3 touches.">Generate all 3</button>
        <button type="button" id="btn-gen-draft" data-tip="Regenerate the selected touch only.">Regenerate this touch</button>
        <button type="button" class="danger" id="btn-stop-outreach" data-tip="Stop draft generation (same as Stop drafts)." disabled>Stop</button>
        <button type="button" class="ghost" id="btn-save-draft" data-tip="Save subject/body edits for this touch.">Save edits</button>
        <button type="button" id="btn-copy-draft" data-tip="Copy this touch (HTML for Mail/Gmail paste, plus plain text).">Copy draft</button>
        <button type="button" id="btn-open-mail" data-tip="Open this touch in Mac Mail.app.">Open in Mail</button>
        <button type="button" id="btn-open-mail-sent" data-tip="Open Mail and mark contacted (use for touch 1 send).">Open Mail + contacted</button>
        <button type="button" class="ghost" id="btn-mark-contacted" data-tip="Set status to contacted without opening Mail.">Mark contacted</button>
      </div>
      <p id="outreach-status" class="hint outreach-status" aria-live="polite"></p>
      <p class="hint">
        Fallback:
        <a id="mailto-fallback" href="#">mailto link</a>
        (short drafts only).
      </p>
    </section>
  `
  wireOutreach(id, lead, drafts, initialTouch)
  document.getElementById('status-select')?.addEventListener('change', async (e) => {
    await fetchJson(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value }),
    })
    await refresh()
  })
  ;[...bodyEl.querySelectorAll('tr')].forEach((tr) => {
    tr.classList.toggle('active', Number(tr.dataset.id) === id)
  })
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function renderHooks(hooks) {
  const el = document.getElementById('draft-hooks')
  if (!el) return
  if (!hooks?.length) {
    el.innerHTML =
      '<p class="hint">Customization ideas appear here after generate.</p>'
    return
  }
  el.innerHTML = `
    <h4>Potential customizations</h4>
    <ul>${hooks.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
  `
}

function looksLikeHtml(body) {
  return /<\/?(?:p|br|a|div|ul|ol|li|strong|em|b|i|h[1-6])\b/i.test(body || '')
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function copyDraftToClipboard(subject, body) {
  const html = (body || '').trim()
  const plainBody = looksLikeHtml(html) ? htmlToPlainText(html) : html
  const plain = [subject?.trim() ? `Subject: ${subject.trim()}` : '', plainBody]
    .filter(Boolean)
    .join('\n\n')
  if (!plain && !html) throw new Error('Nothing to copy')

  if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    const htmlBlob = new Blob(
      [html || `<p>${escapeHtml(plainBody).replace(/\n/g, '<br>')}</p>`],
      { type: 'text/html' },
    )
    const plainBlob = new Blob([plain], { type: 'text/plain' })
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': Promise.resolve(htmlBlob),
        'text/plain': Promise.resolve(plainBlob),
      }),
    ])
    return
  }
  await navigator.clipboard.writeText(plain)
}

function updateMailtoFallback(to, subject, body) {
  const a = document.getElementById('mailto-fallback')
  if (!a) return
  if (!to || !to.includes('@')) {
    a.removeAttribute('href')
    a.textContent = 'no contact email'
    return
  }
  const plain = looksLikeHtml(body) ? htmlToPlainText(body) : body
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (plain) params.set('body', plain)
  const url = `mailto:${to}?${params.toString()}`
  if (url.length > 1800) {
    a.removeAttribute('href')
    a.textContent = 'draft too long for mailto — use Open in Mail'
    return
  }
  a.href = url
  a.textContent = `mailto:${to}`
}

function setOutreachStatus(text) {
  const el = document.getElementById('outreach-status')
  if (el) el.textContent = text || ''
}

function touchReadyLabel(drafts) {
  return [1, 2, 3]
    .map((t) => (drafts[String(t)]?.body ? `${t}✓` : `${t}·`))
    .join(' ')
}

function wireOutreach(id, lead, draftsIn, initialTouch = 1) {
  let drafts = { ...(draftsIn || {}) }
  let touch = initialTouch
  const subjectEl = document.getElementById('draft-subject')
  const bodyElDraft = document.getElementById('draft-body')
  const previewEl = document.getElementById('draft-body-preview')
  const metaEl = document.getElementById('touch-meta')

  const syncPreview = () => {
    if (!previewEl) return
    const html = bodyElDraft?.value?.trim() || ''
    if (!html) {
      previewEl.innerHTML =
        '<p class="hint">Generate a draft — HTML edits show here live.</p>'
      return
    }
    // Trusted local drafts only — render as email HTML
    previewEl.innerHTML = html
  }

  const paintTabLabels = () => {
    document.querySelectorAll('#touch-tabs button').forEach((btn) => {
      const t = Number(btn.dataset.touch)
      const ready = Boolean(drafts[String(t)]?.body?.trim())
      const labels = { 1: 'First', 2: 'Follow-up', 3: 'Close loop' }
      btn.textContent = `${t} · ${labels[t] || ''}${ready ? ' ✓' : ''}`
      btn.classList.toggle('ready', ready)
    })
  }

  const showTouch = (t) => {
    touch = t
    paintTabLabels()
    document.querySelectorAll('#touch-tabs button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.touch) === t)
    })
    const d = drafts[String(t)] || {}
    if (subjectEl) subjectEl.value = d.subject || ''
    if (bodyElDraft) bodyElDraft.value = d.body || ''
    syncPreview()
    renderHooks(d.hooks || [])
    updateMailtoFallback(lead.contact_email, d.subject || '', d.body || '')
    if (metaEl) {
      metaEl.textContent = `Touches ready: ${touchReadyLabel(drafts)} · editing touch ${t}${
        d.generatedAt ? ` · generated ${d.generatedAt.slice(0, 16).replace('T', ' ')}` : ''
      }`
    }
  }

  showTouch(touch)

  document.querySelectorAll('#touch-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => showTouch(Number(btn.dataset.touch)))
  })

  const readDraft = () => ({
    subject: subjectEl?.value?.trim() || '',
    body: bodyElDraft?.value?.trim() || '',
  })

  const beginDraftBusy = () => {
    processBusy = true
    setBusyUi()
    syncBusyPolling()
  }
  const endDraftBusy = () => {
    processBusy = false
    setBusyUi()
    syncBusyPolling()
  }

  document.getElementById('btn-stop-outreach')?.addEventListener('click', () => {
    requestStopProcess('Stopped draft generation.')
  })

  document.getElementById('btn-gen-all')?.addEventListener('click', async () => {
    if (processBusy) {
      setOutreachStatus('Process lane busy — stop the current job first.')
      return
    }
    beginDraftBusy()
    setOutreachStatus(
      'Generating touches 1→2→3… Use Stop to cancel after the current Ollama call.',
    )
    try {
      const res = await fetchJson(`/api/leads/${id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, force: true }),
      })
      if (res.stopped) {
        drafts = res.drafts || drafts
        setOutreachStatus(
          `Stopped. Partial touches kept: ${touchReadyLabel(drafts)}.`,
        )
        showTouch(touch)
        await refresh()
        return
      }
      drafts = res.sequence?.drafts || res.draft?.drafts || drafts
      const ready = res.readyTouches || [1, 2, 3].filter((t) => drafts[String(t)]?.body)
      const failed = res.sequence?.failed || []
      const month = res.sequence?.schedule?.month || res.draft?.schedule?.month
      const schedNote = month
        ? `Calendar: ${month.practiceOccurrences} practices, ${month.upcomingMeets?.length ?? 0} meets.`
        : ''
      const failNote = failed.length
        ? ` Failed: ${failed.map((f) => `${f.touch} (${f.error})`).join('; ')}.`
        : ''
      setOutreachStatus(
        `Touches ready: [${ready.join(', ') || 'none'}] → status ${res.lead?.status || '—'}. ${schedNote}${failNote} Open tabs 2 and 3 to review.`,
      )
      showTouch(touch)
      await refresh()
      if (selectedId === id) await showDetail(id, { keepOpen: true, touch })
    } catch (err) {
      setOutreachStatus(err.message || String(err))
    } finally {
      endDraftBusy()
    }
  })

  document.getElementById('btn-gen-draft')?.addEventListener('click', async () => {
    if (processBusy) {
      setOutreachStatus('Process lane busy — stop the current job first.')
      return
    }
    beginDraftBusy()
    setOutreachStatus(`Regenerating touch ${touch}… (Stop cancels)`)
    try {
      const res = await fetchJson(`/api/leads/${id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touch, force: true }),
      })
      if (res.stopped) {
        setOutreachStatus('Stopped before this touch finished.')
        await refresh()
        return
      }
      if (res.draft?.drafts) drafts = res.draft.drafts
      else if (res.draft) {
        drafts = {
          ...drafts,
          [String(touch)]: {
            subject: res.draft.subject,
            body: res.draft.body,
            hooks: res.draft.customization_hooks || [],
            generatedAt: new Date().toISOString(),
          },
        }
      }
      setOutreachStatus(`Touch ${touch} ready. Status → ${res.lead?.status || '—'}`)
      showTouch(touch)
      await refresh()
    } catch (err) {
      setOutreachStatus(err.message || String(err))
    } finally {
      endDraftBusy()
    }
  })

  document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
    const { subject, body } = readDraft()
    try {
      const res = await fetchJson(`/api/leads/${id}/draft-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touch, subject, body }),
      })
      drafts = res.drafts || drafts
      updateMailtoFallback(lead.contact_email, subject, body)
      setOutreachStatus(`Saved touch ${touch} edits.`)
      showTouch(touch)
      await refresh()
    } catch (err) {
      setOutreachStatus(err.message || String(err))
    }
  })

  document.getElementById('btn-copy-draft')?.addEventListener('click', async () => {
    const { subject, body } = readDraft()
    if (!body) {
      setOutreachStatus('Generate or paste a draft body first.')
      return
    }
    try {
      await copyDraftToClipboard(subject, body)
      setOutreachStatus(`Copied touch ${touch} (HTML + plain, with subject).`)
    } catch (err) {
      setOutreachStatus(err.message || 'Could not copy')
    }
  })

  const openMail = async (markContacted) => {
    const { subject, body } = readDraft()
    if (!body) {
      setOutreachStatus('Generate or paste a draft body first.')
      return
    }
    setOutreachStatus(
      markContacted
        ? 'Opening Mail and marking contacted…'
        : `Opening Mac Mail for touch ${touch}…`,
    )
    try {
      const res = await fetchJson(`/api/leads/${id}/open-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, touch, markContacted }),
      })
      if (res.mailto) {
        const a = document.getElementById('mailto-fallback')
        if (a) {
          a.href = res.mailto
          a.textContent = `mailto:${lead.contact_email || 'recipient'}`
        }
      }
      setOutreachStatus(
        (res.mail?.message || (res.ok ? 'Opened Mail' : 'Mail open failed')) +
          (res.markedContacted ? ' · status → contacted' : ''),
      )
      await refresh()
      if (selectedId === id) await showDetail(id, { keepOpen: true, touch })
    } catch (err) {
      setOutreachStatus(err.message || String(err))
    }
  }

  document.getElementById('btn-open-mail')?.addEventListener('click', () => {
    openMail(false)
  })
  document
    .getElementById('btn-open-mail-sent')
    ?.addEventListener('click', () => openMail(true))

  document.getElementById('btn-mark-contacted')?.addEventListener('click', async () => {
    await fetchJson(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    })
    setOutreachStatus('Status set to contacted.')
    await refresh()
    if (selectedId === id) await showDetail(id, { keepOpen: true, touch })
  })

  const syncMailto = () => {
    const { subject, body } = readDraft()
    updateMailtoFallback(lead.contact_email, subject, body)
  }
  subjectEl?.addEventListener('input', syncMailto)
  bodyElDraft?.addEventListener('input', () => {
    syncMailto()
    syncPreview()
  })
}

function actionLane(action) {
  if (action === 'usas' || action === 'seed') return 'discover'
  if (action === 'export') return 'export'
  return 'process'
}

async function runAction(action, extra = {}, logEl = logProcess) {
  const lane = actionLane(action)
  if (lane === 'discover' && discoverBusy) {
    appendLog(logDiscover, 'Discover already running')
    return
  }
  if (lane === 'process' && processBusy) {
    appendLog(logProcess, 'Process lane already busy')
    return
  }

  if (lane === 'discover') discoverBusy = true
  else if (lane === 'process') processBusy = true
  setBusyUi()
  appendLog(logEl, `—— ${action} ——`)

  const target = extra.target ?? targetEl.value ?? ''
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...extra,
        target: extra.target !== undefined ? extra.target : target || 'all',
      }),
    })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || res.statusText)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        const line = part
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('')
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.type === 'log') {
          appendLog(logEl, msg.line)
          // Refresh leads table as each lead finishes a step
          if (/status →/i.test(msg.line)) {
            scheduleLiveRefresh(true)
          } else if (
            /scanned=|2a:|site:|fit=|imported|Added|duplicate_of|Stopped|Process pending complete|Process one complete/i.test(
              msg.line,
            ) ||
            /^#\d+:/.test(msg.line)
          ) {
            scheduleLiveRefresh(false)
          }
        }
        if (msg.type === 'done') {
          appendLog(logEl, msg.ok ? 'Done.' : `Failed: ${msg.error}`)
          if (msg.busy) {
            discoverBusy = !!msg.busy.discover
            processBusy = !!msg.busy.process
          }
          if (msg.summary) renderStats({ ...msg.summary, busy: msg.busy, model: msg.summary.model })
          // Always reload list so status/fit/email reflect completed work
          await refresh()
        }
      }
    }
  } catch (err) {
    appendLog(logEl, `ERROR: ${err.message}`)
  } finally {
    if (lane === 'discover') discoverBusy = false
    else if (lane === 'process') processBusy = false
    setBusyUi()
    await refresh()
  }
}

function selectedLeadId() {
  const v = String(targetEl.value || '').trim()
  if (!v || v === 'all') return null
  const id = Number(v)
  return Number.isFinite(id) && id > 0 ? id : null
}

function usasPayload() {
  const form = document.getElementById('usas-form')
  const fd = new FormData(form)
  const limitRaw = String(fd.get('limit') || '').trim()
  return {
    state: String(fd.get('state') || '').trim() || undefined,
    query: String(fd.get('query') || '').trim() || undefined,
    zip: String(fd.get('zip') || '').trim() || undefined,
    limit: limitRaw ? Number(limitRaw) : undefined,
    includeContacts: fd.get('includeContacts') === 'on',
    forceRefresh: fd.get('forceRefresh') === 'on',
    forceReimport: fd.get('forceReimport') === 'on',
  }
}

document.getElementById('btn-process-queue')?.addEventListener('click', () => {
  runAction(
    'process',
    {
      target: 'all',
      limit: Number(document.getElementById('process-limit').value || 25),
      forceReprocess:
        document.getElementById('process-force-queue')?.checked === true,
    },
    logProcess,
  )
})

document.getElementById('btn-process-one')?.addEventListener('click', () => {
  const id = selectedLeadId()
  if (!id) {
    appendLog(logProcess, 'Select a lead first')
    return
  }
  runAction(
    'process',
    {
      target: id,
      forceReprocess:
        document.getElementById('process-force-one')?.checked === true,
    },
    logProcess,
  )
})

document.getElementById('btn-draft-queue')?.addEventListener('click', () => {
  const touches = [1, 2, 3].filter(
    (t) => document.getElementById(`draft-touch-q-${t}`)?.checked === true,
  )
  if (!touches.length) {
    appendLog(logProcess, 'Pick at least one draft email (1, 2, or 3)')
    return
  }
  runAction(
    'draft',
    {
      target: 'all',
      limit: Number(document.getElementById('draft-limit')?.value || 10),
      forceReprocess:
        document.getElementById('draft-force-queue')?.checked === true,
      touches,
    },
    logProcess,
  )
})

document.getElementById('btn-draft-one')?.addEventListener('click', () => {
  const id = selectedLeadId()
  if (!id) {
    appendLog(logProcess, 'Select a lead first')
    return
  }
  const mode = document.getElementById('draft-touch-one')?.value || 'all'
  const touches =
    mode === 'all' ? [1, 2, 3] : [Number(mode)].filter((n) => [1, 2, 3].includes(n))
  runAction(
    'draft',
    {
      target: id,
      touches,
      forceReprocess: true,
    },
    logProcess,
  )
})

document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action
    if (action === 'export') {
      runExportAction()
      return
    }
    if (action === 'fingerprint' || action === 'enrich' || action === 'score') {
      const id = selectedLeadId()
      if (!id) {
        appendLog(logProcess, 'Select a lead first')
        return
      }
      runAction(action, { target: id }, logProcess)
      return
    }
    const logEl = action === 'seed' ? logDiscover : logProcess
    runAction(action, {}, logEl)
  })
})

async function requestStopProcess(outreachMsg) {
  appendLog(logProcess, 'Stop requested…')
  if (outreachMsg) setOutreachStatus(outreachMsg)
  try {
    const res = await fetchJson('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lane: 'process' }),
    })
    const line = res.stopped
      ? 'Stopping after current Ollama/lead step…'
      : res.message || 'Process not running'
    appendLog(logProcess, line)
    if (outreachMsg) setOutreachStatus(line)
  } catch (err) {
    appendLog(logProcess, `Stop failed: ${err.message}`)
    if (outreachMsg) setOutreachStatus(`Stop failed: ${err.message}`)
  }
}

document.getElementById('stop-process')?.addEventListener('click', () => {
  requestStopProcess()
})
document.getElementById('stop-draft')?.addEventListener('click', () => {
  requestStopProcess('Stopping draft generation…')
})

async function runExportAction() {
  if (exportStatus) exportStatus.textContent = 'Exporting…'
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'export' }),
    })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || res.statusText)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastLine = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        const line = part
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('')
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.type === 'log') lastLine = msg.line
        if (msg.type === 'done') {
          if (exportStatus) {
            exportStatus.textContent = msg.ok
              ? lastLine || 'Exported.'
              : `Failed: ${msg.error}`
          }
        }
      }
    }
  } catch (err) {
    if (exportStatus) {
      exportStatus.textContent = `Export failed: ${err.message}`
    }
  }
}

document.querySelectorAll('.clear-log').forEach((btn) => {
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.log)
    if (el) el.textContent = ''
  })
})

document.getElementById('usas-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  await runAction('usas', usasPayload(), logDiscover)
})

bodyEl.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]')
  if (!tr) return
  const id = Number(tr.dataset.id)
  if (targetEl && [...targetEl.options].some((o) => o.value === String(id))) {
    targetEl.value = String(id)
  }
  showDetail(id)
})

leadModal?.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeModal)
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen) closeModal()
})

let searchTimer
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => refresh(), 200)
})

document.getElementById('filter-status')?.addEventListener('change', () => {
  applyLeadView()
  const selected = document.getElementById('filter-status')?.value || ''
  document.querySelectorAll('#status-counts .status-count').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.statusFilter || '') === selected)
  })
})

document.getElementById('status-counts')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-status-filter]')
  if (!btn) return
  const statusEl = document.getElementById('filter-status')
  if (!statusEl) return
  statusEl.value = btn.dataset.statusFilter || ''
  statusEl.dispatchEvent(new Event('change'))
})
document.getElementById('filter-state')?.addEventListener('change', () => {
  applyLeadView()
})
document.getElementById('filter-commit')?.addEventListener('change', () => {
  applyLeadView()
})

document.querySelectorAll('#leads-table th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort
    if (!key) return
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    else {
      sortKey = key
      sortDir = key === 'fit' || key === 'size' ? 'desc' : 'asc'
    }
    applyLeadView()
  })
})

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const fd = new FormData(e.target)
  const payload = Object.fromEntries(fd.entries())
  try {
    const { id } = await fetchJson('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    appendLog(logDiscover, `Added lead #${id}`)
    e.target.reset()
    selectedId = id
    await refresh()
  } catch (err) {
    appendLog(logDiscover, `Add failed: ${err.message}`)
  }
})

refresh().catch((err) => {
  metaEl.textContent = `Failed to load: ${err.message}`
})
