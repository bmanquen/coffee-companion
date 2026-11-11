import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { App } from '../App'
import { SignedInHome } from '../auth/SignedInHome'
import { writeHostTreeArtifacts } from '../test/host-tree'
import {
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
const ADA_ID = 'user-ada'
const ALAN_ID = 'user-alan'
const GRIND_MARKER = 'verify-grind-7'
const LOGGED_RECIPE = `Grind ${GRIND_MARKER} · Dose 18g · Yield 36g · Ratio 1:2 · Time 30s`
const TRPC_FORBIDDEN = 'FORBIDDEN'
const TRPC_INTERNAL = 'INTERNAL_SERVER_ERROR'

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
    load: () =>
      Promise.resolve().then(() => {
        const next = { ...initial, shots: [...shots] }
        return hooks.load ? hooks.load(next) : next
      }),
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
      load: () => Promise.resolve({ ...initial, shots: [...shots] }),
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
      load: () => Promise.resolve({ ...initial, shots: [...shots] }),
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

  it('does not apply a previous user save after the signed-in user changes', async () => {
    let resolveCreate: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    let owner = ADA_ID
    let loads = 0
    const api: EspressoApi = {
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
})
