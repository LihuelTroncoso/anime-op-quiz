import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuizOption } from '@anime-op-quiz/shared'
import './App.css'

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error'
type RoundDurationSeconds = 5 | 10 | 20
const OPENING_START_SECONDS = 50
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

type RoundPayload = {
  openingId: string
  audioUrl: string
  options: QuizOption[]
  roundDurationSeconds: RoundDurationSeconds
  roundEndsAt: number
}

type ScoreEntry = {
  playerId: string
  name: string
  score: number
  correct: number
  attempted: number
}

type RoomStateResponse = {
  round: RoundPayload | null
  hasAnswered: boolean
  roundResolved: boolean
  roundWinnerName: string | null
  canStartNextRound: boolean
  nextRoundOwnerName: string | null
  scoreboard: ScoreEntry[]
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function App() {
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [joinName, setJoinName] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [joinedName, setJoinedName] = useState<string>('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const [round, setRound] = useState<RoundPayload | null>(null)
  const [roundDurationSeconds, setRoundDurationSeconds] = useState<RoundDurationSeconds>(10)
  const [scoreboard, setScoreboard] = useState<ScoreEntry[]>([])
  const [answerInput, setAnswerInput] = useState('')
  const [hasAnswered, setHasAnswered] = useState(false)
  const [roundResolved, setRoundResolved] = useState(true)
  const [roundWinnerName, setRoundWinnerName] = useState<string | null>(null)
  const [canStartNextRound, setCanStartNextRound] = useState(false)
  const [nextRoundOwnerName, setNextRoundOwnerName] = useState<string | null>(null)
  const [isCorrectAnswer, setIsCorrectAnswer] = useState<boolean | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const [youtubePlaying, setYoutubePlaying] = useState(false)
  const [youtubeVolume, setYoutubeVolume] = useState(10)
  const [youtubeReady, setYoutubeReady] = useState(false)
  const [nativePlaying, setNativePlaying] = useState(false)
  const [nativeVolume, setNativeVolume] = useState(10)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null)
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null)

  const isCorrect = useMemo(() => isCorrectAnswer, [isCorrectAnswer])
  const isJoined = Boolean(playerId)
  const isYouTubeRound = Boolean(round?.audioUrl.includes('youtube.com/embed/'))
  const remainingRoundSeconds = round ? Math.max(0, Math.ceil((round.roundEndsAt - nowMs) / 1000)) : 0
  const isRoundTimeUp = Boolean(round) && remainingRoundSeconds <= 0
  const allTitles = useMemo(() => (round ? round.options.map((option) => option.title) : []), [round])

  const matchingTitles = useMemo(() => {
    const query = normalizeText(answerInput)
    if (!query) {
      return allTitles.slice(0, 10)
    }

    return allTitles.filter((title) => normalizeText(title).includes(query)).slice(0, 20)
  }, [allTitles, answerInput])

  const youtubeVideoId = useMemo(() => {
    if (!round?.audioUrl || !isYouTubeRound) {
      return null
    }

    const splitToken = '/embed/'
    const idx = round.audioUrl.indexOf(splitToken)
    if (idx < 0) {
      return null
    }

    const idSection = round.audioUrl.slice(idx + splitToken.length)
    const videoId = idSection.split('?')[0]
    return videoId || null
  }, [round?.audioUrl, isYouTubeRound])

  const youtubeAudioPlayerUrl = useMemo(() => {
    if (!youtubeVideoId) {
      return null
    }

    return `https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1&controls=0&modestbranding=1&rel=0&playsinline=1&start=${OPENING_START_SECONDS}`
  }, [youtubeVideoId])

  const youtubeRevealUrl = useMemo(() => {
    if (!youtubeVideoId) {
      return null
    }

    return `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&start=${OPENING_START_SECONDS}`
  }, [youtubeVideoId])

  const sendYouTubeCommand = (func: string, args: Array<number | boolean> = []) => {
    youtubeFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args,
      }),
      '*',
    )
  }

  const applyYouTubeVolume = () => {
    if (!youtubeReady) {
      return
    }

    if (youtubeVolume === 0) {
      sendYouTubeCommand('mute')
      return
    }

    sendYouTubeCommand('unMute')
    sendYouTubeCommand('setVolume', [youtubeVolume])
  }

  const resetRoundUi = () => {
    nativeAudioRef.current?.pause()
    sendYouTubeCommand('pauseVideo')
    setAnswerInput('')
    setValidationMessage(null)
    setIsCorrectAnswer(null)
    setHasAnswered(false)
    setYoutubePlaying(false)
    setYoutubeReady(false)
    setNativePlaying(false)
  }

  const applyRoomState = (state: RoomStateResponse) => {
    setScoreboard(state.scoreboard)
    setRoundResolved(state.roundResolved)
    setRoundWinnerName(state.roundWinnerName)
    setCanStartNextRound(state.canStartNextRound)
    setNextRoundOwnerName(state.nextRoundOwnerName)

    if (!state.round) {
      setRound(null)
      return
    }

    if (!round || round.openingId !== state.round.openingId) {
      resetRoundUi()
    }

    setRound(state.round)
    setHasAnswered(state.hasAnswered)
  }

  const loadRoomState = async (requestedPlayerId: string) => {
    const response = await fetch(`${apiUrl('/room/state')}?playerId=${encodeURIComponent(requestedPlayerId)}`)
    if (!response.ok) {
      throw new Error('Unable to load room state')
    }

    const payload = (await response.json()) as RoomStateResponse
    applyRoomState(payload)
  }

  const joinRoom = async () => {
    setJoinError(null)
    setStatus('loading')

    try {
      const response = await fetch(apiUrl('/room/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: joinName, password: joinPassword }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to join room')
      }

      const payload = (await response.json()) as { playerId: string; name: string }
      setPlayerId(payload.playerId)
      setJoinedName(payload.name)
      await loadRoomState(payload.playerId)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setJoinError(error instanceof Error ? error.message : 'Unable to join room')
    }
  }

  const startNextRound = async () => {
    if (!playerId) {
      return
    }

    setStatus('loading')

    try {
      const response = await fetch(apiUrl('/room/next-round'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, roundDurationSeconds }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to start next round')
      }

      await loadRoomState(playerId)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setValidationMessage(error instanceof Error ? error.message : 'Unable to start next round')
    }
  }

  const toggleYouTubePlayback = () => {
    if (!round || roundResolved || isRoundTimeUp) {
      return
    }

    if (!youtubePlaying) {
      applyYouTubeVolume()
      sendYouTubeCommand('playVideo')
      setYoutubePlaying(true)
      return
    }

    sendYouTubeCommand('pauseVideo')
    setYoutubePlaying(false)
  }

  const toggleNativePlayback = async () => {
    const element = nativeAudioRef.current
    if (!element || !round || roundResolved || isRoundTimeUp) {
      return
    }

    if (nativePlaying) {
      element.pause()
      setNativePlaying(false)
      return
    }

    if (element.currentTime < OPENING_START_SECONDS && Number.isFinite(element.duration)) {
      element.currentTime = Math.min(OPENING_START_SECONDS, element.duration)
    }

    await element.play()
    setNativePlaying(true)
  }

  const submitAnswer = async () => {
    if (!playerId || !round || hasAnswered) {
      return
    }

    const selectedTitle = allTitles.find((title) => title === answerInput.trim())
    if (!selectedTitle) {
      setValidationMessage('Pick an exact title from the matching list.')
      return
    }

    setStatus('loading')

    try {
      const response = await fetch(apiUrl('/room/answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, answerTitle: selectedTitle }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to submit answer')
      }

      const payload = (await response.json()) as {
        correct: boolean
        correctOpeningTitle: string
        scoreboard: ScoreEntry[]
      }

      setIsCorrectAnswer(payload.correct)
      setHasAnswered(true)
      setScoreboard(payload.scoreboard)
      setValidationMessage(
        payload.correct ? 'Correct! Points added to your score.' : `Wrong. Correct answer: ${payload.correctOpeningTitle}`,
      )
      sendYouTubeCommand('pauseVideo')
      setYoutubePlaying(false)
      setNativePlaying(false)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setValidationMessage(error instanceof Error ? error.message : 'Unable to submit answer')
    }
  }

  const resetScores = async () => {
    if (!playerId) {
      return
    }

    setStatus('loading')

    try {
      const response = await fetch(apiUrl('/room/reset-scores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to reset scores')
      }

      const payload = (await response.json()) as { scoreboard: ScoreEntry[] }
      setScoreboard(payload.scoreboard)
      setValidationMessage('Scores reset to 0 for all players.')
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setValidationMessage(error instanceof Error ? error.message : 'Unable to reset scores')
    }
  }

  const leaveSession = async () => {
    if (!playerId) {
      return
    }

    setStatus('loading')

    try {
      const response = await fetch(apiUrl('/room/leave'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to leave session')
      }

      setRound(null)
      setScoreboard([])
      setPlayerId(null)
      setJoinedName('')
      setRoundResolved(true)
      setRoundWinnerName(null)
      setCanStartNextRound(false)
      setNextRoundOwnerName(null)
      setAnswerInput('')
      setValidationMessage(null)
      setStatus('idle')
      setJoinPassword('')
      setJoinError(null)
    } catch (error) {
      setStatus('error')
      setValidationMessage(error instanceof Error ? error.message : 'Unable to leave session')
    }
  }

  useEffect(() => {
    if (!isYouTubeRound || !youtubeReady) {
      return
    }

    const timer = setTimeout(() => {
      applyYouTubeVolume()
    }, 200)

    return () => clearTimeout(timer)
  }, [isYouTubeRound, youtubeVolume, youtubeAudioPlayerUrl, youtubeReady])

  useEffect(() => {
    if (isYouTubeRound || !nativeAudioRef.current) {
      return
    }

    nativeAudioRef.current.volume = nativeVolume / 100
  }, [isYouTubeRound, nativeVolume, round?.audioUrl])

  useEffect(() => {
    if (!round || roundResolved) {
      return
    }

    const tick = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => clearInterval(tick)
  }, [round?.openingId, roundResolved])

  useEffect(() => {
    if (!isRoundTimeUp) {
      return
    }

    nativeAudioRef.current?.pause()
    sendYouTubeCommand('pauseVideo')
    setNativePlaying(false)
    setYoutubePlaying(false)
  }, [isRoundTimeUp])

  useEffect(() => {
    if (!playerId) {
      return
    }

    const poll = setInterval(() => {
      void loadRoomState(playerId).catch(() => {
        // polling failures are non-blocking
      })
    }, 1000)

    return () => clearInterval(poll)
  }, [playerId, round?.openingId])

  if (!isJoined) {
    return (
      <main className="app-shell">
        <section className="quiz-card room-card">
          <p className="eyebrow">Anime Opening Quiz</p>
          <h1>Join Main Room</h1>
          <div className="answer-row">
            <input
              className="search-input"
              placeholder="Your name"
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
            />
            <input
              className="search-input"
              placeholder="Room password"
              type="password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
            />
            <button onClick={joinRoom} disabled={status === 'loading'}>
              {status === 'loading' ? 'Joining...' : 'Join Room'}
            </button>
          </div>
          {joinError && <p className="error-message">{joinError}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="quiz-card">
        <p className="eyebrow">Anime Opening Quiz</p>
        <h1>Room Battle</h1>
        <p className="muted selector-help">You are playing as `{joinedName}`</p>

        <div className="player-wrap">
          {round ? (
            isYouTubeRound ? (
              <>
                <div className="audio-controls">
                  <label className="timer-wrap" htmlFor="round-duration-youtube">
                    Round timer
                    <select
                      id="round-duration-youtube"
                      value={String(roundDurationSeconds)}
                      onChange={(event) => setRoundDurationSeconds(Number(event.target.value) as RoundDurationSeconds)}
                      disabled={status === 'loading' || !canStartNextRound}
                    >
                      <option value="5">5s</option>
                      <option value="10">10s</option>
                      <option value="20">20s</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={startNextRound}
                    disabled={status === 'loading' || !canStartNextRound}
                  >
                    {status === 'loading' ? 'Loading...' : 'Next Opening'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleYouTubePlayback}
                    disabled={status !== 'ready' || roundResolved || isRoundTimeUp}
                  >
                    {youtubePlaying ? 'Pause' : 'Play'}
                  </button>
                  {!hasAnswered ? (
                    <label className="volume-wrap" htmlFor="yt-volume">
                      Volume
                      <input
                        id="yt-volume"
                        type="range"
                        min={0}
                        max={100}
                        value={youtubeVolume}
                        onChange={(event) => setYoutubeVolume(Number(event.target.value))}
                        disabled={status !== 'ready'}
                      />
                    </label>
                  ) : null}
                </div>
                {!roundResolved && youtubeAudioPlayerUrl && (
                  <iframe
                    ref={youtubeFrameRef}
                    className="youtube-audio-frame"
                    src={youtubeAudioPlayerUrl}
                    title="Hidden YouTube audio player"
                    allow="autoplay; encrypted-media"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => setYoutubeReady(true)}
                  />
                )}
              </>
            ) : (
              <>
                <div className="audio-controls">
                  <label className="timer-wrap" htmlFor="round-duration-native">
                    Round timer
                    <select
                      id="round-duration-native"
                      value={String(roundDurationSeconds)}
                      onChange={(event) => setRoundDurationSeconds(Number(event.target.value) as RoundDurationSeconds)}
                      disabled={status === 'loading' || !canStartNextRound}
                    >
                      <option value="5">5s</option>
                      <option value="10">10s</option>
                      <option value="20">20s</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={startNextRound}
                    disabled={status === 'loading' || !canStartNextRound}
                  >
                    {status === 'loading' ? 'Loading...' : 'Next Opening'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleNativePlayback()}
                    disabled={status !== 'ready' || roundResolved || isRoundTimeUp}
                  >
                    {nativePlaying ? 'Pause' : 'Play'}
                  </button>
                  <label className="volume-wrap" htmlFor="native-volume">
                    Volume
                    <input
                      id="native-volume"
                      type="range"
                      min={0}
                      max={100}
                      value={nativeVolume}
                      onChange={(event) => setNativeVolume(Number(event.target.value))}
                      disabled={status !== 'ready'}
                    />
                  </label>
                </div>
                <audio
                  ref={nativeAudioRef}
                  src={round.audioUrl}
                  preload="none"
                  className="native-audio-hidden"
                  onLoadedMetadata={(event) => {
                    const element = event.currentTarget
                    element.currentTime = Math.min(OPENING_START_SECONDS, element.duration)
                  }}
                  onEnded={() => setNativePlaying(false)}
                >
                  Your browser does not support the audio element.
                </audio>
              </>
            )
          ) : (
            <div className="audio-controls">
              <label className="timer-wrap" htmlFor="round-duration-start">
                Round timer
                <select
                  id="round-duration-start"
                  value={String(roundDurationSeconds)}
                  onChange={(event) => setRoundDurationSeconds(Number(event.target.value) as RoundDurationSeconds)}
                  disabled={status === 'loading' || !canStartNextRound}
                >
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                  <option value="20">20s</option>
                </select>
              </label>
              <button
                type="button"
                onClick={startNextRound}
                disabled={status === 'loading' || !canStartNextRound}
              >
                {status === 'loading' ? 'Loading...' : 'Start First Opening'}
              </button>
            </div>
          )}
          {!canStartNextRound && nextRoundOwnerName && (
            <p className="muted selector-help">{nextRoundOwnerName} can start the next opening.</p>
          )}
          {round && !roundResolved && <p className="muted selector-help">Time left: {remainingRoundSeconds}s</p>}
        </div>

        <h2>Answer</h2>
        <div className="answer-row">
          <input
            className="search-input"
            type="text"
            value={answerInput}
            onChange={(event) => {
              setAnswerInput(event.target.value)
              setValidationMessage(null)
            }}
            placeholder="Type your guess"
            disabled={status !== 'ready' || hasAnswered || !round || roundResolved || isRoundTimeUp}
          />
          <button
            onClick={submitAnswer}
            disabled={status !== 'ready' || hasAnswered || !round || roundResolved || isRoundTimeUp}
          >
            Submit Answer
          </button>
        </div>

        {round && !hasAnswered && !roundResolved && !isRoundTimeUp && (
          <div className="title-matches" role="listbox" aria-label="Matching titles">
            {matchingTitles.map((title) => (
              <button
                key={title}
                type="button"
                className={`match-item ${answerInput.trim() === title ? 'selected' : ''}`}
                onClick={() => {
                  setAnswerInput(title)
                  setValidationMessage(null)
                }}
              >
                {title}
              </button>
            ))}
            {matchingTitles.length === 0 && <p className="muted selector-help">No matching titles in CSV cache.</p>}
          </div>
        )}

        {round && !roundResolved && isRoundTimeUp && <p className="muted selector-help">Time is up for this opening.</p>}

        {round && roundResolved && (
          <p className="muted selector-help">
            {roundWinnerName
              ? `${roundWinnerName} solved this opening and now chooses the next one.`
              : 'No one solved this opening. Previous owner keeps the next pick.'}
          </p>
        )}

        {hasAnswered && isYouTubeRound && youtubeRevealUrl && (
          <iframe
            className="youtube-player"
            src={youtubeRevealUrl}
            title="YouTube opening video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}

        {validationMessage && <p className="muted selector-help">{validationMessage}</p>}
        {isCorrect !== null && (
          <p className={`result ${isCorrect ? 'pass' : 'fail'}`}>
            {isCorrect ? 'Correct! Nice ear.' : 'Wrong answer this round.'}
          </p>
        )}

        <h2>Scoreboard</h2>
        <div className="answer-row">
          <button className="button-warning" onClick={resetScores} disabled={status === 'loading'}>
            Reset Scores
          </button>
          <button className="button-danger" onClick={leaveSession} disabled={status === 'loading'}>
            Leave Session
          </button>
        </div>
        <div className="title-matches" role="table" aria-label="Scoreboard">
          {scoreboard.map((entry, index) => (
            <div key={entry.playerId} className="match-item score-row">
              <span>
                #{index + 1} {entry.name}
              </span>
              <span>{entry.score} pts</span>
              <span>
                {entry.correct}/{entry.attempted}
              </span>
            </div>
          ))}
          {scoreboard.length === 0 && <p className="muted selector-help">No players in room.</p>}
        </div>
      </section>
    </main>
  )
}

export default App
