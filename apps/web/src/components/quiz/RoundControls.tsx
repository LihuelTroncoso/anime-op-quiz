import type { MutableRefObject } from 'react'

import { OPENING_START_SECONDS, type RequestStatus, type RoundDurationSeconds, type RoundPayload } from '../../types/quiz'
import { RoundDurationSelector } from './RoundDurationSelector'

type RoundControlsProps = {
  status: RequestStatus
  round: RoundPayload | null
  canPlayRoundAudio: boolean
  roundResolved: boolean
  canStartNextRound: boolean
  nextRoundOwnerName: string | null
  roundDurationSeconds: RoundDurationSeconds
  hasAnswered: boolean
  isYouTubeRound: boolean
  youtubeAudioPlayerUrl: string | null
  youtubePlaying: boolean
  youtubeVolume: number
  nativePlaying: boolean
  nativeVolume: number
  onRoundDurationChange: (value: RoundDurationSeconds) => void
  onStartNextRound: () => void
  onToggleYouTubePlayback: () => void
  onToggleNativePlayback: () => void
  onYoutubeVolumeChange: (value: number) => void
  onNativeVolumeChange: (value: number) => void
  onYouTubeReady: () => void
  onNativeEnded: () => void
  youtubeFrameRef: MutableRefObject<HTMLIFrameElement | null>
  nativeAudioRef: MutableRefObject<HTMLAudioElement | null>
}

export function RoundControls({
  status,
  round,
  canPlayRoundAudio,
  roundResolved,
  canStartNextRound,
  nextRoundOwnerName,
  roundDurationSeconds,
  hasAnswered,
  isYouTubeRound,
  youtubeAudioPlayerUrl,
  youtubePlaying,
  youtubeVolume,
  nativePlaying,
  nativeVolume,
  onRoundDurationChange,
  onStartNextRound,
  onToggleYouTubePlayback,
  onToggleNativePlayback,
  onYoutubeVolumeChange,
  onNativeVolumeChange,
  onYouTubeReady,
  onNativeEnded,
  youtubeFrameRef,
  nativeAudioRef,
}: RoundControlsProps) {
  const nextRoundButtonLabel = status === 'loading' ? 'Loading...' : round ? 'Next Opening' : 'Start First Opening'
  const roundDurationSelectorId = round ? (isYouTubeRound ? 'round-duration-youtube' : 'round-duration-native') : 'round-duration-start'

  return (
    <>
      <div className="audio-controls">
        <RoundDurationSelector
          id={roundDurationSelectorId}
          value={roundDurationSeconds}
          onChange={onRoundDurationChange}
          disabled={status === 'loading' || !canStartNextRound}
        />
        <button type="button" onClick={onStartNextRound} disabled={status === 'loading' || !canStartNextRound}>
          {nextRoundButtonLabel}
        </button>

        {round && isYouTubeRound && (
          <>
            <button
              type="button"
              onClick={onToggleYouTubePlayback}
              disabled={status !== 'ready' || !canPlayRoundAudio}
            >
              {youtubePlaying ? 'Pause' : 'Play'}
            </button>
            {!hasAnswered && (
              <label className="volume-wrap" htmlFor="yt-volume">
                Volume
                <input
                  id="yt-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={youtubeVolume}
                  onChange={(event) => onYoutubeVolumeChange(Number(event.target.value))}
                  disabled={status !== 'ready'}
                />
              </label>
            )}
          </>
        )}

        {round && !isYouTubeRound && (
          <>
            <button
              type="button"
              onClick={onToggleNativePlayback}
              disabled={status !== 'ready' || !canPlayRoundAudio}
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
                onChange={(event) => onNativeVolumeChange(Number(event.target.value))}
                disabled={status !== 'ready'}
              />
            </label>
          </>
        )}
      </div>

      {!canStartNextRound && nextRoundOwnerName && (
        <p className="muted selector-help">{nextRoundOwnerName} can start the next opening.</p>
      )}

      {round && isYouTubeRound && !roundResolved && youtubeAudioPlayerUrl && (
        <iframe
          ref={youtubeFrameRef}
          className="youtube-audio-frame"
          src={youtubeAudioPlayerUrl}
          title="Hidden YouTube audio player"
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onYouTubeReady}
        />
      )}

      {round && !isYouTubeRound && (
        <audio
          ref={nativeAudioRef}
          src={round.audioUrl}
          preload="none"
          className="native-audio-hidden"
          onLoadedMetadata={(event) => {
            const element = event.currentTarget
            element.currentTime = Math.min(OPENING_START_SECONDS, element.duration)
          }}
          onEnded={onNativeEnded}
        >
          Your browser does not support the audio element.
        </audio>
      )}
    </>
  )
}
