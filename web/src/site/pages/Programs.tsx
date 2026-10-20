import { useEffect, useState } from 'react'
import { LuArrowRight, LuCheck, LuChevronRight, LuMessageSquare } from 'react-icons/lu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LEVELS, type Level, PROGRAMS, UI, l } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { A, useSite } from '@/site/kit/site'
import { BookButton, Container, SectionHead, TodoNote, btnOutline } from '../components/bits'
import { FinalCta, PageHero } from '../components/blocks'
import { LEVEL_FILL, LevelVisual } from '../components/LevelPath'
import { T } from '../i18n'

const HERO_PHOTO = l('Photo needed: a match on the range', '사진 필요: 사대 위의 경기')

function LevelText({ level, index }: { level: Level; index: number }) {
  const { t } = useSite()
  return (
    <div className="rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-9">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[13px] text-stone">{String(index + 1).padStart(2, '0')} / 04</span>
        <span className="rounded-full bg-warm-2 px-2.5 py-1 text-[12px] font-medium text-ink">{t(level.stage)}</span>
      </div>
      <h3 className="mt-5 text-[36px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[44px]">{t(level.name)}</h3>
      <p className="accent mt-3 text-[24px] leading-snug text-ink/85 sm:text-[27px]">{t(level.headline)}</p>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-stone">{t(level.description)}</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {[
          { title: PROGRAMS.labels.focus, items: level.focus },
          { title: PROGRAMS.labels.experience, items: level.experience },
        ].map((b) => (
          <div key={b.title.en}>
            <h4 className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(b.title)}</h4>
            <ul className="mt-3 space-y-2.5">
              {b.items.map((x) => (
                <li key={x.en} className="flex gap-2.5 text-[14.5px] leading-snug text-ink/85">
                  <span className="mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
                    <LuCheck className="size-2.5" aria-hidden="true" />
                  </span>
                  {t(x)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h4 className="mt-8 text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(PROGRAMS.labels.ranks)}</h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {level.ranks.map((r) => (
          <span key={r.name.en} className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold', r.track?.en === 'Precision' ? 'border border-dashed border-ink/30 text-ink' : LEVEL_FILL[index])}>
            {t(r.name)}
            <span className={cn('text-[12px] font-medium opacity-70', /\d/.test(r.range.en) && 'font-mono')}>{t(r.range)}</span>
          </span>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <BookButton />
        <A to="programs?section=tuition" className={btnOutline}>
          {t(UI.tuition)} <LuArrowRight className="size-4" aria-hidden="true" />
        </A>
      </div>
    </div>
  )
}

function Levels() {
  const { t, query } = useSite()
  const wanted = new URLSearchParams(query).get('level')
  const valid = LEVELS.some((l) => l.id === wanted)
  const [tab, setTab] = useState<string>(valid && wanted ? wanted : 'launchpad')
  useEffect(() => {
    if (valid && wanted) setTab(wanted)
  }, [valid, wanted])
  const index = Math.max(0, LEVELS.findIndex((l) => l.id === tab))
  return (
    <section id="levels" className="py-20 sm:py-24" aria-labelledby="levels-title">
      <Container>
        <SectionHead kicker={t(PROGRAMS.overview.title)} title={<span id="levels-title">{t(T.programsTitle)}</span>} text={t(PROGRAMS.overview.text)} />
        <Tabs value={tab} onValueChange={setTab} className="mt-10 gap-6">
          <div className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max gap-1 rounded-full border border-line bg-warm p-1.5 group-data-horizontal/tabs:h-auto">
              {LEVELS.map((lv, i) => (
                <TabsTrigger
                  key={lv.id}
                  value={lv.id}
                  className="h-auto min-h-11 rounded-full px-4 py-2 text-[14.5px] font-medium text-stone data-active:bg-white data-active:text-ink data-active:shadow-[0_1px_2px_rgb(10_10_10/0.08),0_0_0_1px_rgb(10_10_10/0.06)] sm:px-5"
                >
                  <span className="font-mono text-[11.5px] opacity-60">{String(i + 1).padStart(2, '0')}</span>
                  {t(lv.name)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-8">
            <div className="min-w-0">
              {LEVELS.map((lv, i) => (
                <TabsContent key={lv.id} value={lv.id} className="outline-none">
                  <LevelText level={lv} index={i} />
                </TabsContent>
              ))}
            </div>
            <LevelVisual index={index} className="max-lg:order-first lg:sticky lg:top-28" />
          </div>
        </Tabs>
        <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-stone">{t(PROGRAMS.overview.note)}</p>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-stone">{t(PROGRAMS.rankMap.text)}</p>
      </Container>
    </section>
  )
}

function Pathways() {
  const { t } = useSite()
  const ranks = [LEVELS[3].ranks.filter((r) => r.track?.en === 'Sporter'), LEVELS[3].ranks.filter((r) => r.track?.en === 'Precision')]
  return (
    <section id="pathways" className="py-20 sm:py-24" aria-labelledby="pathways-title">
      <Container>
        <SectionHead kicker={t(PROGRAMS.pathways.eyebrow)} title={<span id="pathways-title">{t(PROGRAMS.pathways.title)}</span>} text={t(PROGRAMS.pathways.text)} />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {PROGRAMS.pathways.items.map((p, i) => (
            <Reveal key={p.title.en} delay={i * 0.08} className="h-full">
              <article className={cn('flex h-full flex-col rounded-[28px] p-7 sm:p-9', i === 0 ? 'bg-warm' : 'bg-ink text-white')}>
                <span className={cn('self-start rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.1em] uppercase', i === 0 ? 'bg-white text-ink' : 'bg-white/10 text-white')}>
                  {String(i + 1).padStart(2, '0')} · {t(p.tag)}
                </span>
                <h3 className="mt-6 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{t(p.title)}</h3>
                <p className={cn('mt-3 text-[16px] leading-relaxed', i === 0 ? 'text-stone' : 'text-white/70')}>{t(p.text)}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-8">
                  {ranks[i].map((r) => (
                    <span key={r.name.en} className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-medium', i === 0 ? 'bg-white text-ink' : 'bg-white/10 text-white')}>
                      {t(r.name)} <span className={cn('text-[12px] opacity-70', /\d/.test(r.range.en) && 'font-mono')}>{t(r.range)}</span>
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Placement() {
  const { t } = useSite()
  return (
    <section id="placement" className="bg-warm py-20 sm:py-24" aria-labelledby="placement-title">
      <Container>
        <SectionHead kicker={t(PROGRAMS.placement.eyebrow)} title={<span id="placement-title">{t(PROGRAMS.placement.title)}</span>} />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {PROGRAMS.placement.steps.map((s, i) => (
            <li key={s.title.en} className="relative h-full">
              <Reveal delay={i * 0.08} className="flex h-full flex-col rounded-[26px] bg-white p-7 shadow-soft">
                <span className="font-mono text-[13px] text-stone">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-4 text-[26px] font-semibold tracking-tight text-ink">{t(s.title)}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-stone">{t(s.text)}</p>
                {i < 2 ? (
                  <span className="absolute top-1/2 -right-3.5 z-10 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-ink md:inline-flex" aria-hidden="true">
                    <LuChevronRight className="size-4" />
                  </span>
                ) : null}
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

function Tuition() {
  const { t } = useSite()
  return (
    <section id="tuition" className="py-20 sm:py-24" aria-labelledby="tuition-title">
      <Container>
        <SectionHead kicker={t(PROGRAMS.tuition.eyebrow)} title={<span id="tuition-title">{t(PROGRAMS.tuition.title)}</span>} text={t(PROGRAMS.tuition.text)} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEVELS.map((lv, i) => (
            <Reveal key={lv.id} delay={i * 0.06} className="h-full">
              <article className={cn('flex h-full flex-col rounded-[28px] border p-6 sm:p-7', i === 3 ? 'border-ink bg-ink text-white' : 'border-line bg-white shadow-soft')}>
                <span className={cn('text-[12px] font-semibold tracking-[0.12em] uppercase', i === 3 ? 'text-white/60' : 'text-stone')}>
                  {String(i + 1).padStart(2, '0')} · {t(lv.stage)}
                </span>
                <h3 className="mt-3 text-[26px] font-semibold tracking-tight">{t(lv.name)}</h3>
                <p className={cn('mt-5 border-y py-4 text-[17px] leading-snug font-semibold', i === 3 ? 'border-white/15' : 'border-line')}>{t(PROGRAMS.tuition.rate)}</p>
                <h4 className={cn('mt-5 text-[12px] font-semibold tracking-[0.12em] uppercase', i === 3 ? 'text-white/60' : 'text-stone')}>{t(PROGRAMS.labels.includes)}</h4>
                <ul className="mt-3 space-y-2.5">
                  {lv.includes.map((x) => (
                    <li key={x.en} className={cn('flex gap-2.5 text-[14.5px] leading-snug', i === 3 ? 'text-white/85' : 'text-ink/85')}>
                      <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {t(x)}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <A
                    to="contact?topic=tuition"
                    className={cn(
                      'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap transition focus-visible:ring-2 focus-visible:outline-none',
                      i === 3 ? 'bg-white text-ink hover:bg-white/90 focus-visible:ring-white/50' : 'border border-ink/15 text-ink hover:border-ink/35 hover:bg-warm focus-visible:ring-ink/25',
                    )}
                  >
                    <LuMessageSquare className="size-4" aria-hidden="true" /> {t(PROGRAMS.tuition.cta)}
                  </A>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="h-full">
            <div className="flex h-full flex-col justify-between gap-4 rounded-[26px] bg-warm p-6 sm:p-7">
              <p className="text-[15.5px] leading-relaxed text-ink/85">{t(PROGRAMS.tuition.note)}</p>
              <TodoNote>{t(PROGRAMS.tuition.todo)}</TodoNote>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="h-full">
            <div className="h-full rounded-[26px] border border-line bg-white p-6 sm:p-7">
              <h3 className="text-[20px] leading-snug font-semibold tracking-tight text-ink">{t(PROGRAMS.tuition.age.title)}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-stone">{t(PROGRAMS.tuition.age.text)}</p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

export function Programs() {
  const { t } = useSite()
  return (
    <>
      <PageHero kicker={t(PROGRAMS.eyebrow)} title={t(PROGRAMS.title)} text={t(PROGRAMS.text)} photo="programs.hero" photoLabel={HERO_PHOTO}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <BookButton />
          <A to="programs?section=tuition" className={btnOutline}>
            {t(UI.tuition)} <LuArrowRight className="size-4" aria-hidden="true" />
          </A>
        </div>
      </PageHero>
      <Levels />
      <Pathways />
      <Placement />
      <Tuition />
      <FinalCta />
    </>
  )
}
