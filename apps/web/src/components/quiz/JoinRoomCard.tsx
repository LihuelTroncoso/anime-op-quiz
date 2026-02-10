import type { RequestStatus } from '../../types/quiz'

type JoinRoomCardProps = {
  status: RequestStatus
  joinName: string
  joinPassword: string
  joinError: string | null
  onJoinNameChange: (value: string) => void
  onJoinPasswordChange: (value: string) => void
  onJoinRoom: () => void
}

export function JoinRoomCard({
  status,
  joinName,
  joinPassword,
  joinError,
  onJoinNameChange,
  onJoinPasswordChange,
  onJoinRoom,
}: JoinRoomCardProps) {
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
            onChange={(event) => onJoinNameChange(event.target.value)}
          />
          <input
            className="search-input"
            placeholder="Room password"
            type="password"
            value={joinPassword}
            onChange={(event) => onJoinPasswordChange(event.target.value)}
          />
          <button onClick={onJoinRoom} disabled={status === 'loading'}>
            {status === 'loading' ? 'Joining...' : 'Join Room'}
          </button>
        </div>
        {joinError && <p className="error-message">{joinError}</p>}
      </section>
    </main>
  )
}
