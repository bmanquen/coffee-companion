import { useCallback, useEffect, useReducer, useRef } from 'react'
import { apiErrorMessage } from '../api-error'
import {
  ERROR_LOAD_FAILED,
  ERROR_LOAD_MORE_FAILED,
  ERROR_SAVE_FAILED,
} from './copy'
import type {
  EspressoApi,
  EspressoCatalog,
  ShotCreate,
  ShotCursor,
  ShotRow,
} from './types'

type LoadStatus = 'loading' | 'loaded' | 'failed'

type State = {
  status: LoadStatus
  catalog: EspressoCatalog | null
  loadError: string | null
  busy: boolean
  saveError: string | null
  loadingMore: boolean
  loadMoreError: string | null
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
  | { type: 'pageInvalidated' }
  | {
      type: 'shotsRefreshed'
      shots: Array<ShotRow>
      total: number
      nextCursor: ShotCursor | null
    }
  | {
      type: 'shotsAppended'
      shots: Array<ShotRow>
      total: number
      nextCursor: ShotCursor | null
    }
  | { type: 'loadMoreFailed'; error: string }

const initial: State = {
  status: 'loading',
  catalog: null,
  loadError: null,
  busy: false,
  saveError: null,
  loadingMore: false,
  loadMoreError: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loadStarted':
      return {
        ...state,
        status: 'loading',
        loadError: null,
        loadingMore: false,
        loadMoreError: null,
      }
    case 'loadSucceeded':
      return {
        ...state,
        status: 'loaded',
        catalog: action.catalog,
        loadError: null,
        loadingMore: false,
        loadMoreError: null,
      }
    case 'loadFailed':
      return {
        ...state,
        status: 'failed',
        loadError: action.error,
        loadingMore: false,
      }
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
      return { ...state, loadingMore: true, loadMoreError: null }
    case 'pageInvalidated':
      return { ...state, loadingMore: false, loadMoreError: null }
    case 'shotsRefreshed':
      if (!state.catalog) return { ...state, loadingMore: false }
      return {
        ...state,
        status: 'loaded',
        loadError: null,
        loadingMore: false,
        loadMoreError: null,
        catalog: {
          ...state.catalog,
          shots: action.shots,
          total: action.total,
          nextCursor: action.nextCursor,
        },
      }
    case 'shotsAppended': {
      if (!state.catalog) return { ...state, loadingMore: false }
      const seen = new Set(state.catalog.shots.map((shot) => shot.id))
      return {
        ...state,
        loadingMore: false,
        loadMoreError: null,
        catalog: {
          ...state.catalog,
          shots: [
            ...state.catalog.shots,
            ...action.shots.filter((shot) => !seen.has(shot.id)),
          ],
          total: action.total,
          nextCursor: action.nextCursor,
        },
      }
    }
    case 'loadMoreFailed':
      return { ...state, loadingMore: false, loadMoreError: action.error }
  }
}

export function useEspressoCatalog(api: EspressoApi, userId: string) {
  const [state, dispatch] = useReducer(reducer, initial)
  const catalogSeq = useRef(0)
  const saveInFlight = useRef(false)
  const activeUser = useRef(userId)
  const refreshSeq = useRef(0)
  const pageSeq = useRef(0)
  const refreshPending = useRef(false)
  const loadMoreInFlight = useRef(false)
  const catalogRef = useRef(state.catalog)
  catalogRef.current = state.catalog

  const invalidatePagedLoads = useCallback(() => {
    pageSeq.current += 1
    loadMoreInFlight.current = false
  }, [])

  const runLoad = useCallback(() => {
    const seq = ++catalogSeq.current
    invalidatePagedLoads()
    const forUser = userId
    dispatch({ type: 'loadStarted' })
    void api.load().then(
      (catalog) => {
        // A newer load or refresh replaces this one; a late failure must not
        // hide that catalog.
        if (seq !== catalogSeq.current || forUser !== activeUser.current) return
        dispatch({ type: 'loadSucceeded', catalog })
      },
      (error) => {
        if (seq !== catalogSeq.current || forUser !== activeUser.current) return
        dispatch({
          type: 'loadFailed',
          error: apiErrorMessage(error, ERROR_LOAD_FAILED),
        })
      },
    )
  }, [api, invalidatePagedLoads, userId])

  useEffect(() => {
    const previousUser = activeUser.current
    activeUser.current = userId
    if (previousUser !== userId) {
      saveInFlight.current = false
      catalogSeq.current += 1
      invalidatePagedLoads()
      refreshPending.current = false
      dispatch({ type: 'reset' })
    }
    runLoad()
    return () => {
      catalogSeq.current += 1
    }
  }, [invalidatePagedLoads, runLoad, userId])

  const loading = state.status === 'loading'
  const reload = useCallback(() => {
    if (!loading) runLoad()
  }, [loading, runLoad])

  const refreshFirstPage = useCallback(
    (forUser: string) => {
      const seq = ++refreshSeq.current
      invalidatePagedLoads()
      refreshPending.current = true
      dispatch({ type: 'pageInvalidated' })
      void api.listShots().then(
        (page) => {
          if (forUser !== activeUser.current || seq !== refreshSeq.current) {
            return
          }
          refreshPending.current = false
          // A catalog-backed refresh is newer than any in-flight full load.
          // With no catalog yet, leave catalogSeq alone so that load can settle.
          if (catalogRef.current) catalogSeq.current += 1
          dispatch({
            type: 'shotsRefreshed',
            shots: page.items,
            total: page.total,
            nextCursor: page.nextCursor,
          })
        },
        () => {
          if (forUser !== activeUser.current || seq !== refreshSeq.current) {
            return
          }
          refreshPending.current = false
          runLoad()
        },
      )
    },
    [api, invalidatePagedLoads, runLoad],
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
          refreshPending.current = true
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
      loadMoreInFlight.current ||
      refreshPending.current ||
      state.status === 'loading' ||
      state.loadingMore ||
      !catalog ||
      !catalog.nextCursor
    ) {
      return
    }
    const forUser = userId
    const seq = pageSeq.current
    const cursor = catalog.nextCursor
    loadMoreInFlight.current = true
    dispatch({ type: 'loadMoreStarted' })
    void api.listShots(cursor).then(
      (page) => {
        if (forUser !== activeUser.current || seq !== pageSeq.current) return
        loadMoreInFlight.current = false
        dispatch({
          type: 'shotsAppended',
          shots: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
        })
      },
      (error) => {
        if (forUser !== activeUser.current || seq !== pageSeq.current) return
        loadMoreInFlight.current = false
        dispatch({
          type: 'loadMoreFailed',
          error: apiErrorMessage(error, ERROR_LOAD_MORE_FAILED),
        })
      },
    )
  }, [api, state.catalog, state.loadingMore, state.status, userId])

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
    loadMoreError: state.loadMoreError,
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
