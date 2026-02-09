import { mockOpenings } from '../data/mock-openings'
import type { OpeningSource } from './opening-source'

export class MockOpeningSource implements OpeningSource {
  async getAllOpenings() {
    return mockOpenings
  }

  async markAsListened(_openingId: string) {}
}
