import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { TRPC_CONFLICT } from '../api-error'
import { App } from '../App'
import { SignedInHome } from '../auth/SignedInHome'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
  selectKeyboardTestId,
  selectOptionTestId,
  selectSearchTestId,
  selectSheetTestId,
  selectTriggerA11yLabel,
  selectTriggerTestId,
} from '../ui/fields'
import { consumeHardwareBack } from './ShotForm'
import {
  BACK,
  EMPTY_SHOTS,
  ERROR_LOAD_FAILED,
  ERROR_LOAD_MORE_FAILED,
  ERROR_PREFILL_FAILED,
  ERROR_SAVE_FAILED,
  LABEL_COFFEE,
  LABEL_DEVICE,
  LABEL_DOSE,
  LABEL_GRIND,
  LABEL_GRINDER,
  LABEL_ROAST_DATE,
  LABEL_TIME,
  LABEL_YIELD,
  LOADING_MORE_SHOTS,
  LOADING_SHOTS,
  LOG,
  LOG_ESPRESSO_HEADING,
  LOG_SHOT,
  LOG_SHOT_TEST_ID,
  LOG_TEST_ID,
  SEALED_SHOT,
  SELECT_COFFEE_ERROR,
  SELECT_DEVICE,
  SELECT_DEVICE_ERROR,
  SELECT_GRINDER,
  SELECT_GRINDER_ERROR,
  SHOT_FORM_PREFILL_ERROR_TEST_ID,
  SHOT_FORM_TEST_ID,
  SHOT_LIST_TEST_ID,
  SHOT_ROW_TEST_ID_PREFIX,
  TRY_AGAIN,
  USE_CALENDAR_DATE,
} from './copy'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotCursor,
  ShotRow,
} from './types'
import type { Auth } from '../auth/use-auth'

