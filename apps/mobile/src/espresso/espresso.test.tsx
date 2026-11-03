import { fireEvent, render, screen } from '@testing-library/react-native'
import { App } from '../App'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
  BACK,
  EMPTY_SHOTS,
  ERROR_LOAD_FAILED,
  LABEL_DOSE,
  LABEL_GRIND,
  LABEL_TIME,
  LABEL_YIELD,
  LOG,
  LOG_ESPRESSO_HEADING,
  LOG_SHOT,
  SEALED_SHOT,
  SELECT_COFFEE_ERROR,
  SHOT_FORM_TEST_ID,
  SHOT_LIST_TEST_ID,
  TRY_AGAIN,
} from './copy'
import type { EspressoApi, EspressoCatalog, ShotCreate, ShotRow } from './types'
import type { Auth } from '../auth/use-auth'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const GRIND_MARKER = 'verify-grind-7'
const TRPC_FORBIDDEN = 'FORBIDDEN'

const signedIn: Auth = {
  session: {
    user: { name: 'Ada Lovelace', email: 'ada@example.com' },
  },
  loading: false,
  busy: false,
  error: null,
  mode: 'sign-in',
  showApple: true,
  setMode: () => {},
  signInGoogle: async () => {},
  signInApple: async () => {},
  signInE2E: async () => {},
  signOut: async () => {},
}

function seedShot(overrides: Partial<ShotRow> = {}): ShotRow {
  return {
    id: 'shot-1',
    coffeeId: COFFEE,
    coffeeName: 'Ethiopia Guji',
    grinderId: GRINDER,
    brewingDeviceId: ESP_DEVICE,
    roastDate: '2026-05-01',
    grindSetting: '21',
    dose: '18',
    yield: '36',
    time: 27,
    sealed: false,
    ...overrides,
  }
}

function catalog(overrides: Partial<EspressoCatalog> = {}): EspressoCatalog {
  return {
    coffees: [{ id: COFFEE, name: 'Ethiopia Guji' }],
    grinders: [{ id: GRINDER, name: 'Niche Zero' }],
    devices: [{ id: ESP_DEVICE, name: 'Linea Mini' }],
    shots: [seedShot()],
    ...overrides,
  }
}

function fakeApi(
  initial: EspressoCatalog,
  hooks: {
    create?: (input: ShotCreate) => void
    load?: (catalog: EspressoCatalog) => EspressoCatalog
  } = {},
): { api: EspressoApi; created: Array<ShotCreate> } {
  const created: Array<ShotCreate> = []
  let shots = [...initial.shots]
  const api: EspressoApi = {
    load: () => {
      const next = { ...initial, shots: [...shots] }
      return hooks.load ? hooks.load(next) : next
    },
    create: (input) => {
      if (hooks.create) {
        hooks.create(input)
        return
      }
      created.push(input)
      shots = [
        {
          id: `shot-${created.length + 1}`,
          coffeeId: input.coffeeId,
          coffeeName:
            initial.coffees.find((coffee) => coffee.id === input.coffeeId)
              ?.name ?? 'Unknown coffee',
          grinderId: input.grinderId,
          brewingDeviceId: input.brewingDeviceId,
          roastDate: input.roastDate,
          grindSetting: input.grindSetting,
          dose: input.dose,
          yield: input.yield,
          time: input.time,
          sealed: false,
        },
        ...shots,
      ]
    },
  }
  return { api, created }
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }))
}

async function openForm() {
  await press(LOG_SHOT)
  expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
}

async function pickCoffee() {
  await press('Ethiopia Guji')
  expect(screen.getByDisplayValue('2026-05-01')).toBeTruthy()
}

async function enterRecipe(grind = GRIND_MARKER) {
  await fireEvent.changeText(screen.getByLabelText(LABEL_DOSE), '18')
  await fireEvent.changeText(screen.getByLabelText(LABEL_YIELD), '36')
  await fireEvent.changeText(screen.getByLabelText(LABEL_TIME), '30')
  await fireEvent.changeText(screen.getByLabelText(LABEL_GRIND), grind)
  expect(screen.getByDisplayValue(grind)).toBeTruthy()
}

