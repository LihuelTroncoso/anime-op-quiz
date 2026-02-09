export interface AnimeOpening {
  id: string
  animeTitle: string
  openingTitle: string
  audioUrl: string
  listened: boolean
}

export interface QuizOption {
  id: string
  title: string
}

export interface QuizRound {
  openingId: string
  audioUrl: string
  options: QuizOption[]
  correctOpeningTitle: string
}
