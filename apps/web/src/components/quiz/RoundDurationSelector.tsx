import type { RoundDurationSeconds } from '../../types/quiz'

type RoundDurationSelectorProps = {
  id: string
  value: RoundDurationSeconds
  disabled: boolean
  onChange: (value: RoundDurationSeconds) => void
}

export function RoundDurationSelector({ id, value, disabled, onChange }: RoundDurationSelectorProps) {
  return (
    <label className="timer-wrap" htmlFor={id}>
      Round timer
      <select
        id={id}
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value) as RoundDurationSeconds)}
        disabled={disabled}
      >
        <option value="20">20s - Easy</option>
        <option value="10">10s - Medium</option>
        <option value="5">5s - Hard</option>
      </select>
    </label>
  )
}
