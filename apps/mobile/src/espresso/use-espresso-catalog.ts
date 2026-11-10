import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiErrorMessage } from '../api-error'
import { ERROR_LOAD_FAILED, ERROR_SAVE_FAILED } from './copy'
import { runMaybePromise } from './types'
import type { EspressoApi, EspressoCatalog, ShotCreate } from './types'

type LoadStatus = 'loading' | 'loaded' | 'failed'

type State = {
  status: LoadStatus
  catalog: EspressoCatalog | null
  loadError: string | null
  busy: boolean
  saveError: string | null
  reloadToken: number
}

type Action =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; catalog: EspressoCatalog }
  | { type: 'loadFailed'; error: string }
  | { type: 'reload' }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; error: string }
  | { type: 'saveErrorCleared' }

const initial: State = {
  status: 'loading',
  catalog: null,
  loadError: null,
  busy: false,
  saveError: null,
  reloadToken: 0,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, status: 'loading', loadError: null }
    case 'loadSucceeded':
      return {
        ...state,
        status: 'loaded',
        catalog: action.catalog,
        loadError: null,
      }
    case 'loadFailed':
      return { ...state, status: 'failed', loadError: action.error }
    case 'reload':
      if (state.status === 'loading') return state
      return {
        ...state,
        status: 'loading',
        loadError: null,
        reloadToken: state.reloadToken + 1,
      }
    case 'saveStarted':
      if (state.busy) return state
      return { ...state, busy: true, saveError: null }
    case 'saveSucceeded':
      return { ...state, busy: false, saveError: null }
    case 'saveFailed':
      return { ...state, busy: false, saveError: action.error }
    case 'saveErrorCleared':
      return { ...state, saveError: null }
  }
}

export function useEspressoCatalog(api: EspressoApi) {
  const [state, dispatch] = useReducer(reducer, initial)
  const loadSeq = useRef(0)
  const saveInFlight = useRef(false)
  const saveSeq = useRef(0)

  const runLoad = useCallback(() => {
    const seq = ++loadSeq.current
    dispatch({ type: 'loadStarted' })
    runMaybePromise(
      () => api.load(),
      (catalog) => {
        // A newer load replaces this one; a late failure must not hide that catalog.
        if (seq !== loadSeq.current) return
        dispatch({ type: 'loadSucceeded', catalog })
      },
      (error) => {
        if (seq !== loadSeq.current) return
        dispatch({
          type: 'loadFailed',
          error: apiErrorMessage(error, ERROR_LOAD_FAILED),
        })
      },
    )
  }, [api])

  useEffect(() => {
    runLoad()
  }, [runLoad])

  useEffect(() => {
    if (state.reloadToken === 0) return
    runLoad()
  }, [state.reloadToken, runLoad])

  const reload = useCallback(() => {
    dispatch({ type: 'reload' })
  }, [])

  const save = useCallback(
    (input: ShotCreate, onSuccess?: () => void) => {
      if (saveInFlight.current) return
      saveInFlight.current = true
      const seq = ++saveSeq.current
      dispatch({ type: 'saveStarted' })
      runMaybePromise(
        () => api.create(input),
        () => {
          saveInFlight.current = false
          if (seq !== saveSeq.current) return
          dispatch({ type: 'saveSucceeded' })
          onSuccess?.()
          runLoad()
        },
        (error) => {
          saveInFlight.current = false
          if (seq !== saveSeq.current) return
          dispatch({
            type: 'saveFailed',
            error: apiErrorMessage(error, ERROR_SAVE_FAILED),
          })
        },
      )
    },
    [api, runLoad],
  )

  const clearSaveError = useCallback(() => {
    dispatch({ type: 'saveErrorCleared' })
  }, [])

  return {
    catalog: state.catalog,
    loading: state.status === 'loading',
    loadError: state.status === 'failed' ? state.loadError : null,
    busy: state.busy,
    saveError: state.saveError,
    reload,
    save,
    clearSaveError,
  }
}
