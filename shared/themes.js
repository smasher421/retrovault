// Shared by the client and API so saved skins and validation stay in step.
export const THEMES = [
  { id: 'vgui-olive', name: 'VGUI Olive', game: 'Steam · 2004', mark: '▣', colors: ['#30372b', '#4c5844', '#58634e', '#2c3425', '#e5e8dc', '#c0c8b5', '#dfd58b', '#70642a'] },
  { id: 'source-obsidian', name: 'Source Obsidian', game: 'Source Engine', mark: 'S', colors: ['#111416', '#202528', '#2a3235', '#485357', '#e3e4db', '#a4adaf', '#d98a62', '#503225'] },
  { id: 'hev-hazard', name: 'HEV Hazard', game: 'Half-Life', mark: 'λ', colors: ['#211a12', '#30261a', '#403221', '#72552e', '#fff0d5', '#c1a77d', '#ffb642', '#563b16'] },
  { id: 'lan-party-98', name: 'LAN Party 98', game: 'The LAN era', mark: '98', colors: ['#15202a', '#243544', '#30475b', '#45637b', '#e3e4db', '#9cb8c8', '#77e2cc', '#174d4b'] },
  { id: 'aperture', name: 'Aperture After Hours', game: 'Portal · test chambers', mark: '◉', colors: ['#101d27', '#1b2d3a', '#294252', '#466578', '#edf6fa', '#aac2d1', '#71d4ff', '#224c68'] },
  { id: 'tf2-red', name: 'RED Industries', game: 'Team Fortress 2 · RED', mark: 'R', colors: ['#251b19', '#372723', '#49332c', '#755047', '#f6e8d1', '#c8ac92', '#ed9877', '#63382e'] },
  { id: 'tf2-blu', name: 'BLU Engineering', game: 'Team Fortress 2 · BLU', mark: 'B', colors: ['#192329', '#253640', '#334852', '#536f79', '#e8eee7', '#afc3c7', '#91cce1', '#315567'] },
  { id: 'left4dead', name: 'Safe Room', game: 'Left 4 Dead', mark: '+', colors: ['#151b14', '#242e21', '#303d2b', '#526349', '#e8ecd9', '#b0bba0', '#c0dd79', '#3c502a'] },
  { id: 'counter-strike', name: 'Dust & Steel', game: 'Counter-Strike', mark: 'CS', colors: ['#211f19', '#302d24', '#403c2e', '#69614a', '#f2eddd', '#bdb59b', '#e8c976', '#514527'] },
  { id: 'dota2', name: 'Ancient Ember', game: 'Dota 2', mark: 'D', colors: ['#1c1418', '#2d2026', '#3c2b31', '#64444c', '#f4e4dd', '#c2a6a4', '#f39780', '#622f2d'] },
]

export const THEME_VARIABLES = ['--bg', '--panel', '--panel-hi', '--border', '--text', '--muted', '--accent', '--accent-bg']
