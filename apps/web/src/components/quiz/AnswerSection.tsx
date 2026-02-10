import type { RoundPayload } from '../../types/quiz'

type AnswerSectionProps = {
  statusDisabled: boolean
  round: RoundPayload | null
  roundResolved: boolean
  hasAnswered: boolean
  isRoundTimeUp: boolean
  answerInput: string
  matchingTitles: string[]
  roundWinnerName: string | null
  youtubeRevealUrl: string | null
  isYouTubeRound: boolean
  validationMessage: string | null
  isCorrectAnswer: boolean | null
  onAnswerInputChange: (value: string) => void
  onSubmitAnswer: () => void
  onSelectTitle: (title: string) => void
}

export function AnswerSection({
  statusDisabled,
  round,
  roundResolved,
  hasAnswered,
  isRoundTimeUp,
  answerInput,
  matchingTitles,
  roundWinnerName,
  youtubeRevealUrl,
  isYouTubeRound,
  validationMessage,
  isCorrectAnswer,
  onAnswerInputChange,
  onSubmitAnswer,
  onSelectTitle,
}: AnswerSectionProps) {
  const isAnswerDisabled = statusDisabled || hasAnswered || !round || roundResolved || isRoundTimeUp

  return (
    <>
      <h2>Answer</h2>
      <div className="answer-row">
        <input
          className="search-input"
          type="text"
          value={answerInput}
          onChange={(event) => onAnswerInputChange(event.target.value)}
          placeholder="Type your guess"
          disabled={isAnswerDisabled}
        />
        <button onClick={onSubmitAnswer} disabled={isAnswerDisabled}>
          Submit Answer
        </button>
      </div>

      {round && !hasAnswered && !roundResolved && !isRoundTimeUp && (
        <div className="title-matches matches-board" role="listbox" aria-label="Matching titles">
          {matchingTitles.map((title) => (
            <button
              key={title}
              type="button"
              className={`match-item ${answerInput.trim() === title ? 'selected' : ''}`}
              onClick={() => onSelectTitle(title)}
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

      {roundResolved && isYouTubeRound && youtubeRevealUrl && (
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

      {isCorrectAnswer !== null && (
        <p className={`result ${isCorrectAnswer ? 'pass' : 'fail'}`}>
          {isCorrectAnswer ? 'Correct! Nice ear.' : 'Wrong answer this round.'}
        </p>
      )}
    </>
  )
}
