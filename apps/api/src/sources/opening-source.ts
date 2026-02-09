import type { AnimeOpening } from '@anime-op-quiz/shared'
import { MockOpeningSource } from './mock-opening-source'
import { YouTubeOpeningSource } from './youtube-opening-source'

export interface OpeningSource {
  getAllOpenings: () => Promise<AnimeOpening[]>
  markAsListened: (openingId: string) => Promise<void>
  resetAllAsUnlistened: () => Promise<void>
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

  async markAsListened(openingId: string) {
    try {
      await this.primarySource.markAsListened(openingId)
    } catch {
      await this.fallbackSource.markAsListened(openingId)
    }
  }

  async resetAllAsUnlistened() {
    try {
      await this.primarySource.resetAllAsUnlistened()
    } catch {
      await this.fallbackSource.resetAllAsUnlistened()
    }
  }
}

const shouldUseYouTube = Boolean(process.env.YOUTUBE_PLAYLIST_ID?.trim())

export const openingSource: OpeningSource = new FallbackOpeningSource(
  shouldUseYouTube ? new YouTubeOpeningSource() : new MockOpeningSource(),
  new MockOpeningSource(),
)
