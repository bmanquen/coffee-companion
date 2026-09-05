import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SteepMinutesInput } from './steep-minutes-input'

// The value is stored as whole minutes but entered as hours + minutes, so the
// conversion is the thing worth pinning: a cold brew steeps for 18 hours, and
// entering that must not become 18 minutes.
function renderInput(value: number | null) {
  const onChange = vi.fn()
  const onBlur = vi.fn()
  render(
    <SteepMinutesInput value={value} onChange={onChange} onBlur={onBlur} />,
  )
  return {
    onChange,
    onBlur,
    hours: screen.getByLabelText<HTMLInputElement>('Steep Time (hours)'),
    minutes: screen.getByLabelText<HTMLInputElement>('Steep Time (minutes)'),
  }
}

describe('SteepMinutesInput', () => {
  it('splits stored minutes across the hours and minutes fields', () => {
    const { hours, minutes } = renderInput(1110) // 18h 30m

    expect(hours.value).toBe('18')
    expect(minutes.value).toBe('30')
  })

  it('shows both fields empty when there is no steep time', () => {
    const { hours, minutes } = renderInput(null)

    expect(hours.value).toBe('')
    expect(minutes.value).toBe('')
  })

  it('reports hours as whole minutes', () => {
    const { hours, onChange } = renderInput(null)

    fireEvent.change(hours, { target: { value: '18' } })

    expect(onChange).toHaveBeenCalledWith(1080)
  })

  it('adds the minutes field to the hours already entered', () => {
    const { minutes, onChange } = renderInput(1080) // 18h 0m

    fireEvent.change(minutes, { target: { value: '30' } })

    expect(onChange).toHaveBeenCalledWith(1110)
  })

  it('treats an empty hours field as zero rather than discarding the minutes', () => {
    const { minutes, onChange } = renderInput(null)

    fireEvent.change(minutes, { target: { value: '45' } })

    expect(onChange).toHaveBeenCalledWith(45)
  })

  it('sends no steep time when hours is cleared and minutes is only a leftover zero', () => {
    const { hours, onChange } = renderInput(1080) // minutes renders as '0'

    fireEvent.change(hours, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('reports a blur from either field, so the form can validate on leave', () => {
    const { hours, minutes, onBlur } = renderInput(60)

    fireEvent.blur(hours)
    fireEvent.blur(minutes)

    expect(onBlur).toHaveBeenCalledTimes(2)
  })
})
