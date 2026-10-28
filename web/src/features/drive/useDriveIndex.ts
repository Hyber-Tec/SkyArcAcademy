import { type FirestoreError, onSnapshot } from 'firebase/firestore'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { type DriveIndex, type DriveStudent, buildDriveIndex } from '@shared/drive/model'
import type { DriveFile, DriveFolder } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStudentList } from '@/features/data/hooks'
import { branchCol } from '@/lib/firestore'

/**
 * The whole Drive, live, as one index shared by every screen that reads it (the Drive, the Trash, the Move dialog).
 * The Drive is two live lists, every folder and every file; a query reads every document it matches when it starts,
 * so the lists belong to the academy, not to a component: the first reader opens them, later readers share them,
 * and they stay open for a minute after the last one leaves, so moving between folders never starts over.
 */

const KEEP_OPEN_MS = 60_000

interface Snapshot {
  folders: WithId<DriveFolder>[] | null
  files: WithId<DriveFile>[] | null
  error: FirestoreError | null
}

const IDLE: Snapshot = Object.freeze({ folders: null, files: null, error: null }) as Snapshot

interface Store {
  refs: number
  timer: ReturnType<typeof setTimeout> | null
  listeners: Set<() => void>
  snapshot: Snapshot
  stop: (() => void)[]
}

const stores = new Map<string, Store>()

/** Pending server stamps read as estimates, so a folder just made sorts with the newest. */
const READ = { serverTimestamps: 'estimate' } as const

function open(branchId: string): Store {
  const store: Store = { refs: 0, timer: null, listeners: new Set(), snapshot: IDLE, stop: [] }
  const publish = (patch: Partial<Snapshot>) => {
    store.snapshot = { ...store.snapshot, ...patch }
    for (const l of [...store.listeners]) l()
  }
  const fail = (error: FirestoreError) => publish({ error })
  store.stop = [
    onSnapshot(branchCol(branchId, COL.driveFolders), (snap) => publish({ folders: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFolder) })) }), fail),
    onSnapshot(branchCol(branchId, COL.driveFiles), (snap) => publish({ files: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFile) })) }), fail),
  ]
  return store
}

function close(branchId: string, store: Store) {
  for (const stop of store.stop) stop()
  store.stop = []
  if (stores.get(branchId) === store) stores.delete(branchId)
}

function acquire(branchId: string): Store {
  let store = stores.get(branchId)
  // A refused listener isn't retried by Firestore: the next reader after everyone left starts fresh.
  if (store && store.snapshot.error && store.refs === 0) {
    close(branchId, store)
    store = undefined
  }
  if (!store) {
    store = open(branchId)
    stores.set(branchId, store)
  }
  if (store.timer) clearTimeout(store.timer)
  store.timer = null
  store.refs += 1
  return store
}

function release(branchId: string, store: Store) {
  store.refs = Math.max(0, store.refs - 1)
  if (store.refs > 0) return
  store.timer = setTimeout(() => store.refs === 0 && close(branchId, store), KEEP_OPEN_MS)
}

/** The raw lists (the Trash reads them; everything else reads the index). */
export function useDriveLists(enabled = true) {
  const { branchId } = useBranch()
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => undefined
      const store = acquire(branchId)
      store.listeners.add(onChange)
      return () => {
        store.listeners.delete(onChange)
        release(branchId, store)
      }
    },
    [branchId, enabled],
  )
  const getSnapshot = useCallback(() => (enabled ? (stores.get(branchId)?.snapshot ?? IDLE) : IDLE), [branchId, enabled])
  return useSyncExternalStore(subscribe, getSnapshot)
}

export type LiveDriveIndex = DriveIndex & { loading: boolean; error: FirestoreError | null; students: DriveStudent[] }

/** The Drive as one index (everything in it is visible: nothing in the Trash or inside a folder that is). */
export function useDriveIndex(): LiveDriveIndex {
  const snapshot = useDriveLists()
  const { data: studentList, loading: studentsLoading } = useStudentList()
  const students = useMemo<DriveStudent[]>(() => studentList.map((s) => ({ id: s.id, name: s.name, otherNames: s.otherNames ?? [], finished: s.status === 'finished' })), [studentList])
  return useMemo(() => {
    const index = buildDriveIndex(snapshot.folders, snapshot.files, students)
    const loading = !snapshot.error && (snapshot.folders === null || snapshot.files === null || studentsLoading)
    return { ...index, loading, error: snapshot.error, students }
  }, [snapshot, students, studentsLoading])
}
