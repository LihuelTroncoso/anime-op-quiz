type RoundTimerProps = {
  isVisible: boolean
  playStartedAtMs: number | null
  remainingRoundSeconds: number
  roundProgressPercent: number
}

export function RoundTimer({
  isVisible,
  playStartedAtMs,
  remainingRoundSeconds,
  roundProgressPercent,
}: RoundTimerProps) {
  if (!isVisible) {
    return null
  }

  return (
    <div className="round-timer" role="status" aria-live="polite">
      <div className="round-timer-top">
        <span>{playStartedAtMs === null ? 'Timer ready' : 'Time left'}</span>
        <strong>{remainingRoundSeconds}s</strong>
      </div>
      <div className="round-timer-track" aria-hidden="true">
        <span className="round-timer-fill" style={{ width: `${roundProgressPercent}%` }} />
      </div>
      {playStartedAtMs === null && <p className="muted selector-help">Press Play to begin your countdown.</p>}
    </div>
  )
}