describe('log espresso shot', () => {
  it('picks a coffee, saves a shot, and shows it in the list', async () => {
    const { api, created } = fakeApi(catalog())
    const view = await render(<App auth={signedIn} espresso={api} />)

    expect(screen.getByText('Ethiopia Guji')).toBeTruthy()
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()

    await openForm()
    expect(
      screen.getByRole('header', { name: LOG_ESPRESSO_HEADING }),
    ).toBeTruthy()

    await pickCoffee()
    await enterRecipe()
    await press(LOG)

    expect(created).toHaveLength(1)
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(created[0]).toEqual({
      coffeeId: COFFEE,
      grinderId: GRINDER,
      brewingDeviceId: ESP_DEVICE,
      roastDate: '2026-05-01',
      dose: '18',
      yield: '36',
      time: 30,
      grindSetting: GRIND_MARKER,
      notes: null,
    })

    expect(
      screen.getByText(
        `Grind ${GRIND_MARKER} · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`,
      ),
    ).toBeTruthy()

    writeHostTreeArtifacts(view.toJSON())
  })

  it('shows the empty list until a shot is logged', async () => {
    const { api } = fakeApi(catalog({ shots: [] }))
    await render(<App auth={signedIn} espresso={api} />)

    expect(screen.getByText(EMPTY_SHOTS)).toBeTruthy()
    expect(screen.getByRole('button', { name: LOG_SHOT })).toBeTruthy()
  })

  it('names missing required fields without calling create', async () => {
    const { api, created } = fakeApi(catalog({ shots: [] }))
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText(EMPTY_SHOTS)).toBeTruthy()
    await openForm()

    await press(LOG)

    expect(screen.getByText(SELECT_COFFEE_ERROR)).toBeTruthy()
    expect(screen.getByText('Select a grinder')).toBeTruthy()
    expect(screen.getByText('Select a brewing device')).toBeTruthy()
    expect(screen.getAllByText('Enter a number')).toHaveLength(3)
    expect(screen.getByText('Enter a grind setting')).toBeTruthy()
    expect(created).toHaveLength(0)
  })

  it('shows a sealed shot without its settings', async () => {
    const { api } = fakeApi(
      catalog({
        shots: [
          seedShot({
            sealed: true,
            grinderId: null,
            brewingDeviceId: null,
            grindSetting: null,
            dose: null,
            yield: null,
            time: null,
          }),
        ],
      }),
    )
    await render(<App auth={signedIn} espresso={api} />)

    expect(screen.getByText('Ethiopia Guji')).toBeTruthy()
    expect(screen.getByText(SEALED_SHOT)).toBeTruthy()
    expect(screen.queryByText(/Grind/)).toBeNull()
  })

  it('surfaces the API error as-is when save is refused', async () => {
    const message =
      'This Brew is Sealed. Subscribe to read and edit it again.'
    const { api } = fakeApi(catalog(), {
      create: () => {
        throw Object.assign(new Error(message), {
          data: { code: TRPC_FORBIDDEN },
        })
      },
    })
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByRole('button', { name: LOG_SHOT })).toBeTruthy()
    await openForm()
    await pickCoffee()
    await enterRecipe('1.5')
    await press(LOG)

    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
  })

  it('returns to the list without saving when Back is pressed', async () => {
    const { api, created } = fakeApi(catalog())
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByRole('button', { name: LOG_SHOT })).toBeTruthy()
    await openForm()

    await press(BACK)

    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(created).toHaveLength(0)
  })

  it('returns to the list after a save even if reload fails', async () => {
    let loads = 0
    const { api, created } = fakeApi(catalog(), {
      load: (next) => {
        loads += 1
        if (loads > 1) throw new Error('Network request failed')
        return next
      },
    })
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)

    expect(created).toHaveLength(1)
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(screen.getByText(ERROR_LOAD_FAILED)).toBeTruthy()
    expect(screen.queryByTestId(SHOT_FORM_TEST_ID)).toBeNull()
  })

  it('retries a failed load without showing an empty list', async () => {
    let fail = true
    const { api } = fakeApi(catalog({ shots: [] }), {
      load: (next) => {
        if (fail) {
          fail = false
          throw new Error('Network request failed')
        }
        return next
      },
    })
    await render(<App auth={signedIn} espresso={api} />)

    expect(screen.getByText(ERROR_LOAD_FAILED)).toBeTruthy()
    expect(screen.queryByText(EMPTY_SHOTS)).toBeNull()

    await press(TRY_AGAIN)

    expect(screen.getByText(EMPTY_SHOTS)).toBeTruthy()
    expect(screen.queryByText(ERROR_LOAD_FAILED)).toBeNull()
  })
})
