import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { App } from '../App'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
  selectOptionTestId,
  selectSearchTestId,
  selectSheetTestId,
  selectTriggerTestId,
} from '../ui/fields'
import {
  BACK,
  EMPTY_SHOTS,
  ERROR_LOAD_FAILED,
  ERROR_SAVE_FAILED,
  LABEL_COFFEE,
  LABEL_DOSE,
  LABEL_GRIND,
  LABEL_ROAST_DATE,
  LABEL_TIME,
  LABEL_YIELD,
  LOADING_SHOTS,
  LOG,
  LOG_ESPRESSO_HEADING,
  LOG_SHOT,
  LOG_TEST_ID,
  SEALED_SHOT,
  SELECT_COFFEE_ERROR,
  SHOT_FORM_TEST_ID,
  SHOT_LIST_TEST_ID,
  TRY_AGAIN,
  USE_CALENDAR_DATE,
} from './copy'
import type { EspressoApi, EspressoCatalog, ShotCreate, ShotRow } from './types'
import type { Auth } from '../auth/use-auth'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const GRIND_MARKER = 'verify-grind-7'
const TRPC_FORBIDDEN = 'FORBIDDEN'
const TRPC_INTERNAL = 'INTERNAL_SERVER_ERROR'

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

async function pickSelect(label: string, optionName: string) {
  await fireEvent.press(screen.getByTestId(selectTriggerTestId(label)))
  expect(screen.getByTestId(selectSheetTestId(label))).toBeTruthy()
  await fireEvent.press(screen.getByTestId(selectOptionTestId(optionName)))
  expect(screen.queryByTestId(selectSheetTestId(label))).toBeNull()
}

async function pickCoffee() {
  await pickSelect(LABEL_COFFEE, 'Ethiopia Guji')
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

  it('shows the fallback when save fails with a non-allowlisted code', async () => {
    const { api } = fakeApi(catalog(), {
      create: () => {
        throw Object.assign(new Error('{"issues":[{"code":"invalid_date"}]}'), {
          data: { code: TRPC_INTERNAL },
        })
      },
    })
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe('1.5')
    await press(LOG)

    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()
    expect(screen.queryByText('{"issues":[{"code":"invalid_date"}]}')).toBeNull()
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
  })

  it('names an impossible roast date without calling create', async () => {
    const { api, created } = fakeApi(catalog())
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await fireEvent.changeText(
      screen.getByLabelText(LABEL_ROAST_DATE),
      '2026-02-30',
    )
    await enterRecipe()
    await press(LOG)

    expect(screen.getByText(USE_CALENDAR_DATE)).toBeTruthy()
    expect(created).toHaveLength(0)
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
  })

  it('logs one shot when Log is pressed twice', async () => {
    const created: Array<ShotCreate> = []
    let resolveCreate: () => void = () => {}
    const initial = catalog()
    let shots = [...initial.shots]
    const api: EspressoApi = {
      load: () => ({ ...initial, shots: [...shots] }),
      create: (input) => {
        created.push(input)
        return new Promise<void>((resolve) => {
          resolveCreate = () => {
            shots = [
              {
                id: `shot-${created.length + 1}`,
                coffeeId: input.coffeeId,
                coffeeName: 'Ethiopia Guji',
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
            resolve()
          }
        })
      },
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await fireEvent.press(screen.getByTestId(LOG_TEST_ID))
    await fireEvent.press(screen.getByTestId(LOG_TEST_ID))

    expect(created).toHaveLength(1)
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()

    await act(async () => {
      resolveCreate()
      await Promise.resolve()
    })

    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(created).toHaveLength(1)
    expect(
      screen.getByText(
        `Grind ${GRIND_MARKER} · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`,
      ),
    ).toBeTruthy()
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

  it('clears the load error when a retry is in flight', async () => {
    let resolveRetry: (value: EspressoCatalog) => void = () => {}
    let loads = 0
    const empty = catalog({ shots: [] })
    const api: EspressoApi = {
      load: () => {
        loads += 1
        if (loads === 1) throw new Error('Network request failed')
        return new Promise<EspressoCatalog>((resolve) => {
          resolveRetry = resolve
        })
      },
      create: () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)

    expect(screen.getByText(ERROR_LOAD_FAILED)).toBeTruthy()
    await press(TRY_AGAIN)

    expect(screen.queryByText(ERROR_LOAD_FAILED)).toBeNull()
    expect(screen.queryByRole('button', { name: TRY_AGAIN })).toBeNull()
    expect(screen.queryByText(EMPTY_SHOTS)).toBeNull()
    expect(screen.getByLabelText(LOADING_SHOTS)).toBeTruthy()

    resolveRetry(empty)
    expect(await screen.findByText(EMPTY_SHOTS)).toBeTruthy()
    expect(screen.queryByText(ERROR_LOAD_FAILED)).toBeNull()
  })

  it('filters coffee options in the picker by search', async () => {
    const kenya = '00000000-0000-4000-8000-000000000099'
    const { api } = fakeApi(
      catalog({
        coffees: [
          { id: COFFEE, name: 'Ethiopia Guji' },
          { id: kenya, name: 'Kenya AA' },
        ],
      }),
    )
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await fireEvent.press(screen.getByTestId(selectTriggerTestId(LABEL_COFFEE)))

    expect(screen.getByTestId(selectOptionTestId('Ethiopia Guji'))).toBeTruthy()
    expect(screen.getByTestId(selectOptionTestId('Kenya AA'))).toBeTruthy()

    await fireEvent.changeText(
      screen.getByTestId(selectSearchTestId(LABEL_COFFEE)),
      'Kenya',
    )

    expect(screen.queryByTestId(selectOptionTestId('Ethiopia Guji'))).toBeNull()
    expect(screen.getByTestId(selectOptionTestId('Kenya AA'))).toBeTruthy()
  })

  it('keeps a loaded list when an earlier load fails late', async () => {
    let rejectFirst: (error: Error) => void = () => {}
    const first: EspressoApi = {
      load: () =>
        new Promise<EspressoCatalog>((_, reject) => {
          rejectFirst = reject
        }),
      create: () => {},
    }
    const { api: second } = fakeApi(catalog({ shots: [] }))
    const view = await render(<App auth={signedIn} espresso={first} />)

    await view.rerender(<App auth={signedIn} espresso={second} />)
    expect(screen.getByText(EMPTY_SHOTS)).toBeTruthy()

    await act(async () => {
      rejectFirst(new Error('Network request failed'))
      await Promise.resolve()
    })
    expect(screen.getByText(EMPTY_SHOTS)).toBeTruthy()
    expect(screen.queryByText(ERROR_LOAD_FAILED)).toBeNull()
  })
})
