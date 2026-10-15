import { doc } from 'firebase/firestore'
import { useMemo } from 'react'
import { ACADEMY_ID } from '@shared/academy'
import { COL, DOC, ROOT } from '@shared/paths'
import type { BranchPublicProfile } from '@shared/types'
import { db } from './firebase'
import { useDoc } from './firestore'

/** The academy's world-readable profile (name, logo, sign-up settings). */
export function usePublicProfile() {
  const ref = useMemo(() => doc(db, ROOT.branches, ACADEMY_ID, COL.public, DOC.publicProfile), [])
  return useDoc<BranchPublicProfile>(ref)
}

/** Whether people can request access on the academy's sign-up page. */
export function signupOpen(profile: BranchPublicProfile | null | undefined): boolean {
  return !!profile && profile.status === 'active' && profile.signupEnabled && profile.signupRoles.length > 0
}
