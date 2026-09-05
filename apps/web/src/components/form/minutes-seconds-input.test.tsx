import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MinutesSecondsInput } from './minutes-seconds-input'

// The value is stored as whole seconds but entered as minutes + seconds, so the
// conversion is the thing worth pinning: a pour over of 2:45 must not become
// 2 seconds or stay as a raw 165.
function renderInput(value: number | null) {
  const onChange = vi.fn()
  const onBlur = vi.fn()
  render(
    <MinutesSecondsInput
      label="Brew Time"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
    />,
  )
  return {
    onChange,
    onBlur,
    minutes: screen.getByLabelText<HTMLInputElement>('Brew Time (minutes)'),
    seconds: screen.getByLabelText<HTMLInputElement>('Brew Time (seconds)'),
  }
}

describe('MinutesSecondsInput', () => {
  it('splits stored seconds across the minutes and seconds fields', () => {
    const { minutes, seconds } = renderInput(165) // 2m 45s

    expect(minutes.value).toBe('2')
    expect(seconds.value).toBe('45')
  })

  it('shows both fields empty when there is no brew time', () => {
    const { minutes, seconds } = renderInput(null)

    expect(minutes.value).toBe('')
    expect(seconds.value).toBe('')
  })

  it('reports minutes as whole seconds', () => {
    const { minutes, onChange } = renderInput(null)

    fireEvent.change(minutes, { target: { value: '2' } })

    expect(onChange).toHaveBeenCalledWith(120)
  })

  it('adds the seconds field to the minutes already entered', () => {
    const { seconds, onChange } = renderInput(120) // 2m 0s

    fireEvent.change(seconds, { target: { value: '45' } })

    expect(onChange).toHaveBeenCalledWith(165)
  })

  it('treats an empty minutes field as zero rather than discarding the seconds', () => {
    const { seconds, onChange } = renderInput(null)

    fireEvent.change(seconds, { target: { value: '45' } })

    expect(onChange).toHaveBeenCalledWith(45)
  })

  it('normalizes overflow in the seconds field into minutes', () => {
    const { seconds, onChange } = renderInput(null)

    fireEvent.change(seconds, { target: { value: '165' } })

    expect(onChange).toHaveBeenCalledWith(165)
  })

  it('reads a cleared minutes field as zero while seconds still holds a value', () => {
    const { minutes, onChange } = renderInput(120) // seconds renders as '0'

    fireEvent.change(minutes, { target: { value: '' } })

    // '0' is not empty, so this is zero minutes — not "no brew time".
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('reports a blur from either field, so the form can validate on leave', () => {
    const { minutes, seconds, onBlur } = renderInput(60)

    fireEvent.blur(minutes)
    fireEvent.blur(seconds)

    expect(onBlur).toHaveBeenCalledTimes(2)
  })
})
