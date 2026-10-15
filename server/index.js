import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import {
  createUserGame,
  deleteUserGame,
  getUserGames,
  localGames,
  supabase,
  updateUserGameStatus,
} from './supabase.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const STATUS_OPTIONS = ['Backlog', 'Playing', 'Completed', '100% Completed', 'Abandoned']

let games = [...localGames]
  {
    id: 1,
    user_id: 'demo-user',
    title: 'Super Mario World',
    platform: 'SNES',
    genre: 'Platformer',
    year: 1990,
    status: 'Completed',
    notes: 'A perfect 16-bit classic with outstanding level design.',
    cover_image: '',
  },
  {
    id: 2,
    user_id: 'demo-user',
    title: 'The Legend of Zelda: A Link to the Past',
    platform: 'SNES',
    genre: 'Action RPG',
    year: 1991,
    status: 'Playing',
    notes: 'Still working through the dungeons and side quests.',
    cover_image: '',
  },
  {
    id: 3,
    user_id: 'demo-user',
    title: 'Sonic the Hedgehog 2',
    platform: 'Genesis',
    genre: 'Platformer',
    year: 1992,
    status: 'Backlog',
    notes: 'Need to give the spin dash routes another pass.',
    cover_image: '',
  },
  {
    id: 4,
    user_id: 'demo-user',
    title: 'Final Fantasy VII',
    platform: 'PlayStation',
    genre: 'RPG',
    year: 1997,
    status: '100% Completed',
    notes: 'One of the best JRPGs ever made, finished with all side content.',
    cover_image: '',
  },
]

const getUserId = (req) => req.headers['x-user-id'] || 'demo-user'

const inferPlatform = (platform) => platform?.trim() || 'Unknown'

const fetchRawgMetadata = async (title) => {
  const apiKey = process.env.RAWG_API_KEY

  if (!apiKey) {
    return null
  }

  const response = await fetch(
    `https://api.rawg.io/api/games?search=${encodeURIComponent(title)}&key=${apiKey}`,
  )

  if (!response.ok) {
    return null
  }

  const data = await response.json()
  const game = data.results?.[0]

  if (!game) {
    return null
  }

  return {
    title: game.name,
    platform: game.platforms?.[0]?.platform?.name || 'Unknown',
    genre: game.genres?.[0]?.name || 'Unknown',
    year: Number(game.released?.slice(0, 4) || new Date().getFullYear()),
    cover_image: game.background_image || '',
  }
}

app.get('/api/games', async (req, res) => {
  const userId = getUserId(req)

  if (supabase) {
    const data = await getUserGames(userId)
    return res.json(data)
  }

  const filtered = games.filter((game) => game.user_id === userId)
  return res.json(filtered)
})

app.get('/api/metadata', async (req, res) => {
  const { title } = req.query

  if (!title) {
    return res.status(400).json({ message: 'Title is required' })
  }

  const metadata = await fetchRawgMetadata(title)

  if (!metadata) {
    return res.json({
      title: String(title),
      platform: 'Unknown',
      genre: 'Unknown',
      year: new Date().getFullYear(),
      cover_image: '',
    })
  }

  return res.json(metadata)
})

app.post('/api/games', async (req, res) => {
  const { title, platform, genre, year, status, notes, cover_image } = req.body
  const userId = getUserId(req)

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'Title is required' })
  }

  if (status && !STATUS_OPTIONS.includes(status)) {
    return res.status(400).json({ message: 'Invalid game status' })
  }

  const payload = {
    user_id: userId,
    title: title.trim(),
    platform: inferPlatform(platform),
    genre: genre || 'Unknown',
    year: Number(year) || new Date().getFullYear(),
    status: status || 'Backlog',
    notes: notes || '',
    cover_image: cover_image || '',
  }

  if (supabase) {
    try {
      const created = await createUserGame(payload)
      return res.status(201).json(created)
    } catch (error) {
      return res.status(500).json({ message: error.message || 'Failed to save game' })
    }
  }

  const newGame = {
    id: Date.now(),
    ...payload,
  }

  games = [newGame, ...games]
  return res.status(201).json(newGame)
})

app.patch('/api/games/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  const userId = getUserId(req)

  if (status && !STATUS_OPTIONS.includes(status)) {
    return res.status(400).json({ message: 'Invalid game status' })
  }

  if (supabase) {
    try {
      const updated = await updateUserGameStatus(id, userId, status)
      return res.json(updated)
    } catch (error) {
      return res.status(404).json({ message: error.message || 'Game not found' })
    }
  }

  const gameIndex = games.findIndex(
    (game) => game.id === Number(id) && game.user_id === userId,
  )

  if (gameIndex === -1) {
    return res.status(404).json({ message: 'Game not found' })
  }

  games[gameIndex] = {
    ...games[gameIndex],
    ...(status ? { status } : {}),
  }

  return res.json(games[gameIndex])
})

app.delete('/api/games/:id', async (req, res) => {
  const { id } = req.params
  const userId = getUserId(req)

  if (supabase) {
    try {
      await deleteUserGame(id, userId)
      return res.status(204).send()
    } catch (error) {
      return res.status(404).json({ message: error.message || 'Game not found' })
    }
  }

  const itemExists = games.some((game) => game.id === Number(id) && game.user_id === userId)

  if (!itemExists) {
    return res.status(404).json({ message: 'Game not found' })
  }

  games = games.filter((game) => !(game.id === Number(id) && game.user_id === userId))
  return res.status(204).send()
})

app.listen(PORT, () => {
  console.log(`RetroVault API running on http://localhost:${PORT}`)
})
