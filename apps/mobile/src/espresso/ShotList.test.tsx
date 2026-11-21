import { fireEvent, render } from '@testing-library/react-native'
import { ShotList } from './ShotList'
import { LOAD_MORE_SHOTS, SHOT_LIST_TEST_ID } from './copy'
import type { ShotRow } from './types'

const emptyProps = {
  canLog: false,
  hasMore: false,
  refreshing: false,
  loadingMore: false,
  loadMoreError: null,
  onLogShot: () => {},
  onEndReached: () => {},
}

const shot: ShotRow = {
  id: 's1',
  coffeeId: 'c1',
  coffeeName: 'Ethiopia Guji',
  grinderId: null,
  brewingDeviceId: null,
  roastDate: null,
  grindSetting: null,
  dose: null,
  yield: null,
  time: null,
  sealed: false,
}

describe('ShotList', () => {
  it('keeps the same empty rows while shots are loading', async () => {
    const props = {
      ...emptyProps,
      shots: null,
      loading: true,
      failed: false,
    }
    const view = await render(<ShotList {...props} />)
    const pendingRows = view.getByTestId(SHOT_LIST_TEST_ID).props.data
    expect(pendingRows).toEqual([])
    await view.rerender(<ShotList {...props} />)
    expect(view.getByTestId(SHOT_LIST_TEST_ID).props.data).toBe(pendingRows)
  })

  it('keeps loaded shots visible when a later load fails', async () => {
    const view = await render(
      <ShotList
        {...emptyProps}
        shots={[shot]}
        loading={false}
        failed={true}
      />,
    )
    expect(view.getByText('Ethiopia Guji')).toBeTruthy()
  })

  it('offers the next page as a button, held while the list refreshes', async () => {
    const onEndReached = jest.fn()
    const list = (refreshing: boolean) => (
      <ShotList
        {...emptyProps}
        shots={[shot]}
        hasMore={true}
        refreshing={refreshing}
        loading={false}
        failed={false}
        onEndReached={onEndReached}
      />
    )
    const view = await render(list(true))
    const button = view.getByRole('button', { name: LOAD_MORE_SHOTS })
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(button)
    expect(onEndReached).not.toHaveBeenCalled()

    await view.rerender(list(false))
    await fireEvent.press(view.getByRole('button', { name: LOAD_MORE_SHOTS }))
    expect(onEndReached).toHaveBeenCalledTimes(1)
  })
})
