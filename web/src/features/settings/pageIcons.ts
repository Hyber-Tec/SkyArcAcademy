import type { IconType } from 'react-icons'
import { LuBell, LuBuilding2, LuCalendarCheck, LuCalendarDays, LuClock, LuFilePenLine, LuGlobe, LuGraduationCap, LuHistory, LuSparkles, LuUserPlus, LuWallet } from 'react-icons/lu'

/** Each page's icon on its tile and at the top of the page. */
export const PAGE_ICONS: Record<string, IconType> = {
  hours: LuClock,
  classes: LuCalendarDays,
  availability: LuCalendarCheck,
  pay: LuWallet,
  students: LuGraduationCap,
  signup: LuUserPlus,
  notices: LuBell,
  academy: LuBuilding2,
  website: LuGlobe,
  contract: LuFilePenLine,
  activity: LuHistory,
  ai: LuSparkles,
}

/** "Eastern time", from the zone's long name ("Eastern Daylight Time"); the zone's name when it has none. */
export function zoneWords(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    return name ? name.replace(/ (Standard|Daylight) Time$/, ' time') : timeZone
  } catch {
    return timeZone
  }
}