const COFFEE = '00000000-0000-4000-8000-000000000001'
const COFFEE_B = '00000000-0000-4000-8000-000000000002'
const GRINDER = '00000000-0000-4000-8000-000000000003'
const GRINDER_B = '00000000-0000-4000-8000-000000000006'
const ESP_DEVICE = '00000000-0000-4000-8000-000000000005'
const ADA_ID = 'user-ada'
const ALAN_ID = 'user-alan'
const GRIND_MARKER = 'verify-grind-7'
const LOGGED_RECIPE = `Grind ${GRIND_MARKER} · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`
const TRPC_FORBIDDEN = 'FORBIDDEN'
const TRPC_INTERNAL = 'INTERNAL_SERVER_ERROR'
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const signedIn: Auth = {
  session: {
    user: {
      id: ADA_ID,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    },
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

const PAGE_CURSOR_PREFIX = 'after:'

function pageCursor(shotId: string): ShotCursor {
  return `${PAGE_CURSOR_PREFIX}${shotId}`
}

function pageFrom(all: Array<ShotRow>, cursor?: ShotCursor | null) {
  if (!cursor) {
    const items = all.slice(0, 20)
    return {
      items,
      total: all.length,
      nextCursor:
        items.length > 0 && items.length < all.length
          ? pageCursor(items[items.length - 1].id)
          : null,
    }
  }
  const index = all.findIndex((shot) => pageCursor(shot.id) === cursor)
  if (index < 0) {
    return { items: [], total: all.length, nextCursor: null }
  }
  const items = all.slice(index + 1, index + 1 + 20)
  return {
    items,
    total: all.length,
    nextCursor:
      items.length > 0 && index + 1 + items.length < all.length
        ? pageCursor(items[items.length - 1].id)
        : null,
  }
}

function catalog(overrides: Partial<EspressoCatalog> = {}): EspressoCatalog {
  const shots = overrides.shots ?? [seedShot()]
  const total = overrides.total ?? shots.length
  return {
    coffees: [{ id: COFFEE, name: 'Ethiopia Guji' }],
    grinders: [{ id: GRINDER, name: 'Niche Zero' }],
    devices: [{ id: ESP_DEVICE, name: 'Linea Mini' }],
    nextCursor:
      shots.length > 0 && shots.length < total
        ? pageCursor(shots[shots.length - 1].id)
        : null,
    ...overrides,
    shots,
    total,
  }
}

function pagingFor(
  getShots: () => Array<ShotRow>,
): Pick<EspressoApi, 'listShots' | 'loadPrefill'> {
  return {
    listShots: (cursor) => Promise.resolve(pageFrom(getShots(), cursor)),
    loadPrefill: (coffeeId) => {
      const shots = getShots()
      return Promise.resolve(
        shots.find((shot) => shot.coffeeId === coffeeId && !shot.sealed) ?? null,
      )
    },
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
    load: () =>
      Promise.resolve().then(() => {
        const page = pageFrom(shots)
        const next = {
          ...initial,
          shots: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
        }
        return hooks.load ? hooks.load(next) : next
      }),
    listShots: (cursor) => Promise.resolve(pageFrom(shots, cursor)),
    loadPrefill: (coffeeId) =>
      Promise.resolve(
        shots.find((shot) => shot.coffeeId === coffeeId && !shot.sealed) ?? null,
      ),
    create: (input) =>
      Promise.resolve().then(() => {
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
                ?.label ??
              initial.coffees.find((coffee) => coffee.id === input.coffeeId)
                ?.name ??
              'Unknown coffee',
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
      }),
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

async function pickSelect(label: string, optionId: string) {
  await fireEvent.press(screen.getByTestId(selectTriggerTestId(label)))
  expect(screen.getByTestId(selectSheetTestId(label))).toBeTruthy()
  await fireEvent.press(screen.getByTestId(selectOptionTestId(optionId)))
  expect(screen.queryByTestId(selectSheetTestId(label))).toBeNull()
}

async function pickCoffee() {
  await pickSelect(LABEL_COFFEE, COFFEE)
  expect(await screen.findByDisplayValue('2026-05-01')).toBeTruthy()
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
      idempotencyKey: expect.stringMatching(IDEMPOTENCY_KEY_PATTERN),
    })

    expect(screen.getByText(LOGGED_RECIPE)).toBeTruthy()

    writeHostTreeArtifacts(view)
  }, 15_000)

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

    await fireEvent.changeText(screen.getByLabelText(LABEL_DOSE), '18')
    expect(screen.getAllByText('Enter a number')).toHaveLength(2)
    expect(screen.getByText(SELECT_COFFEE_ERROR)).toBeTruthy()
  })

  it('clears only the coffee error when a coffee is selected', async () => {
    const { api } = fakeApi(catalog({ shots: [] }))
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await press(LOG)
    expect(screen.getByText(SELECT_COFFEE_ERROR)).toBeTruthy()
    expect(screen.getByText(SELECT_GRINDER_ERROR)).toBeTruthy()
    expect(screen.getByText(SELECT_DEVICE_ERROR)).toBeTruthy()

    await pickSelect(LABEL_COFFEE, COFFEE)
    expect(screen.queryByText(SELECT_COFFEE_ERROR)).toBeNull()
    expect(screen.getByText(SELECT_GRINDER_ERROR)).toBeTruthy()
    expect(screen.getByText(SELECT_DEVICE_ERROR)).toBeTruthy()
  })

  it('clears grinder and device errors when prefill fills them', async () => {
    const { api } = fakeApi(catalog())
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await press(LOG)
    expect(screen.getByText(SELECT_GRINDER_ERROR)).toBeTruthy()
    expect(screen.getByText(SELECT_DEVICE_ERROR)).toBeTruthy()

    await pickCoffee()
    expect(screen.queryByText(SELECT_COFFEE_ERROR)).toBeNull()
    expect(screen.queryByText(SELECT_GRINDER_ERROR)).toBeNull()
    expect(screen.queryByText(SELECT_DEVICE_ERROR)).toBeNull()
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
    const createdShot = (input: ShotCreate): ShotRow => ({
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
    })
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => shots),
      load: () =>
        Promise.resolve({ ...initial, shots: [...shots], total: shots.length }),
      create: (input) => {
        created.push(input)
        return pending
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
      shots = [createdShot(created[0]), ...shots]
      resolveCreate()
      await pending
    })

    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(created).toHaveLength(1)
    expect(screen.getByText(LOGGED_RECIPE)).toBeTruthy()
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
    const espresso: EspressoApi = {
      ...api,
      listShots: () => Promise.reject(new Error('Network request failed')),
    }
    await render(<App auth={signedIn} espresso={espresso} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)

    expect(created).toHaveLength(1)
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(await screen.findByText(ERROR_LOAD_FAILED)).toBeTruthy()
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
      ...pagingFor(() => empty.shots),
      load: async () => {
        loads += 1
        if (loads === 1) throw new Error('Network request failed')
        return new Promise<EspressoCatalog>((resolve) => {
          resolveRetry = resolve
        })
      },
      create: async () => {},
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

    expect(screen.getByTestId(selectOptionTestId(COFFEE))).toBeTruthy()
    expect(screen.getByTestId(selectOptionTestId(kenya))).toBeTruthy()

    await fireEvent.changeText(
      screen.getByTestId(selectSearchTestId(LABEL_COFFEE)),
      'Kenya',
    )

    expect(screen.queryByTestId(selectOptionTestId(COFFEE))).toBeNull()
    expect(screen.getByTestId(selectOptionTestId(kenya))).toBeTruthy()
  })

  it('distinguishes same-named coffees by roaster and option id', async () => {
    const sey = '00000000-0000-4000-8000-000000000011'
    const heart = '00000000-0000-4000-8000-000000000012'
    const { api } = fakeApi(
      catalog({
        coffees: [
          {
            id: sey,
            name: 'Ethiopia Guji',
            label: 'Ethiopia Guji · Sey',
          },
          {
            id: heart,
            name: 'Ethiopia Guji',
            label: 'Ethiopia Guji · Heart',
          },
        ],
        shots: [],
      }),
    )
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await fireEvent.press(screen.getByTestId(selectTriggerTestId(LABEL_COFFEE)))

    expect(screen.getByLabelText('Ethiopia Guji · Sey')).toBeTruthy()
    expect(screen.getByLabelText('Ethiopia Guji · Heart')).toBeTruthy()
    expect(screen.getByText('Ethiopia Guji · Sey')).toBeTruthy()
    expect(screen.getByText('Ethiopia Guji · Heart')).toBeTruthy()
    expect(screen.getByTestId(selectOptionTestId(sey))).toBeTruthy()
    expect(screen.getByTestId(selectOptionTestId(heart))).toBeTruthy()
    expect(screen.queryByTestId(selectOptionTestId('Ethiopia Guji'))).toBeNull()

    await fireEvent.changeText(
      screen.getByTestId(selectSearchTestId(LABEL_COFFEE)),
      'Heart',
    )

    expect(screen.queryByTestId(selectOptionTestId(sey))).toBeNull()
    expect(screen.getByTestId(selectOptionTestId(heart))).toBeTruthy()
  })

  it('raises the picker sheet above the keyboard', async () => {
    const { api } = fakeApi(catalog())
    const view = await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await fireEvent.press(screen.getByTestId(selectTriggerTestId(LABEL_COFFEE)))

    const search = screen.getByTestId(selectSearchTestId(LABEL_COFFEE))
    await fireEvent(search, 'focus')

    expect(screen.getByTestId(selectKeyboardTestId(LABEL_COFFEE))).toBeTruthy()
    expect(screen.getByTestId(selectSheetTestId(LABEL_COFFEE))).toBeTruthy()

    const pickerDest = process.env.VERIFY_MOBILE_PICKER_KEYBOARD_ARTIFACTS
    if (pickerDest) writeHostTreeArtifacts(view, pickerDest)
  })

  it('names the coffee trigger with the selected option', async () => {
    const { api } = fakeApi(catalog())
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()

    expect(
      screen.getByLabelText(
        selectTriggerA11yLabel(LABEL_COFFEE, 'Select Coffee'),
      ),
    ).toBeTruthy()

    await pickCoffee()

    expect(
      screen.getByLabelText(
        selectTriggerA11yLabel(LABEL_COFFEE, 'Ethiopia Guji'),
      ),
    ).toBeTruthy()
  })

  it('clears the save error when a field is edited', async () => {
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
    await openForm()
    await pickCoffee()
    await enterRecipe('1.5')
    await press(LOG)

    expect(screen.getByText(message)).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText(LABEL_DOSE), '17')

    expect(screen.queryByText(message)).toBeNull()
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
  })

  it('clears the save error when Coffee is changed', async () => {
    const kenya = '00000000-0000-4000-8000-000000000099'
    const message =
      'This Brew is Sealed. Subscribe to read and edit it again.'
    const { api } = fakeApi(
      catalog({
        coffees: [
          { id: COFFEE, name: 'Ethiopia Guji' },
          { id: kenya, name: 'Kenya AA' },
        ],
      }),
      {
        create: () => {
          throw Object.assign(new Error(message), {
            data: { code: TRPC_FORBIDDEN },
          })
        },
      },
    )
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe('1.5')
    await press(LOG)

    expect(screen.getByText(message)).toBeTruthy()

    await pickSelect(LABEL_COFFEE, kenya)

    expect(screen.queryByText(message)).toBeNull()
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
  })

  it('does not leave the form when Back is pressed during save', async () => {
    const created: Array<ShotCreate> = []
    let resolveCreate: () => void = () => {}
    const initial = catalog()
    let shots = [...initial.shots]
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => shots),
      load: () =>
        Promise.resolve({ ...initial, shots: [...shots], total: shots.length }),
      create: (input) => {
        created.push(input)
        return pending
      },
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await fireEvent.press(screen.getByTestId(LOG_TEST_ID))

    expect(screen.getByRole('button', { name: BACK })).toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: BACK }))
    expect(screen.getByTestId(SHOT_FORM_TEST_ID)).toBeTruthy()
    expect(screen.queryByTestId(SHOT_LIST_TEST_ID)).toBeNull()

    await act(async () => {
      shots = [
        {
          id: 'shot-new',
          coffeeId: created[0].coffeeId,
          coffeeName: 'Ethiopia Guji',
          grinderId: created[0].grinderId,
          brewingDeviceId: created[0].brewingDeviceId,
          roastDate: created[0].roastDate,
          grindSetting: created[0].grindSetting,
          dose: created[0].dose,
          yield: created[0].yield,
          time: created[0].time,
          sealed: false,
        },
        ...shots,
      ]
      resolveCreate()
      await pending
    })

    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(screen.getByText(LOGGED_RECIPE)).toBeTruthy()
  })

  it('does not go back on hardware back during save', () => {
    const onBack = jest.fn()
    expect(consumeHardwareBack(true, onBack)).toBe(true)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('goes back on hardware back when nothing is pending', () => {
    const onBack = jest.fn()
    expect(consumeHardwareBack(false, onBack)).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('reloads the catalog when the signed-in user changes, even if the api object does not', async () => {
    let owner = ADA_ID
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        Promise.resolve(
          owner === ADA_ID
            ? catalog({ shots: [seedShot({ coffeeName: 'Ada House' })] })
            : catalog({ shots: [seedShot({ coffeeName: 'Alan House' })] }),
        ),
      create: async () => {},
    }
    const view = await render(
      <App auth={signedIn} espresso={api} />,
    )
    expect(await screen.findByText('Ada House')).toBeTruthy()

    owner = ALAN_ID
    await view.rerender(
      <App
        auth={{
          ...signedIn,
          session: {
            user: {
              id: ALAN_ID,
              name: 'Ada Lovelace',
              email: 'alan@example.com',
            },
          },
        }}
        espresso={api}
      />,
    )

    expect(await screen.findByText('Alan House')).toBeTruthy()
    expect(screen.queryByText('Ada House')).toBeNull()
  })

  it('does not apply a previous user load after the signed-in user changes', async () => {
    let resolveAda: (catalog: EspressoCatalog) => void = () => {}
    const adaLoad = new Promise<EspressoCatalog>((resolve) => {
      resolveAda = resolve
    })
    let owner = ADA_ID
    const adaCatalog = catalog({
      shots: [seedShot({ coffeeName: 'Ada House' })],
    })
    const alanCatalog = catalog({
      shots: [seedShot({ coffeeName: 'Alan House' })],
    })
    const api: EspressoApi = {
      ...pagingFor(() =>
        owner === ADA_ID ? adaCatalog.shots : alanCatalog.shots,
      ),
      load: () => (owner === ADA_ID ? adaLoad : Promise.resolve(alanCatalog)),
      create: async () => {},
    }
    const view = await render(
      <SignedInHome
        userId={ADA_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )

    owner = ALAN_ID
    await view.rerender(
      <SignedInHome
        userId={ALAN_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )
    expect(await screen.findByText('Alan House')).toBeTruthy()

    await act(async () => {
      resolveAda(adaCatalog)
      await adaLoad
    })

    expect(screen.getByText('Alan House')).toBeTruthy()
    expect(screen.queryByText('Ada House')).toBeNull()
  })

  it('loads more after the signed-in user changes during a pending refresh', async () => {
    const adaAll = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `ada-${index}`,
        coffeeName: `Ada ${index}`,
      }),
    )
    const alanAll = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `alan-${index}`,
        coffeeName: `Alan ${index}`,
      }),
    )
    let owner = ADA_ID
    const cursors: Array<ShotCursor | null | undefined> = []
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(
          catalog({
            shots: (owner === ADA_ID ? adaAll : alanAll).slice(0, 20),
            total: 25,
          }),
        ),
      listShots: (cursor) => {
        cursors.push(cursor)
        if (owner === ADA_ID && !cursor) {
          return new Promise(() => {})
        }
        return Promise.resolve(
          pageFrom(owner === ADA_ID ? adaAll : alanAll, cursor),
        )
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: async () => {},
    }
    const view = await render(
      <SignedInHome
        userId={ADA_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )
    expect(screen.getByText('Ada 0')).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(cursors).toEqual([undefined])

    owner = ALAN_ID
    await view.rerender(
      <SignedInHome
        userId={ALAN_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )
    expect(await screen.findByText('Alan 0')).toBeTruthy()
    expect(screen.queryByText('Ada 0')).toBeNull()

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    await waitFor(() =>
      expect(cursors).toContain(pageCursor('alan-19')),
    )
  })

  it('does not apply a previous user save after the signed-in user changes', async () => {
    let resolveCreate: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    let owner = ADA_ID
    let loads = 0
    const api: EspressoApi = {
      ...pagingFor(() =>
        owner === ADA_ID
          ? [seedShot({ coffeeName: 'Ada House' })]
          : [seedShot({ coffeeName: 'Alan House' })],
      ),
      load: () => {
        loads += 1
        return Promise.resolve(
          owner === ADA_ID
            ? catalog({ shots: [seedShot({ coffeeName: 'Ada House' })] })
            : catalog({ shots: [seedShot({ coffeeName: 'Alan House' })] }),
        )
      },
      create: () => pending,
    }
    const view = await render(
      <SignedInHome
        userId={ADA_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )
    expect(await screen.findByText('Ada House')).toBeTruthy()
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await fireEvent.press(screen.getByTestId(LOG_TEST_ID))

    owner = ALAN_ID
    await view.rerender(
      <SignedInHome
        userId={ALAN_ID}
        name="Ada Lovelace"
        espresso={api}
        onSignOut={() => {}}
      />,
    )
    expect(await screen.findByText('Alan House')).toBeTruthy()
    const loadsAfterSwitch = loads

    await act(async () => {
      resolveCreate()
      await pending
    })

    expect(loads).toBe(loadsAfterSwitch)
    expect(screen.getByText('Alan House')).toBeTruthy()
    expect(screen.queryByText('Ada House')).toBeNull()
    expect(screen.queryByTestId(SHOT_FORM_TEST_ID)).toBeNull()
  })

  it('does not edit fields or open the coffee picker while a save is in flight', async () => {
    let resolveCreate: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => catalog().shots),
      load: () => Promise.resolve(catalog()),
      create: () => pending,
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await fireEvent.press(screen.getByTestId(LOG_TEST_ID))

    expect(screen.getByLabelText(LABEL_DOSE)).toBeDisabled()
    expect(
      screen.getByTestId(selectTriggerTestId(LABEL_COFFEE)),
    ).toBeDisabled()

    await fireEvent.changeText(screen.getByLabelText(LABEL_DOSE), '99')
    expect(screen.getByDisplayValue('18')).toBeTruthy()
    expect(screen.queryByDisplayValue('99')).toBeNull()

    await fireEvent.press(screen.getByTestId(selectTriggerTestId(LABEL_COFFEE)))
    expect(screen.queryByTestId(selectSheetTestId(LABEL_COFFEE))).toBeNull()

    await act(async () => {
      resolveCreate()
      await pending
    })
  })

  it('keeps a loaded list when an earlier load fails late', async () => {
    let rejectFirst: (error: Error) => void = () => {}
    const first: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        new Promise<EspressoCatalog>((_, reject) => {
          rejectFirst = reject
        }),
      create: async () => {},
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

  it('shows welcome while a catalog load is still in flight', async () => {
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => new Promise(() => {}),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(screen.getByLabelText(LOADING_SHOTS)).toBeTruthy()
    expect(screen.queryByText(EMPTY_SHOTS)).toBeNull()
    expect(screen.getByTestId(LOG_SHOT_TEST_ID)).toBeDisabled()
  })

  it('retries a lost create with the same key and does not duplicate the shot', async () => {
    const stored: Array<ShotRow> = []
    const keys: Array<string> = []
    let creates = 0
    const api: EspressoApi = {
      ...pagingFor(() => stored),
      load: () =>
        Promise.resolve(catalog({ shots: [...stored], total: stored.length })),
      loadPrefill: (coffeeId) =>
        Promise.resolve(
          stored.find((shot) => shot.coffeeId === coffeeId && !shot.sealed) ??
            seedShot(),
        ),
      create: (input) =>
        Promise.resolve().then(() => {
          keys.push(input.idempotencyKey)
          creates += 1
          if (stored.length === 0) {
            stored.push(
              seedShot({
                id: 'shot-saved',
                grindSetting: GRIND_MARKER,
                dose: input.dose,
                yield: input.yield,
                time: input.time,
              }),
            )
          }
          if (creates === 1) throw new Error('Network request failed')
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()
    await press(LOG)

    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(await screen.findByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-saved`)).toBeTruthy()
    expect(screen.getAllByText('Ethiopia Guji')).toHaveLength(1)
  })

  it('loads the next page when the list reaches the end', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    const cursors: Array<ShotCursor | null | undefined> = []
    const api: EspressoApi = {
      ...pagingFor(() => all),
      load: () =>
        Promise.resolve(
          catalog({ shots: all.slice(0, 20), total: all.length }),
        ),
      listShots: (cursor) => {
        cursors.push(cursor)
        return Promise.resolve(pageFrom(all, cursor))
      },
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()
    expect(screen.queryByText('Coffee 20')).toBeNull()

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    await waitFor(() => expect(cursors).toContain(pageCursor('shot-19')))
    expect(cursors).not.toContain('shot-19')
    expect(screen.queryByLabelText(LOADING_MORE_SHOTS)).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-20`)).toBeTruthy(),
    )
    for (const index of [20, 21, 22, 23, 24]) {
      expect(screen.getByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-${index}`)).toBeTruthy()
      expect(screen.getByText(`Coffee ${index}`)).toBeTruthy()
    }
  })

  it('prefills from the coffee query even when that shot is not on the first page', async () => {
    const older = seedShot({
      id: 'shot-old',
      grindSetting: '21',
      roastDate: '2026-05-01',
    })
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog({ shots: [], total: 0 })),
      loadPrefill: () => Promise.resolve(older),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    expect(
      screen.getByLabelText(selectTriggerA11yLabel(LABEL_GRINDER, 'Niche Zero')),
    ).toBeTruthy()
    expect(
      screen.getByLabelText(selectTriggerA11yLabel(LABEL_DEVICE, 'Linea Mini')),
    ).toBeTruthy()
  })

  it('clears the previous coffee’s roast date as soon as another coffee is chosen', async () => {
    let resolveB: (shot: ShotRow | null) => void = () => {}
    const pendingB = new Promise<ShotRow | null>((resolve) => {
      resolveB = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        Promise.resolve(
          catalog({
            coffees: [
              { id: COFFEE, name: 'Ethiopia Guji' },
              { id: COFFEE_B, name: 'Colombia Huila' },
            ],
            grinders: [
              { id: GRINDER, name: 'Niche Zero' },
              { id: GRINDER_B, name: 'P64' },
            ],
          }),
        ),
      loadPrefill: (coffeeId) => {
        if (coffeeId === COFFEE_B) return pendingB
        return Promise.resolve(seedShot())
      },
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    expect(screen.getByDisplayValue('2026-05-01')).toBeTruthy()

    await pickSelect(LABEL_COFFEE, COFFEE_B)
    expect(screen.queryByDisplayValue('2026-05-01')).toBeNull()
    expect(screen.getByLabelText(LABEL_ROAST_DATE).props.value).toBe('')
    expect(
      screen.queryByLabelText(
        selectTriggerA11yLabel(LABEL_GRINDER, 'Niche Zero'),
      ),
    ).toBeNull()
    expect(
      screen.getByLabelText(selectTriggerA11yLabel(LABEL_GRINDER, SELECT_GRINDER)),
    ).toBeTruthy()

    await act(async () => {
      resolveB(
        seedShot({
          coffeeId: COFFEE_B,
          coffeeName: 'Colombia Huila',
          roastDate: '2026-04-01',
          grinderId: GRINDER_B,
        }),
      )
      await pendingB
    })
    expect(await screen.findByDisplayValue('2026-04-01')).toBeTruthy()
  })

  it('keeps a roast date typed while prefill is still loading', async () => {
    let resolvePrefill: (shot: ShotRow | null) => void = () => {}
    const pending = new Promise<ShotRow | null>((resolve) => {
      resolvePrefill = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog()),
      loadPrefill: () => pending,
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    await fireEvent.changeText(
      screen.getByLabelText(LABEL_ROAST_DATE),
      '2026-06-15',
    )
    expect(screen.getByDisplayValue('2026-06-15')).toBeTruthy()

    await act(async () => {
      resolvePrefill(seedShot())
      await pending
    })
    expect(screen.getByDisplayValue('2026-06-15')).toBeTruthy()
    expect(screen.queryByDisplayValue('2026-05-01')).toBeNull()
  })

  it('keeps a chosen grinder and still prefills roast date and device', async () => {
    let resolvePrefill: (shot: ShotRow | null) => void = () => {}
    const pending = new Promise<ShotRow | null>((resolve) => {
      resolvePrefill = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        Promise.resolve(
          catalog({
            grinders: [
              { id: GRINDER, name: 'Niche Zero' },
              { id: GRINDER_B, name: 'P64' },
            ],
          }),
        ),
      loadPrefill: () => pending,
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    await pickSelect(LABEL_GRINDER, GRINDER_B)
    expect(screen.getByLabelText('Grinder, P64')).toBeTruthy()

    await act(async () => {
      resolvePrefill(seedShot())
      await pending
    })
    expect(await screen.findByDisplayValue('2026-05-01')).toBeTruthy()
    expect(screen.getByLabelText('Grinder, P64')).toBeTruthy()
    expect(screen.queryByText('Niche Zero')).toBeNull()
    expect(screen.getByLabelText('Brewing Device, Linea Mini')).toBeTruthy()
  })

  it('clears a prefilled device that is not an espresso option', async () => {
    const otherDevice = '00000000-0000-4000-8000-000000000099'
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog()),
      loadPrefill: () =>
        Promise.resolve(
          seedShot({
            brewingDeviceId: otherDevice,
            roastDate: '2026-05-01',
          }),
        ),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    expect(await screen.findByDisplayValue('2026-05-01')).toBeTruthy()
    expect(
      screen.getByLabelText(
        selectTriggerA11yLabel(LABEL_DEVICE, SELECT_DEVICE),
      ),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Brewing Device, Linea Mini')).toBeNull()
    expect(screen.getByLabelText('Grinder, Niche Zero')).toBeTruthy()
  })

  it('does not apply prefill after a save has started', async () => {
    let resolvePrefill: (shot: ShotRow | null) => void = () => {}
    const pendingPrefill = new Promise<ShotRow | null>((resolve) => {
      resolvePrefill = resolve
    })
    const created: Array<ShotCreate> = []
    const keys: Array<string> = []
    let creates = 0
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog({ shots: [] })),
      loadPrefill: () => pendingPrefill,
      create: (input) =>
        Promise.resolve().then(() => {
          created.push(input)
          keys.push(input.idempotencyKey)
          creates += 1
          if (creates === 1) throw new Error('Network request failed')
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    await pickSelect(LABEL_GRINDER, GRINDER)
    await pickSelect(LABEL_DEVICE, ESP_DEVICE)
    await enterRecipe()
    await press(LOG)
    expect(created).toHaveLength(1)
    expect(created[0].roastDate).toBeNull()
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()

    await act(async () => {
      resolvePrefill(seedShot())
      await pendingPrefill
    })
    expect(screen.queryByDisplayValue('2026-05-01')).toBeNull()

    await press(LOG)
    expect(created).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(created[1].roastDate).toBeNull()
  })

  it('shows a retry when the last shot cannot be loaded and still lets you log one', async () => {
    const { api, created } = fakeApi(catalog(), {})
    const espresso: EspressoApi = {
      ...api,
      loadPrefill: () => Promise.reject(new Error('Network request failed')),
    }
    await render(<App auth={signedIn} espresso={espresso} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    expect(await screen.findByTestId(SHOT_FORM_PREFILL_ERROR_TEST_ID)).toBeTruthy()
    expect(screen.getByText(ERROR_PREFILL_FAILED)).toBeTruthy()
    expect(screen.getByRole('button', { name: TRY_AGAIN })).toBeTruthy()

    await pickSelect(LABEL_GRINDER, GRINDER)
    await pickSelect(LABEL_DEVICE, ESP_DEVICE)
    await enterRecipe()
    await press(LOG)
    expect(created).toHaveLength(1)
    expect(screen.getByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
  })

  it('does not prefill from Try again while a create is pending', async () => {
    let prefillCalls = 0
    let settleCreate: () => void = () => {}
    const pendingCreate = new Promise<void>((resolve) => {
      settleCreate = resolve
    })
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog({ shots: [] })),
      loadPrefill: () => {
        prefillCalls += 1
        return Promise.reject(new Error('Network request failed'))
      },
      create: () => pendingCreate,
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    expect(await screen.findByTestId(SHOT_FORM_PREFILL_ERROR_TEST_ID)).toBeTruthy()
    expect(prefillCalls).toBe(1)
    await pickSelect(LABEL_GRINDER, GRINDER)
    await pickSelect(LABEL_DEVICE, ESP_DEVICE)
    await enterRecipe()
    await press(LOG)
    await press(TRY_AGAIN)
    expect(prefillCalls).toBe(1)
    await act(async () => {
      settleCreate()
      await pendingCreate
    })
  })

  it('prefills from Try again after a failed save', async () => {
    let prefillCalls = 0
    const created: Array<ShotCreate> = []
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () => Promise.resolve(catalog({ shots: [] })),
      loadPrefill: () => {
        prefillCalls += 1
        if (prefillCalls === 1) {
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve(seedShot())
      },
      create: (input) =>
        Promise.resolve().then(() => {
          created.push(input)
          throw new Error('Network request failed')
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    expect(await screen.findByTestId(SHOT_FORM_PREFILL_ERROR_TEST_ID)).toBeTruthy()
    expect(prefillCalls).toBe(1)
    await pickSelect(LABEL_GRINDER, GRINDER)
    await pickSelect(LABEL_DEVICE, ESP_DEVICE)
    await enterRecipe()
    await press(LOG)
    expect(created).toHaveLength(1)
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()

    await press(TRY_AGAIN)
    expect(prefillCalls).toBe(2)
    expect(await screen.findByDisplayValue('2026-05-01')).toBeTruthy()
  })

  it('prefills a newly chosen coffee after a failed save', async () => {
    const created: Array<ShotCreate> = []
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        Promise.resolve(
          catalog({
            coffees: [
              { id: COFFEE, name: 'Ethiopia Guji' },
              { id: COFFEE_B, name: 'Colombia Huila' },
            ],
            grinders: [
              { id: GRINDER, name: 'Niche Zero' },
              { id: GRINDER_B, name: 'P64' },
            ],
          }),
        ),
      loadPrefill: (coffeeId) => {
        if (coffeeId === COFFEE_B) {
          return Promise.resolve(
            seedShot({
              coffeeId: COFFEE_B,
              coffeeName: 'Colombia Huila',
              roastDate: '2026-04-01',
              grinderId: GRINDER_B,
            }),
          )
        }
        return Promise.resolve(seedShot())
      },
      create: (input) =>
        Promise.resolve().then(() => {
          created.push(input)
          throw new Error('Network request failed')
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(created).toHaveLength(1)
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()

    await pickSelect(LABEL_COFFEE, COFFEE_B)
    expect(await screen.findByDisplayValue('2026-04-01')).toBeTruthy()
  })

  it('does not apply a pre-save prefill after a later coffee is chosen', async () => {
    let resolvePrefill: (shot: ShotRow | null) => void = () => {}
    const pendingPrefill = new Promise<ShotRow | null>((resolve) => {
      resolvePrefill = resolve
    })
    const created: Array<ShotCreate> = []
    const api: EspressoApi = {
      ...pagingFor(() => []),
      load: () =>
        Promise.resolve(
          catalog({
            coffees: [
              { id: COFFEE, name: 'Ethiopia Guji' },
              { id: COFFEE_B, name: 'Colombia Huila' },
            ],
            grinders: [
              { id: GRINDER, name: 'Niche Zero' },
              { id: GRINDER_B, name: 'P64' },
            ],
          }),
        ),
      loadPrefill: (coffeeId) => {
        if (coffeeId === COFFEE_B) {
          return Promise.resolve(
            seedShot({
              coffeeId: COFFEE_B,
              coffeeName: 'Colombia Huila',
              roastDate: '2026-04-01',
              grinderId: GRINDER_B,
            }),
          )
        }
        return pendingPrefill
      },
      create: (input) =>
        Promise.resolve().then(() => {
          created.push(input)
          throw new Error('Network request failed')
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickSelect(LABEL_COFFEE, COFFEE)
    await pickSelect(LABEL_GRINDER, GRINDER)
    await pickSelect(LABEL_DEVICE, ESP_DEVICE)
    await enterRecipe()
    await press(LOG)
    expect(created).toHaveLength(1)
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()

    await pickSelect(LABEL_COFFEE, COFFEE_B)
    expect(await screen.findByDisplayValue('2026-04-01')).toBeTruthy()

    await act(async () => {
      resolvePrefill(seedShot())
      await pendingPrefill
    })
    expect(screen.queryByDisplayValue('2026-05-01')).toBeNull()
    expect(screen.getByDisplayValue('2026-04-01')).toBeTruthy()
  })

  it('does not report the stored shot after a failed save is edited and retried', async () => {
    const stored: Array<ShotRow> = []
    const keys: Array<string> = []
    let creates = 0
    const api: EspressoApi = {
      ...pagingFor(() => stored),
      load: () =>
        Promise.resolve(catalog({ shots: [...stored], total: stored.length })),
      loadPrefill: () => Promise.resolve(seedShot()),
      create: (input) =>
        Promise.resolve().then(() => {
          keys.push(input.idempotencyKey)
          creates += 1
          if (creates === 1) {
            stored.push(
              seedShot({
                id: 'shot-old',
                dose: '18',
                grindSetting: GRIND_MARKER,
              }),
            )
            throw new Error('Network request failed')
          }
          if (input.idempotencyKey === keys[0] && input.dose !== '18') {
            throw Object.assign(
              new Error('This shot was already saved with different settings.'),
              { data: { code: TRPC_CONFLICT } },
            )
          }
          stored.push(
            seedShot({
              id: 'shot-new',
              dose: input.dose,
              grindSetting: GRIND_MARKER,
            }),
          )
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(screen.getByText(ERROR_SAVE_FAILED)).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText(LABEL_DOSE), '22')
    await press(LOG)

    expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(keys[1]).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(keys[0]).not.toBe(keys[1])
    expect(
      await screen.findByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-new`),
    ).toBeTruthy()
    expect(screen.getByText(/Dose 22g/)).toBeTruthy()
    expect(screen.getByText(/Dose 18g/)).toBeTruthy()
    expect(screen.queryByText('This shot was already saved with different settings.')).toBeNull()
  })

  it('keeps a newer first page when an older refresh arrives late', async () => {
    const pages: Array<
      (page: { items: Array<ShotRow>; total: number; nextCursor: ShotCursor | null }) => void
    > = []
    let shots = [seedShot({ id: 'shot-old', coffeeName: 'Old Guji' })]
    const initial = catalog({ shots })
    const api: EspressoApi = {
      load: () =>
        Promise.resolve({ ...initial, shots: [...shots], total: shots.length }),
      listShots: () =>
        new Promise((resolve) => {
          pages.push(resolve)
        }),
      loadPrefill: () => Promise.resolve(seedShot()),
      create: (input) =>
        Promise.resolve().then(() => {
          shots = [
            seedShot({
              id: `shot-${input.grindSetting}`,
              coffeeName: `Logged ${input.grindSetting}`,
              grindSetting: input.grindSetting,
              dose: input.dose,
              yield: input.yield,
              time: input.time,
            }),
            ...shots,
          ]
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    await openForm()
    await pickCoffee()
    await enterRecipe('first-save')
    await press(LOG)
    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe('second-save')
    await press(LOG)
    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(pages).toHaveLength(2)

    await act(async () => {
      pages[1]({
        items: [
          seedShot({ id: 'shot-second-save', coffeeName: 'Logged second-save' }),
          seedShot({ id: 'shot-first-save', coffeeName: 'Logged first-save' }),
        ],
        total: 2,
        nextCursor: null,
      })
      await Promise.resolve()
    })
    expect(await screen.findByText('Logged second-save')).toBeTruthy()

    await act(async () => {
      pages[0]({
        items: [
          seedShot({ id: 'shot-first-save', coffeeName: 'Logged first-save' }),
        ],
        total: 1,
        nextCursor: null,
      })
      await Promise.resolve()
    })
    expect(screen.getByText('Logged second-save')).toBeTruthy()
  })

  it('does not load the next page while a refresh is in flight', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    const cursors: Array<ShotCursor | null | undefined> = []
    let resolveRefresh:
      | ((page: {
          items: Array<ShotRow>
          total: number
          nextCursor: ShotCursor | null
        }) => void)
      | null = null
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(catalog({ shots: all.slice(0, 20), total: all.length })),
      listShots: (cursor) => {
        cursors.push(cursor)
        if (!cursor) {
          return new Promise((resolve) => {
            resolveRefresh = resolve
          })
        }
        return Promise.resolve(pageFrom(all, cursor))
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    expect(cursors).toEqual([undefined])

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(cursors).toEqual([undefined])
    expect(screen.queryByText('Coffee 20')).toBeNull()

    await act(async () => {
      resolveRefresh?.({
        items: all.slice(0, 20),
        total: all.length,
        nextCursor: pageCursor(all[19].id),
      })
      await Promise.resolve()
    })
    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    await waitFor(() => expect(cursors).toContain(pageCursor('shot-19')))
    expect(cursors).not.toContain('shot-19')
  })

  it('does not append a page started during the refresh-failure fallback load', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    const cursors: Array<ShotCursor | null | undefined> = []
    let resolveFallback: ((catalog: EspressoCatalog) => void) | null = null
    let loads = 0
    const replacement = catalog({
      shots: [
        seedShot({ id: 'shot-new', coffeeName: 'Logged new' }),
        ...all.slice(0, 19),
      ],
      total: 26,
    })
    const api: EspressoApi = {
      load: () => {
        loads += 1
        if (loads === 1) {
          return Promise.resolve(
            catalog({ shots: all.slice(0, 20), total: all.length }),
          )
        }
        return new Promise((resolve) => {
          resolveFallback = resolve
        })
      },
      listShots: (cursor) => {
        cursors.push(cursor)
        if (!cursor) return Promise.reject(new Error('Network request failed'))
        return Promise.resolve(pageFrom(all, cursor))
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(await screen.findByTestId(SHOT_LIST_TEST_ID)).toBeTruthy()
    await waitFor(() => expect(resolveFallback).toBeTruthy())
    expect(cursors).toEqual([undefined])

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(cursors).toEqual([undefined])

    await act(async () => {
      resolveFallback?.(replacement)
      await Promise.resolve()
    })
    expect(await screen.findByText('Logged new')).toBeTruthy()
    expect(screen.queryByText('Coffee 20')).toBeNull()
  })

  it('drops an in-flight next page after a refresh', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    let shots = all.slice(0, 20)
    let total = 25
    let resolveMore:
      | ((page: {
          items: Array<ShotRow>
          total: number
          nextCursor: ShotCursor | null
        }) => void)
      | null = null
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots, total })),
      listShots: (cursor) => {
        if (!cursor) {
          return Promise.resolve({
            items: shots,
            total,
            nextCursor:
              shots.length < total
                ? pageCursor(shots[shots.length - 1].id)
                : null,
          })
        }
        return new Promise((resolve) => {
          resolveMore = resolve
        })
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: () =>
        Promise.resolve().then(() => {
          shots = [
            seedShot({ id: 'shot-new', coffeeName: 'Logged new' }),
            ...all.slice(0, 19),
          ]
          total = 26
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()
    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(resolveMore).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(await screen.findByText('Logged new')).toBeTruthy()

    await act(async () => {
      resolveMore?.({
        items: [seedShot({ id: 'shot-20', coffeeName: 'Coffee 20' })],
        total: 25,
        nextCursor: null,
      })
      await Promise.resolve()
    })
    expect(screen.queryByText('Coffee 20')).toBeNull()
    expect(screen.getByText('Logged new')).toBeTruthy()
  })

  it('clears the load-more spinner when a refresh fails', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    let shots = all.slice(0, 20)
    let total = 25
    let resolveMore:
      | ((page: {
          items: Array<ShotRow>
          total: number
          nextCursor: ShotCursor | null
        }) => void)
      | null = null
    const api: EspressoApi = {
      load: () => Promise.resolve(catalog({ shots, total })),
      listShots: (cursor) => {
        if (!cursor) return Promise.reject(new Error('Network request failed'))
        return new Promise((resolve) => {
          resolveMore = resolve
        })
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: () =>
        Promise.resolve().then(() => {
          shots = [
            seedShot({ id: 'shot-new', coffeeName: 'Logged new' }),
            ...all.slice(0, 19),
          ]
          total = 26
        }),
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()
    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(resolveMore).toBeTruthy()
    expect(screen.getByLabelText(LOADING_MORE_SHOTS)).toBeTruthy()

    await openForm()
    await pickCoffee()
    await enterRecipe()
    await press(LOG)
    expect(await screen.findByText('Logged new')).toBeTruthy()
    expect(screen.queryByLabelText(LOADING_MORE_SHOTS)).toBeNull()
  })

  it('retries the next page from the list footer when loading more fails', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    const cursors: Array<ShotCursor | null | undefined> = []
    let attempts = 0
    const api: EspressoApi = {
      ...pagingFor(() => all),
      load: () =>
        Promise.resolve(
          catalog({ shots: all.slice(0, 20), total: all.length }),
        ),
      listShots: (cursor) => {
        cursors.push(cursor)
        attempts += 1
        if (attempts === 1) {
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve(pageFrom(all, cursor))
      },
      create: async () => {},
    }
    const view = await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()
    expect(screen.queryByText('Coffee 20')).toBeNull()

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(await screen.findByText(ERROR_LOAD_MORE_FAILED)).toBeTruthy()
    const loadMoreDest = process.env.VERIFY_MOBILE_LOAD_MORE_ARTIFACTS
    if (loadMoreDest) writeHostTreeArtifacts(view, loadMoreDest)
    expect(screen.queryByLabelText(LOADING_MORE_SHOTS)).toBeNull()
    expect(screen.queryByText('Coffee 20')).toBeNull()

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(cursors).toEqual([pageCursor('shot-19')])
    expect(screen.getByText(ERROR_LOAD_MORE_FAILED)).toBeTruthy()

    await press(TRY_AGAIN)
    await waitFor(() =>
      expect(cursors).toEqual([
        pageCursor('shot-19'),
        pageCursor('shot-19'),
      ]),
    )
    expect(screen.queryByText(ERROR_LOAD_MORE_FAILED)).toBeNull()
    expect(screen.queryByLabelText(LOADING_MORE_SHOTS)).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-20`)).toBeTruthy(),
    )
    for (const index of [20, 21, 22, 23, 24]) {
      expect(screen.getByTestId(`${SHOT_ROW_TEST_ID_PREFIX}shot-${index}`)).toBeTruthy()
      expect(screen.getByText(`Coffee ${index}`)).toBeTruthy()
    }
  })

  it('does not request the same next page twice before a render', async () => {
    const all = Array.from({ length: 25 }, (_, index) =>
      seedShot({
        id: `shot-${index}`,
        coffeeName: `Coffee ${index}`,
      }),
    )
    let attempts = 0
    let resolveFirst:
      | ((page: {
          items: Array<ShotRow>
          total: number
          nextCursor: ShotCursor | null
        }) => void)
      | null = null
    const api: EspressoApi = {
      load: () =>
        Promise.resolve(
          catalog({ shots: all.slice(0, 20), total: all.length }),
        ),
      listShots: (cursor) => {
        if (!cursor) {
          return Promise.resolve({
            items: all.slice(0, 20),
            total: all.length,
            nextCursor: pageCursor(all[19].id),
          })
        }
        attempts += 1
        if (attempts === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve
          })
        }
        return Promise.resolve({
          items: [all[21]],
          total: all.length,
          nextCursor: null,
        })
      },
      loadPrefill: () => Promise.resolve(seedShot()),
      create: async () => {},
    }
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Coffee 0')).toBeTruthy()

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    expect(attempts).toBe(1)
    expect(resolveFirst).toBeTruthy()
    expect(screen.queryByText(ERROR_LOAD_MORE_FAILED)).toBeNull()

    await act(async () => {
      resolveFirst?.({
        items: [all[20]],
        total: all.length,
        nextCursor: pageCursor(all[20].id),
      })
      await Promise.resolve()
    })
    expect(screen.queryByText(ERROR_LOAD_MORE_FAILED)).toBeNull()
    expect(attempts).toBe(1)

    await fireEvent(screen.getByTestId(SHOT_LIST_TEST_ID), 'onEndReached')
    await waitFor(() => expect(attempts).toBe(2))
    expect(screen.queryByText(ERROR_LOAD_MORE_FAILED)).toBeNull()
  })

  it('names same-name coffees with their roaster in the list', async () => {
    const { api } = fakeApi(
      catalog({
        shots: [
          seedShot({
            id: 'shot-sey',
            coffeeName: 'Ethiopia Guji · Sey',
          }),
          seedShot({
            id: 'shot-onyx',
            coffeeName: 'Ethiopia Guji · Onyx',
          }),
        ],
      }),
    )
    await render(<App auth={signedIn} espresso={api} />)
    expect(screen.getByText('Ethiopia Guji · Sey')).toBeTruthy()
    expect(screen.getByText('Ethiopia Guji · Onyx')).toBeTruthy()
  })
})
