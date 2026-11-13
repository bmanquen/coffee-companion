import { render } from '@testing-library/react-native'
import { ShotList } from './ShotList'
import { SHOT_LIST_TEST_ID } from './copy'
import type { ShotRow } from './types'

const emptyProps = {
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
})
