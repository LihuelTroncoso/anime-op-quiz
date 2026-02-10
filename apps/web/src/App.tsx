import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { AnswerSection } from './components/quiz/AnswerSection'
import { JoinRoomCard } from './components/quiz/JoinRoomCard'
import { RoundControls } from './components/quiz/RoundControls'
import { RoundTimer } from './components/quiz/RoundTimer'
import { ScoreboardSection } from './components/quiz/ScoreboardSection'
import {
  OPENING_START_SECONDS,
  type RequestStatus,
  type RoomStateResponse,
  type RoundDurationSeconds,
  type RoundPayload,
  type ScoreEntry,
} from './types/quiz'
import { normalizeText } from './utils/text'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

function App() {
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [joinName, setJoinName] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [joinedName, setJoinedName] = useState<string>('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const [round, setRound] = useState<RoundPayload | null>(null)
  const [roundDurationSeconds, setRoundDurationSeconds] = useState<RoundDurationSeconds>(20)
  const [scoreboard, setScoreboard] = useState<ScoreEntry[]>([])
  const [answerInput, setAnswerInput] = useState('')
  const [hasAnswered, setHasAnswered] = useState(false)
  const [roundResolved, setRoundResolved] = useState(true)
  const [canPlayRoundAudio, setCanPlayRoundAudio] = useState(false)
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
  const [playStartedAtMs, setPlayStartedAtMs] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null)
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null)

  const isJoined = Boolean(playerId)
  const isYouTubeRound = Boolean(round?.audioUrl.includes('youtube.com/embed/'))
  const roundTotalSeconds = round?.roundDurationSeconds ?? roundDurationSeconds
  const elapsedRoundSeconds = playStartedAtMs === null ? 0 : Math.floor((nowMs - playStartedAtMs) / 1000)
  const remainingRoundSeconds = round ? Math.max(0, roundTotalSeconds - elapsedRoundSeconds) : 0
  const roundProgressPercent = round ? Math.min(100, (remainingRoundSeconds / roundTotalSeconds) * 100) : 0
  const isRoundTimeUp = Boolean(round) && playStartedAtMs !== null && remainingRoundSeconds <= 0
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
    setCanPlayRoundAudio(false)
    setYoutubePlaying(false)
    setYoutubeReady(false)
    setNativePlaying(false)
    setPlayStartedAtMs(null)
  }

  const resetSessionUi = () => {
    resetRoundUi()
    setRound(null)
    setScoreboard([])
    setPlayerId(null)
    setJoinedName('')
    setRoundResolved(true)
    setRoundWinnerName(null)
    setCanStartNextRound(false)
    setNextRoundOwnerName(null)
    setJoinPassword('')
    setJoinError(null)
    setStatus('idle')
  }

  const applyRoomState = (state: RoomStateResponse) => {
    setScoreboard(state.scoreboard)
    setRoundResolved(state.roundResolved)
    setCanPlayRoundAudio(state.canPlayRoundAudio)
    setRoundWinnerName(state.roundWinnerName)
    setCanStartNextRound(state.canStartNextRound)
    setNextRoundOwnerName(state.nextRoundOwnerName)

    if (!state.round) {
      setRound(null)
      setHasAnswered(false)
      setCanPlayRoundAudio(false)
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
    if (!round || !canPlayRoundAudio || roundResolved || isRoundTimeUp) {
      return
    }

    if (!youtubePlaying) {
      setPlayStartedAtMs((current) => current ?? Date.now())
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
    if (!element || !round || !canPlayRoundAudio || roundResolved || isRoundTimeUp) {
      return
    }

    if (nativePlaying) {
      element.pause()
      setNativePlaying(false)
      return
    }

    setPlayStartedAtMs((current) => current ?? Date.now())

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

      resetSessionUi()
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
    if (!round || roundResolved || playStartedAtMs === null) {
      return
    }

    const tick = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => clearInterval(tick)
  }, [round?.openingId, roundResolved, playStartedAtMs])

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
      <JoinRoomCard
        status={status}
        joinName={joinName}
        joinPassword={joinPassword}
        joinError={joinError}
        onJoinNameChange={setJoinName}
        onJoinPasswordChange={setJoinPassword}
        onJoinRoom={() => void joinRoom()}
      />
    )
  }

  return (
    <main className="app-shell">
      <section className="quiz-card battle-card">
        <p className="eyebrow">Anime Opening Quiz</p>
        <h1>Room Battle</h1>
        <p className="muted selector-help">You are playing as `{joinedName}`</p>

        <div className="player-wrap">
          <RoundControls
            status={status}
            round={round}
            canPlayRoundAudio={canPlayRoundAudio}
            roundResolved={roundResolved}
            canStartNextRound={canStartNextRound}
            nextRoundOwnerName={nextRoundOwnerName}
            roundDurationSeconds={roundDurationSeconds}
            hasAnswered={hasAnswered}
            isYouTubeRound={isYouTubeRound}
            youtubeAudioPlayerUrl={youtubeAudioPlayerUrl}
            youtubePlaying={youtubePlaying}
            youtubeVolume={youtubeVolume}
            nativePlaying={nativePlaying}
            nativeVolume={nativeVolume}
            onRoundDurationChange={setRoundDurationSeconds}
            onStartNextRound={() => void startNextRound()}
            onToggleYouTubePlayback={toggleYouTubePlayback}
            onToggleNativePlayback={() => void toggleNativePlayback()}
            onYoutubeVolumeChange={setYoutubeVolume}
            onNativeVolumeChange={setNativeVolume}
            onYouTubeReady={() => setYoutubeReady(true)}
            onNativeEnded={() => setNativePlaying(false)}
            youtubeFrameRef={youtubeFrameRef}
            nativeAudioRef={nativeAudioRef}
          />
          <RoundTimer
            isVisible={Boolean(round && !roundResolved)}
            playStartedAtMs={playStartedAtMs}
            remainingRoundSeconds={remainingRoundSeconds}
            roundProgressPercent={roundProgressPercent}
          />
        </div>

        <AnswerSection
          statusDisabled={status !== 'ready'}
          round={round}
          roundResolved={roundResolved}
          hasAnswered={hasAnswered}
          isRoundTimeUp={isRoundTimeUp}
          answerInput={answerInput}
          matchingTitles={matchingTitles}
          roundWinnerName={roundWinnerName}
          youtubeRevealUrl={youtubeRevealUrl}
          isYouTubeRound={isYouTubeRound}
          validationMessage={validationMessage}
          isCorrectAnswer={isCorrectAnswer}
          onAnswerInputChange={(value) => {
            setAnswerInput(value)
            setValidationMessage(null)
          }}
          onSubmitAnswer={() => void submitAnswer()}
          onSelectTitle={(title) => {
            setAnswerInput(title)
            setValidationMessage(null)
          }}
        />

        <ScoreboardSection
          status={status}
          scoreboard={scoreboard}
          onResetScores={() => void resetScores()}
          onLeaveSession={() => void leaveSession()}
        />
      </section>
    </main>
  )
}

export default App
