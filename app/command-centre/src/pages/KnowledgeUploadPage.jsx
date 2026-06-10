/**
 * Knowledge Upload — Coach's Eye Intelligence
 *
 * The interface through which Coach's Eye Intelligence learns from Simon's
 * coaching documents. Upload PDFs, Word docs, spreadsheets, images, video
 * links, and manual notes. All documents are mock-processed locally.
 *
 * Feature flag: aiKnowledgeUpload
 * No Core logic duplicated. All processing stays inside Intelligence.
 */

import { useState, useCallback, useRef } from 'react'
import { useKnowledgeLibrary } from '../hooks/useClubData.js'
import { api } from '../api/client.js'
import IntelligencePageHeader  from '../components/intelligence/IntelligencePageHeader.jsx'
import IntelligenceSkeleton    from '../components/intelligence/IntelligenceSkeleton.jsx'
import { confidenceColor }     from '../utils/intelligence.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES  = ['All', 'Training', 'Selection', 'Medical', 'Performance', 'Player Development', 'Club', 'Analysis']
const AGE_GROUPS  = ['All', 'Senior', 'U20', 'U18', 'U16', 'All Ages']
const TEAMS       = ['All', 'Senior A', 'Senior B', 'Under 20s', 'Under 18s']
const SEASONS     = ['All', '2025-26', '2024-25', '2023-24']
const FILE_TYPES  = ['All', 'pdf', 'docx', 'xlsx', 'image', 'video_link', 'note']
const STATUSES    = ['All', 'uploaded', 'extracting', 'tagged', 'reviewed', 'added_to_knowledge_base', 'failed']

const FILE_TYPE_META = {
  pdf:        { label: 'PDF',         icon: '📄', accept: '.pdf',                          color: 'text-red-500' },
  docx:       { label: 'Word',        icon: '📝', accept: '.doc,.docx',                    color: 'text-blue-500' },
  xlsx:       { label: 'Spreadsheet', icon: '📊', accept: '.xls,.xlsx,.csv',               color: 'text-green-600' },
  image:      { label: 'Image',       icon: '🖼️', accept: '.jpg,.jpeg,.png,.gif,.webp',    color: 'text-purple-500' },
  video_link: { label: 'Video Link',  icon: '🎬', accept: null,                            color: 'text-orange-500' },
  note:       { label: 'Note',        icon: '✏️', accept: null,                            color: 'text-amber-500' },
}

