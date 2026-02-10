import type { RequestStatus, ScoreEntry } from '../../types/quiz'

type ScoreboardSectionProps = {
  status: RequestStatus
  scoreboard: ScoreEntry[]
  onResetScores: () => void
  onLeaveSession: () => void
}

export function ScoreboardSection({ status, scoreboard, onResetScores, onLeaveSession }: ScoreboardSectionProps) {
  return (
    <>
      <h2>Scoreboard</h2>
      <div className="answer-row">
        <button className="button-warning" onClick={onResetScores} disabled={status === 'loading'}>
          Reset Scores
        </button>
        <button className="button-danger" onClick={onLeaveSession} disabled={status === 'loading'}>
          Leave Session
        </button>
      </div>

      <div className="title-matches scoreboard-board" role="table" aria-label="Scoreboard">
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
    </>
  )
}
