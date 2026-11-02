import type { IconBaseProps } from 'react-icons'
import { SiGoogledrive } from 'react-icons/si'
import { cn } from '@/lib/utils'

/**
 * The Drive's icon (the owner's pick, 2026-11-02): Google Drive's mark. It's a filled glyph that fills its whole box,
 * where the outline icons beside it (the sidebar's, the student page's tabs) leave a margin, so it's drawn a little
 * smaller than its box to look the same size. Its box stays the one given, so it lines up with them.
 */
export function DriveIcon({ className, ...props }: IconBaseProps) {
  return <SiGoogledrive aria-hidden {...props} className={cn('scale-[0.8]', className)} />
}
