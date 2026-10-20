import { AnimatePresence, motion } from 'motion/react'
import { IntroShell } from '@/site/kit/Intro'
import { DOT_CENTER, LogoArt } from '@/site/kit/LogoArt'
import { UI } from '@/site/kit/content'
import { useSite } from '@/site/kit/site'
import { T } from '../i18n'

/**
 * Option 3's intro (≈2.2 s, calm): on white, the reticle sweeps round, its ticks close in, the red dot lands
 * with a soft ripple, "SKY ARC" rises letter by letter and "SPORTS ACADEMY" settles under it: the official logo, exactly.
 * Then the white lifts away. The choreography is CSS (styles.css, `.academy-intro`).
 */
export function AcademyIntro({ show, onDone }: { show: boolean; onDone: () => void }) {
  const { t } = useSite()
  return (
    <AnimatePresence>
      {show ? (
        <motion.div key="intro" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}>
          <IntroShell onDone={onDone} duration={1850} className="academy-intro flex items-center justify-center bg-white" skipLabel={t(UI.skipIntro)}>
            <motion.div className="relative w-[min(560px,78vw)]" exit={{ scale: 0.98, y: -10 }} transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}>
              <LogoArt ink="#0A0A0A" sweep className="block h-auto w-full" />
              <svg viewBox="0 0 1128 541" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <circle className="ac-ripple" cx={DOT_CENTER.x} cy={DOT_CENTER.y} r={19.6} fill="none" stroke="#FB0202" strokeWidth={3} />
              </svg>
              <p className="ac-caption absolute inset-x-0 -bottom-14 text-center text-[13px] tracking-[0.18em] text-stone uppercase">{t(T.decorative)}</p>
            </motion.div>
          </IntroShell>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
