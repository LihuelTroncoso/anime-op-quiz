import type { AnimeOpening } from '@anime-op-quiz/shared'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mockOpenings } from './mock-openings'

export interface OpeningSource {
  getAllOpenings: () => Promise<AnimeOpening[]>
}

export class MockOpeningSource implements OpeningSource {
  async getAllOpenings() {
    return mockOpenings
  }
}

interface YouTubePlaylistItemsResponse {
  nextPageToken?: string
  items: YouTubePlaylistItem[]
}

interface YouTubePlaylistItem {
  snippet: {
    title: string
    videoOwnerChannelTitle?: string
    resourceId?: {
      videoId?: string
    }
  }
}

interface CachedOpeningRow {
  id: string
  tittle: string
  videoId: string
  animeTitle: string
}

const readEnv = (key: string) => process.env[key]?.trim()

const csvPath = () =>
  readEnv('YOUTUBE_CACHE_CSV')
    ? resolve(readEnv('YOUTUBE_CACHE_CSV') as string)
    : resolve(process.cwd(), 'data', 'openings.csv')

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

const parseCsvLine = (line: string) => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

const rowsToOpenings = (rows: CachedOpeningRow[]) =>
  rows.map((row) => ({
    id: row.id,
    animeTitle: row.animeTitle,
    openingTitle: row.tittle,
    audioUrl: `https://www.youtube.com/embed/${row.videoId}`,
  }))

const readCache = async () => {
  const path = csvPath()
  const content = await readFile(path, 'utf-8')
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) {
    return []
  }

  const headers = parseCsvLine(lines[0])
  const idIndex = headers.indexOf('id')
  const tittleIndex = headers.indexOf('tittle')
  const videoIdIndex = headers.indexOf('videoId')
  const animeTitleIndex = headers.indexOf('animeTitle')

  if (idIndex < 0 || tittleIndex < 0 || videoIdIndex < 0) {
    throw new Error('Invalid CSV header. Expected id,tittle,videoId.')
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return {
      id: values[idIndex] ?? '',
      tittle: values[tittleIndex] ?? '',
      videoId: values[videoIdIndex] ?? '',
      animeTitle:
        animeTitleIndex >= 0 && values[animeTitleIndex]
          ? values[animeTitleIndex]
          : deriveAnimeTitle(values[tittleIndex] ?? '', 'Unknown Channel'),
    }
  })
}

const writeCache = async (rows: CachedOpeningRow[]) => {
  const path = csvPath()
  await mkdir(dirname(path), { recursive: true })

  const header = ['id', 'tittle', 'videoId', 'animeTitle'].join(',')
  const body = rows
    .map((row) => [row.id, row.tittle, row.videoId, row.animeTitle].map(csvEscape).join(','))
    .join('\n')

  await writeFile(path, `${header}\n${body}\n`, 'utf-8')
}

const deriveAnimeTitle = (videoTitle: string, fallbackChannel: string) => {
  const separators = [' - ', ' | ', ' / ', ' — ']
  for (const separator of separators) {
    if (videoTitle.includes(separator)) {
      return videoTitle.split(separator)[0].trim()
    }
  }

  const opPattern = /^(.+?)\s+(OP|Opening)\s*\d*$/i
  const opMatch = videoTitle.match(opPattern)
  if (opMatch) {
    return opMatch[1].trim()
  }

  return fallbackChannel
}

export class YouTubeOpeningSource implements OpeningSource {
  private memoryCache: AnimeOpening[] | null = null

  async getAllOpenings() {
    if (this.memoryCache) {
      return this.memoryCache
    }

    try {
      const cachedRows = await readCache()
      if (cachedRows.length > 0) {
        this.memoryCache = rowsToOpenings(cachedRows)
        return this.memoryCache
      }
    } catch {
      // Cache not present yet or malformed: we'll rebuild it from YouTube.
    }

    const fetched = await this.fetchAndCacheOpenings()
    this.memoryCache = fetched
    return fetched
  }

  private async fetchAndCacheOpenings() {
    const playlistId = readEnv('YOUTUBE_PLAYLIST_ID')
    const apiKey = readEnv('YOUTUBE_API_KEY')

    if (!playlistId) {
      throw new Error('Missing YOUTUBE_PLAYLIST_ID.')
    }

    if (!apiKey) {
      throw new Error('Missing YOUTUBE_API_KEY.')
    }

    const collectedItems: YouTubePlaylistItem[] = []
    let nextPageToken: string | undefined

    do {
      const query = new URLSearchParams({
        part: 'snippet',
        maxResults: '50',
        playlistId: playlistId,
        key: apiKey,
      })

      if (nextPageToken) {
        query.set('pageToken', nextPageToken)
      }

      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${query.toString()}`)

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`YouTube playlist request failed (${response.status}): ${body}`)
      }

      const payload = (await response.json()) as YouTubePlaylistItemsResponse
      collectedItems.push(...payload.items)
      nextPageToken = payload.nextPageToken
    } while (nextPageToken)

    const rows: CachedOpeningRow[] = collectedItems
      .map((item) => item.snippet)
      .filter((snippet) => snippet.title !== 'Deleted video' && snippet.title !== 'Private video')
      .map((snippet) => {
        const videoId = snippet.resourceId?.videoId
        if (!videoId) {
          return null
        }

        const channel = snippet.videoOwnerChannelTitle ?? 'Unknown Channel'

        return {
          id: videoId,
          tittle: snippet.title,
          videoId,
          animeTitle: deriveAnimeTitle(snippet.title, channel),
        }
      })
      .filter((row): row is CachedOpeningRow => row !== null)

    if (rows.length === 0) {
      throw new Error('YouTube playlist has no playable items.')
    }

    await writeCache(rows)

    return rowsToOpenings(rows)
  }
}

class FallbackOpeningSource implements OpeningSource {
  constructor(
    private readonly primarySource: OpeningSource,
    private readonly fallbackSource: OpeningSource,
  ) {}

  async getAllOpenings() {
    try {
      return await this.primarySource.getAllOpenings()
    } catch (error) {
      console.warn('Falling back to mock openings source:', error)
      return this.fallbackSource.getAllOpenings()
    }
  }
}

const shouldUseYouTube = Boolean(readEnv('YOUTUBE_PLAYLIST_ID'))

export const openingSource: OpeningSource = new FallbackOpeningSource(
  shouldUseYouTube ? new YouTubeOpeningSource() : new MockOpeningSource(),
  new MockOpeningSource(),
)
