import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiErrorMessage } from '../api-error'
import { ERROR_LOAD_FAILED, ERROR_SAVE_FAILED } from './copy'
import type { EspressoApi, EspressoCatalog, ShotCreate, ShotRow } from './types'

type LoadStatus = 'loading' | 'loaded' | 'failed'

type State = {
  status: LoadStatus
  catalog: EspressoCatalog | null
  loadError: string | null
  busy: boolean
  saveError: string | null
  loadingMore: boolean
}

type Action =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; catalog: EspressoCatalog }
  | { type: 'loadFailed'; error: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; error: string }
  | { type: 'saveErrorCleared' }
  | { type: 'reset' }
  | { type: 'loadMoreStarted' }
  | { type: 'shotsRefreshed'; shots: Array<ShotRow>; total: number }
  | { type: 'shotsAppended'; shots: Array<ShotRow>; total: number }
  | { type: 'loadMoreFailed' }

const initial: State = {
  status: 'loading',
  catalog: null,
  loadError: null,
  busy: false,
  saveError: null,
  loadingMore: false,
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
    case 'saveStarted':
      return { ...state, busy: true, saveError: null }
    case 'saveSucceeded':
      return { ...state, busy: false, saveError: null }
    case 'saveFailed':
      return { ...state, busy: false, saveError: action.error }
    case 'saveErrorCleared':
      return state.saveError ? { ...state, saveError: null } : state
    case 'reset':
      return initial
    case 'loadMoreStarted':
      return { ...state, loadingMore: true }
    case 'shotsRefreshed':
      if (!state.catalog) return state
      return {
        ...state,
        loadingMore: false,
        catalog: {
          ...state.catalog,
          shots: action.shots,
          total: action.total,
        },
      }
    case 'shotsAppended': {
      if (!state.catalog) return { ...state, loadingMore: false }
      const seen = new Set(state.catalog.shots.map((shot) => shot.id))
      return {
        ...state,
        loadingMore: false,
        catalog: {
          ...state.catalog,
          shots: [
            ...state.catalog.shots,
            ...action.shots.filter((shot) => !seen.has(shot.id)),
          ],
          total: action.total,
        },
      }
    }
    case 'loadMoreFailed':
      return { ...state, loadingMore: false }
  }
}

export function useEspressoCatalog(api: EspressoApi, userId: string) {
  const [state, dispatch] = useReducer(reducer, initial)
  const loadSeq = useRef(0)
  const saveInFlight = useRef(false)
  const activeUser = useRef(userId)
  const refreshSeq = useRef(0)
  const pageSeq = useRef(0)

  const runLoad = useCallback(() => {
    const seq = ++loadSeq.current
    const forUser = userId
    dispatch({ type: 'loadStarted' })
    void api.load().then(
      (catalog) => {
        // A newer load replaces this one; a late failure must not hide that catalog.
        if (seq !== loadSeq.current || forUser !== activeUser.current) return
        dispatch({ type: 'loadSucceeded', catalog })
      },
      (error) => {
        if (seq !== loadSeq.current || forUser !== activeUser.current) return
        dispatch({
          type: 'loadFailed',
          error: apiErrorMessage(error, ERROR_LOAD_FAILED),
        })
      },
    )
  }, [api, userId])

  useEffect(() => {
    const previousUser = activeUser.current
    activeUser.current = userId
    if (previousUser !== userId) {
      saveInFlight.current = false
      loadSeq.current += 1
      dispatch({ type: 'reset' })
    }
    runLoad()
    return () => {
      loadSeq.current += 1
    }
  }, [runLoad, userId])

  const loading = state.status === 'loading'
  const reload = useCallback(() => {
    if (!loading) runLoad()
  }, [loading, runLoad])

  const refreshFirstPage = useCallback(
    (forUser: string) => {
      const seq = ++refreshSeq.current
      pageSeq.current += 1
      void api.listShots(0).then(
        (page) => {
          if (forUser !== activeUser.current || seq !== refreshSeq.current) {
            return
          }
          dispatch({
            type: 'shotsRefreshed',
            shots: page.items,
            total: page.total,
          })
        },
        () => {
          if (forUser !== activeUser.current || seq !== refreshSeq.current) {
            return
          }
          runLoad()
        },
      )
    },
    [api, runLoad],
  )

  const save = useCallback(
    (input: ShotCreate, onSuccess?: () => void) => {
      if (saveInFlight.current) return
      saveInFlight.current = true
      const forUser = userId
      dispatch({ type: 'saveStarted' })
      void api.create(input).then(
        () => {
          saveInFlight.current = false
          if (forUser !== activeUser.current) return
          dispatch({ type: 'saveSucceeded' })
          onSuccess?.()
          refreshFirstPage(forUser)
        },
        (error) => {
          saveInFlight.current = false
          if (forUser !== activeUser.current) return
          dispatch({
            type: 'saveFailed',
            error: apiErrorMessage(error, ERROR_SAVE_FAILED),
          })
        },
      )
    },
    [api, refreshFirstPage, userId],
  )

  const loadMore = useCallback(() => {
    const catalog = state.catalog
    if (
      state.loadingMore ||
      !catalog ||
      catalog.shots.length >= catalog.total
    ) {
      return
    }
    const forUser = userId
    const seq = pageSeq.current
    const offset = catalog.shots.length
    dispatch({ type: 'loadMoreStarted' })
    void api.listShots(offset).then(
      (page) => {
        if (forUser !== activeUser.current || seq !== pageSeq.current) return
        dispatch({
          type: 'shotsAppended',
          shots: page.items,
          total: page.total,
        })
      },
      () => {
        if (forUser !== activeUser.current || seq !== pageSeq.current) return
        dispatch({ type: 'loadMoreFailed' })
      },
    )
  }, [api, state.catalog, state.loadingMore, userId])

  const loadPrefill = useCallback(
    (coffeeId: string) => api.loadPrefill(coffeeId),
    [api],
  )

  const clearSaveError = useCallback(() => {
    dispatch({ type: 'saveErrorCleared' })
  }, [])

  return {
    catalog: state.catalog,
    loading,
    loadingMore: state.loadingMore,
    loadError: state.status === 'failed' ? state.loadError : null,
    busy: state.busy,
    saveError: state.saveError,
    reload,
    loadMore,
    loadPrefill,
    save,
    clearSaveError,
  }
}
