export const GAME_STATUSES = ['Backlog', 'Playing', 'Paused', 'On Hold', 'Completed', '100% Completed', 'Abandoned', 'Endless', 'Waiting for Update']

// One vocabulary for personal editing, discovery filters, and API validation.
const select = (key, label, options) => ({ key, label, type: 'select', options })
const number = (key, label, max = 100000) => ({ key, label, type: 'number', max })
const text = (key, label, type = 'text') => ({ key, label, type })
const yesNo = (key, label) => select(key, label, ['Yes', 'No'])
export const TRACKING_GROUPS = [
  { name: 'Planning & progress', fields: [
    select('priority', 'Priority', ['High', 'Medium', 'Low', 'None']),
    select('backlogState', 'Backlog state', ['In Backlog', 'Cleared', 'Excluded']),
    select('intention', 'Play intention', ['Play Next', 'Someday', 'Not Interested']),
    select('completionType', 'Completion goal', ['Main Story', 'Main + Extras', '100%']),
    select('replay', 'Playthrough', ['First Playthrough', 'Replay', 'New Game+']),
    number('progress', 'Campaign progress (%)', 100), text('completedAt', 'Campaign completed on', 'date'),
    yesNo('installed', 'Installed locally (manual)'), yesNo('hidden', 'Hidden from library & public profile'),
    text('personalTags', 'Personal tags (comma separated)', 'list'), text('franchise', 'Franchise'),
  ] },
  { name: 'Time & commitment', fields: [
    number('playedHours', 'Total hours played (manual override)'), text('lastSession', 'Last played (manual override)', 'date'),
    number('mainHours', 'Main story estimate (hours)'), number('extraHours', 'Main + extras estimate (hours)'),
    number('completeHours', 'Completionist estimate (hours)'), text('estimateSource', 'Estimate source / link'),
    number('remainingHours', 'Estimated hours remaining'),
    select('session', 'Suitable session length', ['15 minutes', '30 minutes', '60+ minutes']),
    select('longTerm', 'Long term play', ['Endless', 'Replayable', 'Live Service', 'Finite']),
    select('commitment', 'Commitment', ['Low', 'Medium', 'High']),
  ] },
  { name: 'Mood & experience', fields: [
    select('mood', 'Mood', ['Relaxing', 'Intense', 'Immersive', 'Nostalgic', 'Scary']),
    select('atmosphere', 'Atmosphere', ['Dark', 'Cozy', 'Atmospheric', 'Colorful', 'Post-Apocalyptic']),
    select('setting', 'Setting', ['Medieval', 'Fantasy', 'Sci-Fi', 'Historical', 'Modern']),
    select('experience', 'Experience', ['Cinematic', 'Exploration', 'Action', 'Puzzle', 'Story']),
    select('nostalgia', 'Era feel', ['Retro', 'Classic', 'Modern']),
    select('visualStyle', 'Visual style', ['Pixel Art', 'Realistic', 'Stylized', 'Low Poly']),
    select('soundtrack', 'Soundtrack', ['Atmospheric', 'Orchestral', 'Electronic']),
    select('perspective', 'Perspective', ['First Person', 'Third Person', 'Isometric', 'Top-Down', 'Side-Scrolling']),
    select('world', 'World structure', ['Open World', 'Linear', 'Semi-Open World', 'Sandbox']),
    select('combat', 'Combat', ['Shooter', 'Melee', 'Turn-Based', 'Real-Time', 'Tactical']),
    select('story', 'Story focus', ['Story Rich', 'Narrative', 'Minimal Story']),
    select('difficulty', 'Difficulty', ['Casual', 'Moderate', 'Challenging', 'Hardcore']),
    select('pace', 'Pace', ['Relaxing', 'Slow-Paced', 'Fast-Paced']),
    select('replayability', 'Replayability', ['Low', 'Medium', 'High']),
    select('progression', 'Progression', ['RPG Progression', 'Skill Tree', 'Level-Based']),
  ] },
  { name: 'Features & compatibility', fields: [
    select('mode', 'Game mode', ['Singleplayer', 'Multiplayer', 'Co-op', 'PvP']),
    select('multiplayerType', 'Multiplayer type', ['Online', 'LAN', 'Local', 'Split-Screen']),
    select('coopType', 'Co-op type', ['Online Co-op', 'Couch Co-op']),
    select('modSupport', 'Mod support', ['Steam Workshop', 'Mod-Friendly', 'None']),
    select('controller', 'Controller support', ['Full', 'Partial', 'None']),
    select('deck', 'Steam Deck', ['Verified', 'Playable', 'Unsupported', 'Unknown']),
    yesNo('cloud', 'Steam Cloud'), yesNo('workshop', 'Steam Workshop'),
    select('remotePlay', 'Remote Play', ['Remote Play Together', 'Remote Play on TV', 'Remote Play on Phone', 'None']),
    select('vr', 'VR', ['VR Only', 'VR Supported', 'Non-VR']),
    yesNo('offline', 'Offline friendly'), yesNo('hdr', 'HDR'), yesNo('ultrawide', 'Ultrawide'),
    select('resolution', 'Resolution', ['1080p', '1440p', '4K']), number('storageGb', 'Installation size (GB)'),
    yesNo('launcher', 'Third party launcher required'),
    text('languages', 'Supported languages (comma separated)', 'list'),
    text('subtitles', 'Subtitle languages (comma separated)', 'list'),
    text('interfaceLanguages', 'Interface languages (comma separated)', 'list'),
  ] },
]
export const TRACKING_FIELDS = TRACKING_GROUPS.flatMap((group) => group.fields)

export function validateTracking(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tracking must be an object.')
  const result = {}
  for (const [key, value] of Object.entries(input)) {
    const field = TRACKING_FIELDS.find((item) => item.key === key)
    if (!field) throw new Error(`Unsupported tracking field: ${key}`)
    if (value === '' || value === null) continue
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > field.max) throw new Error(`${field.label}: enter a number between 0 and ${field.max}.`)
    } else if (field.type === 'list') {
      if (!Array.isArray(value) || value.length > 40 || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 80)) throw new Error(`${field.label}: use up to 40 short labels.`)
    } else if (typeof value !== 'string' || value.length > 200 || (field.options && !field.options.includes(value))) throw new Error(`Invalid ${field.label.toLowerCase()}.`)
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error('Enter a valid completion date.')
    result[key] = field.type === 'list' ? [...new Set(value.map((item) => item.trim()))] : typeof value === 'string' ? value.trim() : value
  }
  return result
}