const STATUS_META = {
  uploaded:               { label: 'Uploaded',        color: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300' },
  extracting:             { label: 'Extracting…',     color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300' },
  tagged:                 { label: 'Tagged',          color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  reviewed:               { label: 'Reviewed',        color: 'bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-300' },
  added_to_knowledge_base:{ label: 'In Knowledge Base',color:'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400' },
  failed:                 { label: 'Failed',          color: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400' },
}

const CAT_COLOR = {
  Training:           'text-amber-500',
  Selection:          'text-orange-500',
  Medical:            'text-red-500',
  Performance:        'text-green-500',
  'Player Development':'text-purple-500',
  Club:               'text-indigo-500',
  Analysis:           'text-blue-500',
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ onUpload }) {
  const [mode,     setMode]     = useState('file')   // 'file' | 'video_link' | 'note'
  const [dragging, setDragging] = useState(false)
  const [form,     setForm]     = useState({ title: '', url: '', notes: '', category: 'Training', team: '', ageGroup: 'Senior', season: '2025-26', tags: '' })
  const [uploading, setUploading] = useState(false)
  const [error,    setError]    = useState(null)
  const fileRef = useRef(null)

  const acceptStr = mode === 'file'
    ? '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp'
    : null

  function detectFileType(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    if (['pdf'].includes(ext))                           return 'pdf'
    if (['doc','docx'].includes(ext))                    return 'docx'
    if (['xls','xlsx','csv'].includes(ext))              return 'xlsx'
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
    return 'note'
  }

  async function submitFile(file) {
    setUploading(true); setError(null)
    try {
      const doc = await api.knowledgeUpload({
        title:     form.title || file.name.replace(/\.[^.]+$/, ''),
        fileType:  detectFileType(file),
        fileSize:  `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        category:  form.category,
        team:      form.team || null,
        ageGroup:  form.ageGroup || null,
        season:    form.season,
        tags:      form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        source:    'upload',
        coach:     'Simon Dodd',
      })
      onUpload(doc.document)
      setForm(f => ({ ...f, title: '', tags: '' }))
    } catch {
      setError('Upload failed. Using mock data.')
      onUpload({ id: `kd-local-${Date.now()}`, title: form.title || file.name, fileType: detectFileType(file), processingStatus: 'uploaded', category: form.category, team: form.team || null, ageGroup: form.ageGroup, season: form.season, tags: [], uploadDate: new Date().toISOString(), extractedSummary: null, confidence: null, detectedThemes: [], suggestedTags: [], linkedPlayers: [], linkedTeams: [], linkedFixtures: [], source: 'upload', coach: 'Simon Dodd', fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB` })
    } finally {
      setUploading(false)
    }
  }

  async function submitLink() {
    if (!form.url || !form.title) { setError('Title and URL are required.'); return }
    setUploading(true); setError(null)
    try {
      const doc = await api.knowledgeUpload({
        title:    form.title,
        fileType: 'video_link',
        url:      form.url,
        category: form.category,
        team:     form.team || null,
        ageGroup: form.ageGroup || null,
        season:   form.season,
        tags:     form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        source:   'link',
        coach:    'Simon Dodd',
      })
      onUpload(doc.document)
      setForm(f => ({ ...f, title: '', url: '', tags: '' }))
    } catch {
      setError('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function submitNote() {
    if (!form.title) { setError('Title is required.'); return }
    setUploading(true); setError(null)
    try {
      const doc = await api.knowledgeUpload({
        title:    form.title,
        fileType: 'note',
        notes:    form.notes,
        category: form.category,
        team:     form.team || null,
        ageGroup: form.ageGroup || null,
        season:   form.season,
        tags:     form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        source:   'manual',
        coach:    'Simon Dodd',
      })
      onUpload(doc.document)
      setForm(f => ({ ...f, title: '', notes: '', tags: '' }))
    } catch {
      setError('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) submitFile(file)
  }, [form])

  const handleFileChange = e => {
    const file = e.target.files?.[0]
    if (file) submitFile(file)
    e.target.value = ''
  }

  const f = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-semibold text-ink-1 text-sm">Add to Knowledge Base</h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium">AI learns from this</span>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 mb-4 p-1 bg-surface-2 rounded-lg w-fit">
        {[
          { key: 'file',       label: 'File Upload',  icon: '📁' },
          { key: 'video_link', label: 'Video Link',   icon: '🎬' },
          { key: 'note',       label: 'Manual Note',  icon: '✏️' },
        ].map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => { setMode(m.key); setError(null) }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === m.key ? 'bg-surface-1 text-ink-1 shadow-sm' : 'text-ink-3 hover:text-ink-2'}`}
          >
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">

        {/* Left: upload input */}
        <div>
          {mode === 'file' && (
            <div
              className={`border-2 border-dashed rounded-xl transition-colors cursor-pointer ${dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 bg-surface-2'}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              aria-label="Upload file — click or drag and drop"
            >
              <input
                ref={fileRef}
                type="file"
                accept={acceptStr}
                onChange={handleFileChange}
                className="hidden"
                aria-hidden="true"
              />
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center pointer-events-none">
                {uploading ? (
                  <>
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm text-ink-2 font-medium">Uploading…</p>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      {['pdf','docx','xlsx','image'].map(t => (
                        <span key={t} className="text-xl">{FILE_TYPE_META[t].icon}</span>
                      ))}
                    </div>
                    <p className="text-sm font-medium text-ink-1">Drop a file here, or click to browse</p>
                    <p className="text-[11px] text-ink-3 mt-1">PDF, Word, Excel, Images — up to 50 MB</p>
                  </>
                )}
              </div>
            </div>
          )}

          {mode === 'video_link' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Video / Link URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={e => f('url', e.target.value)}
                  placeholder="https://youtube.com/…  or any resource URL"
                  className="w-full text-sm bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => f('title', e.target.value)}
                  placeholder="e.g. Opposition Analysis: Naas Kicking Game"
                  className="w-full text-sm bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
                />
              </div>
              <button
                type="button"
                onClick={submitLink}
                disabled={uploading}
                className="w-full text-sm font-semibold py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
              >
                {uploading ? 'Adding…' : 'Add Video Link'}
              </button>
            </div>
          )}

          {mode === 'note' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Note Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => f('title', e.target.value)}
                  placeholder="e.g. Post-match observation — vs Clontarf"
                  className="w-full text-sm bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => f('notes', e.target.value)}
                  rows={4}
                  placeholder="Write your coaching observations, analysis, or notes here…"
                  className="w-full text-sm bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <button
                type="button"
                onClick={submitNote}
                disabled={uploading}
                className="w-full text-sm font-semibold py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
              >
                {uploading ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          )}
        </div>

        {/* Right: metadata form */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Classification</p>

          {mode === 'file' && (
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Document Title (optional)</label>
              <input
                type="text"
                value={form.title}
                onChange={e => f('title', e.target.value)}
                placeholder="Leave blank to use filename"
                className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Category</label>
            <select value={form.category} onChange={e => f('category', e.target.value)} className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 focus:outline-none focus:border-accent">
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Team</label>
            <select value={form.team} onChange={e => f('team', e.target.value)} className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 focus:outline-none focus:border-accent">
              <option value="">All teams</option>
              {TEAMS.filter(t => t !== 'All').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Age Group</label>
              <select value={form.ageGroup} onChange={e => f('ageGroup', e.target.value)} className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 focus:outline-none focus:border-accent">
                {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-2 mb-1">Season</label>
              <select value={form.season} onChange={e => f('season', e.target.value)} className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 focus:outline-none focus:border-accent">
                {SEASONS.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-2 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={e => f('tags', e.target.value)}
              placeholder="pre-season, scrum, u20…"
              className="w-full text-xs bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">{error}</p>
      )}
    </div>
  )
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, selected, onSelect }) {
  const ft   = FILE_TYPE_META[doc.fileType] ?? FILE_TYPE_META.note
  const st   = STATUS_META[doc.processingStatus]   ?? STATUS_META.uploaded
  const catC = CAT_COLOR[doc.category] ?? 'text-ink-3'

  const isExtracting = doc.processingStatus === 'extracting'

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : doc)}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all ${selected ? 'bg-accent/5 border border-accent/30' : 'bg-surface-1 border border-border-subtle hover:border-border hover:bg-surface-2'}`}
      aria-pressed={selected}
      aria-label={doc.title}
    >
      {/* File type icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 bg-surface-2 ${selected ? 'bg-accent/10' : ''}`}>
        {ft.icon}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-1 truncate leading-snug">{doc.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium ${catC}`}>{doc.category}</span>
          {doc.team && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{doc.team}</span></>}
          {doc.ageGroup && doc.ageGroup !== 'All' && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{doc.ageGroup}</span></>}
          {doc.season && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{doc.season}</span></>}
        </div>
      </div>

      {/* Right column: status + confidence */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${st.color} ${isExtracting ? 'animate-pulse' : ''}`}>
          {st.label}
        </span>
        {doc.confidence != null && (
          <span className={`text-[10px] font-medium ${confidenceColor(doc.confidence)}`}>{doc.confidence}%</span>
        )}
      </div>
    </button>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange }) {
  const controls = [
    { key: 'category', label: 'Category', options: CATEGORIES },
    { key: 'ageGroup', label: 'Age',       options: AGE_GROUPS },
    { key: 'team',     label: 'Team',      options: TEAMS },
    { key: 'season',   label: 'Season',    options: SEASONS },
    { key: 'fileType', label: 'Type',      options: FILE_TYPES.map(t => ({ value: t, label: t === 'All' ? 'All types' : (FILE_TYPE_META[t]?.label ?? t) })) },
    { key: 'status',   label: 'Status',    options: STATUSES.map(s => ({ value: s, label: s === 'All' ? 'All statuses' : (STATUS_META[s]?.label ?? s) })) },
  ]

  const hasActive = Object.entries(filters).some(([k, v]) => k !== 'q' && v && v !== 'All')

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {controls.map(ctrl => (
        <select
          key={ctrl.key}
          value={filters[ctrl.key] ?? 'All'}
          onChange={e => onChange(ctrl.key, e.target.value)}
          aria-label={`Filter by ${ctrl.label}`}
          className="text-[11px] bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-2 focus:outline-none focus:border-accent"
        >
          {ctrl.options.map(o => {
            const val   = typeof o === 'string' ? o : o.value
            const label = typeof o === 'string' ? (o === 'All' ? `All ${ctrl.label.toLowerCase()}s` : o) : o.label
            return <option key={val} value={val}>{label}</option>
          })}
        </select>
      ))}
      {hasActive && (
        <button
          type="button"
          onClick={() => onChange('__clear')}
          className="text-[11px] text-ink-3 hover:text-ink-2 px-2 py-1.5"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// ── Document detail panel ─────────────────────────────────────────────────────

function DetailPanel({ doc, onAction }) {
  const [toasted, setToasted] = useState(null)

  function fire(fn, msg) {
    fn()
    setToasted(msg)
    setTimeout(() => setToasted(null), 2600)
  }

  if (!doc) {
    return (
      <div className="card p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3 text-2xl">📚</div>
        <p className="text-sm font-medium text-ink-2">Select a document</p>
        <p className="text-xs text-ink-3 mt-1 max-w-[200px] leading-relaxed">
          Choose a document from the library to view extracted coaching insights.
        </p>
      </div>
    )
  }

  const ft = FILE_TYPE_META[doc.fileType] ?? FILE_TYPE_META.note
  const st = STATUS_META[doc.processingStatus] ?? STATUS_META.uploaded
  const isProcessed = doc.extractedSummary != null

  return (
    <div className="card overflow-hidden">
      {/* Toast */}
      {toasted && (
        <div className="absolute top-3 right-3 z-10 bg-green-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg">
          {toasted}
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl mt-0.5 shrink-0">{ft.icon}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ink-1 leading-snug">{doc.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] font-semibold ${CAT_COLOR[doc.category] ?? 'text-ink-3'}`}>{doc.category}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
            </div>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {[
            { label: 'File type',  value: ft.label },
            { label: 'Coach',      value: doc.coach ?? '—' },
            { label: 'Team',       value: doc.team ?? 'All teams' },
            { label: 'Age group',  value: doc.ageGroup ?? '—' },
            { label: 'Season',     value: doc.season ?? '—' },
            { label: 'Uploaded',   value: doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '—' },
            doc.fileSize  ? { label: 'Size',   value: doc.fileSize }          : null,
            doc.pageCount ? { label: 'Pages',  value: `${doc.pageCount}p` }   : null,
          ].filter(Boolean).map(m => (
            <div key={m.label} className="flex flex-col">
              <span className="text-[9px] text-ink-3 uppercase tracking-wide">{m.label}</span>
              <span className="text-[11px] text-ink-1 font-medium">{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 max-h-[calc(100vh-460px)] overflow-y-auto">

        {/* Confidence */}
        {doc.confidence != null && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="font-semibold text-ink-3 uppercase tracking-wide">Extraction confidence</span>
              <span className={`font-bold ${confidenceColor(doc.confidence)}`}>{doc.confidence}%</span>
            </div>
            <div className="h-1.5 bg-surface-3 rounded-full">
              <div
                className={`h-full rounded-full transition-all duration-700 ${doc.confidence >= 85 ? 'bg-green-400' : doc.confidence >= 65 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${doc.confidence}%` }}
              />
            </div>
          </div>
        )}

        {/* Not yet processed */}
        {!isProcessed && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 p-3 text-center">
            {doc.processingStatus === 'extracting' ? (
              <>
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Extracting content…</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">This usually takes a few seconds</p>
              </>
            ) : (
              <>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Awaiting extraction</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">Document uploaded, processing not yet started</p>
              </>
            )}
          </div>
        )}

        {/* Extracted summary */}
        {doc.extractedSummary && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Extracted Summary</p>
            <p className="text-xs text-ink-2 leading-relaxed">{doc.extractedSummary}</p>
          </div>
        )}

        {/* Detected coaching themes */}
        {doc.detectedThemes?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Detected Coaching Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {doc.detectedThemes.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggested tags */}
        {doc.suggestedTags?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Suggested Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {doc.suggestedTags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-2 border border-border-subtle text-ink-2 font-medium">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Manual tags */}
        {doc.tags?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Coach Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {doc.tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Video link */}
        {doc.url && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Resource URL</p>
            <p className="text-[11px] text-ink-3 font-mono break-all">{doc.url}</p>
          </div>
        )}

        {/* Manual notes */}
        {doc.notes && (
          <div>
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Coach Notes</p>
            <p className="text-xs text-ink-2 leading-relaxed italic">"{doc.notes}"</p>
          </div>
        )}

        {/* Linked entities */}
        {(doc.linkedPlayers?.length > 0 || doc.linkedTeams?.length > 0 || doc.linkedFixtures?.length > 0) && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Linked Entities</p>
            {doc.linkedPlayers?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.linkedPlayers.map(p => (
                  <span key={p.id ?? p.name} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                    👤 {p.name}
                  </span>
                ))}
              </div>
            )}
            {doc.linkedTeams?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.linkedTeams.map(t => (
                  <span key={t} className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                    🏉 {t}
                  </span>
                ))}
              </div>
            )}
            {doc.linkedFixtures?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.linkedFixtures.map(f => (
                  <span key={f} className="text-[10px] bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded">
                    📅 {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-border-subtle space-y-2">
        {doc.processingStatus !== 'added_to_knowledge_base' && (
          <button
            type="button"
            onClick={() => fire(() => onAction('dna', doc.id), 'Added to Coach DNA')}
            className="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span>🧬</span> Add to Coach DNA
          </button>
        )}

        {doc.processingStatus !== 'added_to_knowledge_base' && (
          <button
            type="button"
            onClick={() => fire(() => onAction('club', doc.id), 'Added to Club Knowledge')}
            className="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span>🏛️</span> Add to Club Knowledge
          </button>
        )}

        {doc.processingStatus === 'added_to_knowledge_base' && (
          <div className="text-center py-2">
            <span className="text-[11px] text-green-600 dark:text-green-400 font-semibold">✓ In Knowledge Base</span>
            <p className="text-[10px] text-ink-3 mt-0.5">This document is part of the AI Brain</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => fire(() => onAction('review', doc.id), 'Flagged for review')}
          className="w-full text-xs font-medium py-2 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-2 border border-border-subtle transition-colors active:scale-95 flex items-center justify-center gap-1.5"
        >
          <span>🔍</span> Needs Review
        </button>
      </div>
    </div>
  )
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }) {
  if (!stats) return null
  const items = [
    { label: 'Total',          value: stats.total,           color: 'text-ink-1' },
    { label: 'In Knowledge Base', value: stats.inKnowledgeBase, color: 'text-green-500' },
    { label: 'Ready to Review',  value: stats.tagged,          color: 'text-purple-500' },
    { label: 'Pending',          value: stats.uploaded + stats.extracting, color: 'text-amber-500' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {items.map(k => (
        <div key={k.label} className="card px-4 py-3">
          <div className={`text-2xl font-bold ${k.color}`}>{k.value ?? 0}</div>
          <div className="text-[10px] font-medium text-ink-2 mt-0.5">{k.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = { category: 'All', ageGroup: 'All', team: 'All', season: 'All', fileType: 'All', status: 'All', q: '' }

export default function KnowledgeUploadPage() {
  const [filters,   setFilters]   = useState(DEFAULT_FILTERS)
  const [selected,  setSelected]  = useState(null)
  const [localDocs, setLocalDocs] = useState([])  // optimistically-added docs this session

  // Build query string from filters
  const params = Object.entries(filters)
    .filter(([, v]) => v && v !== 'All' && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const { data, loading, error, reload } = useKnowledgeLibrary(params)

  const allDocs = [
    ...localDocs,
    ...(data?.docs ?? []).filter(d => !localDocs.some(l => l.id === d.id)),
  ]

  function handleFilter(key, val) {
    if (key === '__clear') {
      setFilters(DEFAULT_FILTERS)
    } else {
      setFilters(f => ({ ...f, [key]: val }))
    }
  }

  function handleUpload(doc) {
    setLocalDocs(prev => [doc, ...prev])
    setSelected(doc)
    // After extraction delay, refresh to get processed doc from server
    setTimeout(reload, 2500)
  }

  async function handleAction(type, id) {
    try {
      let updated
      if (type === 'dna')    updated = (await api.knowledgeAddDNA(id))?.document
      if (type === 'club')   updated = (await api.knowledgeAddClub(id))?.document
      if (type === 'review') updated = (await api.knowledgeReview(id))?.document
      if (updated) {
        setLocalDocs(prev => prev.map(d => d.id === id ? updated : d))
        setSelected(prev => prev?.id === id ? updated : prev)
        reload()
      }
    } catch { /* optimistic — ignore errors, reload will sync */ }
  }

  return (
    <div className="p-5 lg:p-6 max-w-7xl mx-auto">

      <IntelligencePageHeader
        title="Knowledge Upload"
        subtitle="Teach the AI Brain from your coaching documents, plans, and notes"
        generatedAt={data ? new Date().toISOString() : null}
        isMock={data?.isMock}
        loading={loading}
        onRefresh={reload}
      />

      {/* Error banner */}
      {error && !data && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-400 mb-5">
          Intelligence service unavailable — showing preview library. ({error})
        </div>
      )}

      {/* Upload zone */}
      <UploadZone onUpload={handleUpload} />

      {/* Stats */}
      <StatsStrip stats={data?.stats} />

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

        {/* Left: library */}
        <div>
          {/* Search + filter bar */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <svg viewBox="0 0 16 16" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="search"
                value={filters.q}
                onChange={e => handleFilter('q', e.target.value)}
                placeholder="Search documents, themes, tags…"
                className="w-full text-sm bg-surface-2 border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
                aria-label="Search knowledge library"
              />
            </div>
          </div>

          <FilterBar filters={filters} onChange={handleFilter} />

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <IntelligenceSkeleton key={i} h="h-16" />)}
            </div>
          ) : allDocs.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-sm text-ink-2 font-medium mb-1">No documents found</p>
              <p className="text-xs text-ink-3">
                {Object.values(filters).some(v => v && v !== 'All' && v !== '')
                  ? 'Try clearing some filters, or upload your first document above.'
                  : 'Upload your first coaching document to get started.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-ink-3">{allDocs.length} document{allDocs.length !== 1 ? 's' : ''}</p>
              </div>
              {allDocs.map(doc => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  selected={selected?.id === doc.id}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        <div className="xl:sticky xl:top-6 xl:self-start relative">
          <DetailPanel doc={selected} onAction={handleAction} />
          {!loading && data?.isMock && (
            <div className="card p-3 mt-3 border border-purple-200 dark:border-purple-800/40">
              <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mb-1">Preview Mode</p>
              <p className="text-[11px] text-ink-3 leading-relaxed">
                Document extraction is mock. In production, content is processed by the AI Brain and feeds directly into club recommendations and the Decision Centre.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div className="text-[10px] text-ink-3 text-center mt-6 pb-2">
        Coach's Eye Intelligence · Knowledge Upload · Feature flag: <code className="font-mono">aiKnowledgeUpload</code>
      </div>
    </div>
  )
}
