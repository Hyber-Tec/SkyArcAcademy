import { type FirestoreError, onSnapshot, query, where } from 'firebase/firestore'
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
 *
 * Owners and admins read everything; a coach (or an admin looking as one) asks for what's everyone's on staff
 * (`access == 'staff'`), the only lists the rules give coaches: folders only owners and admins see, and what's in
 * them, never reach their screen.
 */

/** Which lists: everything (owners and admins), or what's everyone's on staff (coaches). */
type Scope = 'all' | 'staff'

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

function open(branchId: string, scope: Scope): Store {
  const store: Store = { refs: 0, timer: null, listeners: new Set(), snapshot: IDLE, stop: [] }
  const publish = (patch: Partial<Snapshot>) => {
    store.snapshot = { ...store.snapshot, ...patch }
    for (const l of [...store.listeners]) l()
  }
  const fail = (error: FirestoreError) => publish({ error })
  const list = (col: typeof COL.driveFolders | typeof COL.driveFiles) => (scope === 'staff' ? query(branchCol(branchId, col), where('access', '==', 'staff')) : branchCol(branchId, col))
  store.stop = [
    onSnapshot(list(COL.driveFolders), (snap) => publish({ folders: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFolder) })) }), fail),
    onSnapshot(list(COL.driveFiles), (snap) => publish({ files: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFile) })) }), fail),
  ]
  return store
}

function close(key: string, store: Store) {
  for (const stop of store.stop) stop()
  store.stop = []
  if (stores.get(key) === store) stores.delete(key)
}

function acquire(branchId: string, scope: Scope): Store {
  const key = `${branchId}|${scope}`
  let store = stores.get(key)
  // A refused listener isn't retried by Firestore: the next reader after everyone left starts fresh.
  if (store && store.snapshot.error && store.refs === 0) {
    close(key, store)
    store = undefined
  }
  if (!store) {
    store = open(branchId, scope)
    stores.set(key, store)
  }
  if (store.timer) clearTimeout(store.timer)
  store.timer = null
  store.refs += 1
  return store
}

function release(key: string, store: Store) {
  store.refs = Math.max(0, store.refs - 1)
  if (store.refs > 0) return
  store.timer = setTimeout(() => store.refs === 0 && close(key, store), KEEP_OPEN_MS)
}

/** The raw lists (the Trash reads them; everything else reads the index): what the viewer's role may read. */
export function useDriveLists(enabled = true) {
  const { branchId, isAdmin } = useBranch()
  const scope: Scope = isAdmin ? 'all' : 'staff'
  const key = `${branchId}|${scope}`
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => undefined
      const store = acquire(branchId, scope)
      store.listeners.add(onChange)
      return () => {
        store.listeners.delete(onChange)
        release(key, store)
      }
    },
    [branchId, scope, key, enabled],
  )
  const getSnapshot = useCallback(() => (enabled ? (stores.get(key)?.snapshot ?? IDLE) : IDLE), [key, enabled])
  return useSyncExternalStore(subscribe, getSnapshot)
}

export type LiveDriveIndex = DriveIndex & { loading: boolean; error: FirestoreError | null; students: DriveStudent[] }

/**
 * The Drive as one index (everything in it is visible: nothing in the Trash or inside a folder that is). Owners and
 * admins see a Contracts folder in every student's folder, a stand-in until something is filed in it.
 */
export function useDriveIndex(): LiveDriveIndex {
  const { isAdmin } = useBranch()
  const snapshot = useDriveLists()
  const { data: studentList, loading: studentsLoading } = useStudentList()
  const students = useMemo<DriveStudent[]>(() => studentList.map((s) => ({ id: s.id, name: s.name, otherNames: s.otherNames ?? [], finished: s.status === 'finished' })), [studentList])
  return useMemo(() => {
    const index = buildDriveIndex(snapshot.folders, snapshot.files, students, { contractsFolders: isAdmin })
    const loading = !snapshot.error && (snapshot.folders === null || snapshot.files === null || studentsLoading)
    return { ...index, loading, error: snapshot.error, students }
  }, [snapshot, students, studentsLoading, isAdmin])
}
