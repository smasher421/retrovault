import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const localGames = [
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

export const getUserGames = async (userId) => {
  if (!supabase) {
    return localGames.filter((game) => game.user_id === userId)
  }

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase fetch error:', error)
    return localGames.filter((game) => game.user_id === userId)
  }

  return data || []
}

export const createUserGame = async (payload) => {
  if (!supabase) {
    const newGame = {
      ...payload,
      id: Date.now(),
    }
    localGames.unshift(newGame)
    return newGame
  }

  const { data, error } = await supabase
    .from('games')
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export const updateUserGameStatus = async (id, userId, status) => {
  if (!supabase) {
    const game = localGames.find((item) => item.id === Number(id) && item.user_id === userId)
    if (!game) {
      throw new Error('Game not found')
    }

    game.status = status
    return game
  }

  const { data, error } = await supabase
    .from('games')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export const deleteUserGame = async (id, userId) => {
  if (!supabase) {
    const index = localGames.findIndex(
      (game) => game.id === Number(id) && game.user_id === userId,
    )

    if (index === -1) {
      throw new Error('Game not found')
    }

    localGames.splice(index, 1)
    return true
  }

  const { error } = await supabase
    .from('games')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return true
}
