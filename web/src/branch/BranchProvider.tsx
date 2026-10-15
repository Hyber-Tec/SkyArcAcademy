import { doc } from 'firebase/firestore'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import { type Portal, type RestrictablePage, type Role, isAdminRole, portalOf } from '@shared/roles'
import { type BusinessRules, resolveBusinessRules } from '@shared/settings/businessRules'
import type { BranchSettings } from '@shared/settings/defaults'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch, Member, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { NoBranchAccess } from './NoBranchAccess'
import type { Actor } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'

/**
 * What an owner or admin is previewing ("View the app as"). It only changes what is shown: their access, and the
 * actor recorded in the audit log, stay their own.
 */
export type ViewAs =
  | { role: 'admin' }
  | { role: 'coach'; staffId: string; name: string }
  | { role: 'parent'; studentIds: string[]; name: string }
  | { role: 'student'; studentId: string; name: string }

export interface BranchContextValue {
  /** Always the academy (`ACADEMY_ID`): the internal ID its data lives under. */
  branchId: string
  branch: WithId<Branch>
  settings: BranchSettings
  /** Core rules the owner sets (pay model, students per coach at once). */
  rules: BusinessRules
  timezone: string
  /** The signed-in person's member doc. */
  member: WithId<Member> | null
  /** The role shown: the member's own, or the previewed one. */
  role: Role
  portal: Portal
  isAdmin: boolean
  isOwner: boolean
  /** The signed-in person is an owner or admin, so they may preview the app as someone else. */
  canPreview: boolean
  staffId: string | null
  /** Student: their own record. */
  studentId: string | null
  /** Parent: their children. */
  studentIds: string[]
  can: (page: RestrictablePage) => boolean
  actor: Actor
  viewAs: ViewAs | null
  setViewAs: (next: ViewAs | null) => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

const VIEW_AS_KEY = 'skyarc:view-as'

function loadViewAs(): ViewAs | null {
  try {
    const raw = window.sessionStorage.getItem(VIEW_AS_KEY)
    return raw ? (JSON.parse(raw) as ViewAs) : null
  } catch {
    return null
  }
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const branchId = ACADEMY_ID
  const { user, email, ready, signOut } = useAuth()

  const branchState = useDoc<Branch>(doc(db, ROOT.branches, branchId))
  const memberState = useDoc<Member>(email ? doc(db, ROOT.branches, branchId, COL.members, email) : null)

  // Preview state lives in this browser tab only.
  const [preview, setPreview] = useState<ViewAs | null>(loadViewAs)
  const setViewAs = useCallback((next: ViewAs | null) => {
    setPreview(next)
    try {
      if (next) window.sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(next))
      else window.sessionStorage.removeItem(VIEW_AS_KEY)
    } catch {
      // Storage can be unavailable; the preview still applies until the page reloads.
    }
  }, [])

  // `blocked`: no role to show here. `paused`: the member's access was turned off; `none`: not a member.
  const { value, blocked } = useMemo<{ value: BranchContextValue | null; blocked: 'paused' | 'none' | null }>(() => {
    const branch = branchState.data
    if (!branch || !user || !email) return { value: null, blocked: null }
    const member = memberState.data && memberState.data.status === 'active' ? memberState.data : null
    const ownRole = member?.role ?? null
    const canPreview = isAdminRole(ownRole)
    const viewAs = canPreview ? preview : null
    const role: Role | null = viewAs ? viewAs.role : ownRole
    const restrictions = member?.restrictions ?? []
    const actor: Actor = {
      uid: user.uid,
      email,
      name: member?.displayName || user.displayName || email,
      role: ownRole ?? 'student',
    }
    const ctx: BranchContextValue = {
      branchId,
      branch,
      settings: resolveSettings(branch.settings),
      rules: resolveBusinessRules(branch.businessRules),
      timezone: branch.timezone || 'America/New_York',
      member,
      role: role ?? 'student',
      portal: role ? portalOf(role) : 'student',
      isAdmin: isAdminRole(role),
      isOwner: !viewAs && ownRole === 'owner',
      canPreview,
      staffId: viewAs ? (viewAs.role === 'coach' ? viewAs.staffId : null) : (member?.staffId ?? null),
      studentId: viewAs ? (viewAs.role === 'student' ? viewAs.studentId : null) : (member?.studentId ?? null),
      studentIds: viewAs ? (viewAs.role === 'parent' ? viewAs.studentIds : []) : (member?.studentIds ?? []),
      can: (page) => ownRole === 'owner' || !restrictions.includes(page),
      actor,
      viewAs,
      setViewAs,
    }
    return { value: ctx, blocked: role !== null ? null : memberState.data ? 'paused' : 'none' }
  }, [branchState.data, memberState.data, user, email, branchId, preview, setViewAs])

  // The academy's accent color as a CSS variable for brand marks.
  const accent = value?.branch.branding?.accentColor ?? null
  useEffect(() => {
    const root = document.documentElement
    if (accent) root.style.setProperty('--brand', accent)
    else root.style.removeProperty('--brand')
    return () => {
      root.style.removeProperty('--brand')
    }
  }, [accent])

  // Until the account check is done, nothing here is known: never guess.
  if (!ready || branchState.loading || memberState.loading) return <FullPageSpinner />
  if (!value) {
    if (branchState.error?.code === 'permission-denied' || !branchState.data) return <NoBranchAccess />
    return <FullPageMessage title="The academy couldn’t be loaded" description="Check your connection and try again." />
  }
  if (blocked === 'none') return <NoBranchAccess />
  if (blocked === 'paused') {
    return (
      <FullPageMessage
        title="Your access is paused"
        description={`The account ${email ?? ''} is paused at ${value.branch.name}. Ask the academy to restore your access.`}
        actions={[{ label: 'Use another account', variant: 'outline', onClick: () => void signOut() }]}
      />
    )
  }
  return <BranchContext value={value}>{children}</BranchContext>
}

export function useBranch(): BranchContextValue {
  const ctx = use(BranchContext)
  if (!ctx) throw new Error('useBranch must be used inside <BranchProvider>')
  return ctx
}

/** The academy's context on its signed-in pages, otherwise null. */
export function useOptionalBranch(): BranchContextValue | null {
  return use(BranchContext)
}
