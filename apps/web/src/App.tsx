import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuizRound } from '@anime-op-quiz/shared'
import './App.css'

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error'
const OPENING_START_SECONDS = 50

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function App() {
  const [round, setRound] = useState<QuizRound | null>(null)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [answerInput, setAnswerInput] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState(3)
  const [isRoundResolved, setIsRoundResolved] = useState(false)
  const [isCorrectAnswer, setIsCorrectAnswer] = useState<boolean | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [youtubePlaying, setYoutubePlaying] = useState(false)
  const [youtubeVolume, setYoutubeVolume] = useState(10)
  const [youtubeReady, setYoutubeReady] = useState(false)
  const [nativePlaying, setNativePlaying] = useState(false)
  const [nativeVolume, setNativeVolume] = useState(10)
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null)
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null)

  const isCorrect = useMemo(() => isCorrectAnswer, [isCorrectAnswer])
  const hasAnswered = isCorrectAnswer !== null
  const allTitles = useMemo(() => (round ? round.options.map((option) => option.title) : []), [round])

  const matchingTitles = useMemo(() => {
    const query = normalizeText(answerInput)
    if (!query) {
      return allTitles.slice(0, 10)
    }

    return allTitles
      .filter((title) => normalizeText(title).includes(query))
      .slice(0, 20)
  }, [allTitles, answerInput])

  const isYouTubeRound = Boolean(round?.audioUrl.includes('youtube.com/embed/'))

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
    if (!videoId) {
      return null
    }

    return videoId
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

  const sendYouTubeCommand = (func: string, args: number[] = []) => {
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

  const toggleYouTubePlayback = () => {
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
    if (!element) {
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

  const validateCorrectAnswer = () => {
    if (!round || status !== 'ready' || isRoundResolved) {
      return
    }

    if (!answerInput.trim()) {
      setValidationMessage('Write an answer before validating.')
      return
    }

    const selectedTitle = allTitles.find((title) => title === answerInput.trim())
    if (!selectedTitle) {
      setValidationMessage('Pick an exact title from the matching list.')
      return
    }

    const hit = selectedTitle === round.correctOpeningTitle

    if (hit) {
      setIsCorrectAnswer(true)
      setIsRoundResolved(true)
      setValidationMessage('Correct! Great guess.')
      return
    }

    const nextAttempts = attemptsLeft - 1
    setAttemptsLeft(nextAttempts)
    setIsCorrectAnswer(false)

    if (nextAttempts <= 0) {
      setIsRoundResolved(true)
      setValidationMessage(`No attempts left. Correct answer: ${round.correctOpeningTitle}`)
      return
    }

    setValidationMessage(`Not quite. Attempts left: ${nextAttempts}.`)
  }

  const loadRandomOpening = async () => {
    nativeAudioRef.current?.pause()
    sendYouTubeCommand('pauseVideo')

    setStatus('loading')
    setAnswerInput('')
    setAttemptsLeft(3)
    setIsRoundResolved(false)
    setIsCorrectAnswer(null)
    setYoutubePlaying(false)
    setYoutubeReady(false)
    setNativePlaying(false)
    setValidationMessage(null)

    try {
      const response = await fetch('/api/openings/random')

      if (!response.ok) {
        throw new Error('Unable to fetch opening')
      }

      const payload = (await response.json()) as QuizRound
      setRound(payload)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    void loadRandomOpening()
  }, [])

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

  return (
    <main className="app-shell">
      <section className="quiz-card">
        <p className="eyebrow">Anime Opening Quiz</p>
        <h1>Guess the Anime From the OP</h1>
        <p className="muted selector-help">Pick one title from the suggestions. Answer must match the CSV title exactly.</p>

        <div className="player-wrap">
          {round ? (
            isYouTubeRound ? (
              <>
                <div className="audio-controls">
                  <button type="button" onClick={loadRandomOpening} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Loading...' : 'Get Random Opening'}
                  </button>
                  {!hasAnswered ? (
                    <button type="button" onClick={toggleYouTubePlayback} disabled={status !== 'ready'}>
                      {youtubePlaying ? 'Pause' : 'Play'}
                    </button>
                  ) : null}
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
                {!hasAnswered && youtubeAudioPlayerUrl && (
                  <iframe
                    ref={youtubeFrameRef}
                    className="youtube-audio-frame"
                    src={youtubeAudioPlayerUrl}
                    title="Hidden YouTube audio player"
                    allow="autoplay; encrypted-media"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => {
                      setYoutubeReady(true)
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <div className="audio-controls">
                  <button type="button" onClick={loadRandomOpening} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Loading...' : 'Get Random Opening'}
                  </button>
                  <button type="button" onClick={() => void toggleNativePlayback()} disabled={status !== 'ready'}>
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
            <p className="muted">Loading track...</p>
          )}
        </div>

        {status === 'error' && (
          <p className="error-message">Could not load a random opening from the backend.</p>
        )}

        <h2>Options</h2>
        <div className="answer-row">
          <input
            className="search-input"
            type="text"
            value={answerInput}
            onChange={(event) => {
              setAnswerInput(event.target.value)
              setValidationMessage(null)
            }}
            placeholder="Type your guess, e.g. Naruto"
            disabled={status !== 'ready' || isRoundResolved}
          />
          <button onClick={validateCorrectAnswer} disabled={status !== 'ready' || isRoundResolved}>
            Submit Answer
          </button>
        </div>
        {status === 'ready' && !isRoundResolved && (
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
        {isCorrect !== null && (
          <p className={`result ${isCorrect ? 'pass' : 'fail'}`}>
            {isCorrect ? 'Correct! Nice ear.' : `Not this time. Correct answer: ${round?.correctOpeningTitle}`}
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
      </section>
      <section className="source-note">
        <p>
          The backend is using a mock opening provider for now. Swap `openingSource` in the API to connect
          your real database or external source.
        </p>
      </section>
    </main>
  )
}

export default App
