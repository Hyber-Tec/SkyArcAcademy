import { getDoc } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LuDownload, LuFileX2, LuScanSearch, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { categoryOf, isViewableImage } from '@shared/drive/files'
import type { DriveFile } from '@shared/drive/types'
import { dateText } from '@shared/i18n'
import { COL } from '@shared/paths'
import { type Evaluation, POSITION_LABELS } from '@shared/shooting/evaluation'
import { ringRadiusMm } from '@shared/shooting/target'
import { FLAT, FLAT_SIZE, isFlatCard, savedReview, wasScanned } from '@shared/targets/flat'
import { type ReviewBull, holeRadiusOf } from '@shared/targets/review'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { downloadFile, fileBlob } from '@/features/drive/FilePreview'
import { FileGlyph } from '@/features/drive/parts'
import { CardPicture } from '@/features/scores/card/CardPicture'
import { SHOT_COLOR, scoreLabel, useTouchScreen } from '@/features/scores/card/parts'
import { prefersReducedMotion, shotOffset } from '@/features/scores/playback'
import { branchDocRef } from '@/lib/firestore'
import { useLang, useT } from '@/lib/lang'
import { cn } from '@/lib/utils'
import { positionIn } from './familyText'

/**
 * A result's original, for its family to look at and keep: the SIUS printout (PDF), or the paper card's picture. A card
 * scanned with the phone shows as the card with each bull's score drawn on it (read-only: nothing moves or saves here).
 * The file's record is read alone (families may read only a score's file in their own child's folder), then its bytes
 * through the Storage rules, never a download link. Whatever stops it (moved, in the Trash, removed) says so plainly.
 */

type Original =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; file: WithId<DriveFile> }
  | { status: 'other'; file: WithId<DriveFile> }
  | { status: 'card'; file: WithId<DriveFile>; image: ImageBitmap }
  | { status: 'view'; file: WithId<DriveFile>; url: string; as: 'pdf' | 'image' | 'video' }

function useOriginal(e: WithId<Evaluation>): Original {
  const { branchId } = useBranch()
  const scanned = wasScanned(e)
  const { fileId, studentId } = e
  const key = `${e.id}:${fileId}`
  const [state, setState] = useState<{ key: string; value: Original }>({ key: '', value: { status: 'loading' } })

  useEffect(() => {
    if (!fileId) return
    let alive = true
    let url: string | null = null
    const done = (value: Original) => {
      if (alive) setState({ key, value })
    }
    void (async () => {
      let file: WithId<DriveFile> | null = null
      try {
        const snap = await getDoc(branchDocRef(branchId, COL.driveFiles, fileId))
        const d = snap.exists() ? (snap.data() as DriveFile) : null
        // As the rules let a family read it (staff previewing see the same): a score's file in the student's folder.
        if (d && d.status === 'ready' && !d.trashed && !!d.evaluationId && d.studentId === studentId) file = { id: snap.id, ...d }
      } catch {
        // Not theirs to read any more (moved to another folder, its score deleted).
      }
      if (!file) return done({ status: 'missing' })
      const kind = categoryOf(file.kind)
      const card = scanned && isViewableImage(file.kind)
      if (!card && file.kind !== 'pdf' && !isViewableImage(file.kind) && kind !== 'video') return done({ status: 'other', file })
      try {
        const blob = await fileBlob(branchId, file.id)
        if (card) {
          const image = await createImageBitmap(blob)
          if (isFlatCard(image.width, image.height)) return done({ status: 'card', file, image })
        }
        url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: file.mime }))
        done({ status: 'view', file, url, as: file.kind === 'pdf' ? 'pdf' : kind === 'video' ? 'video' : 'image' })
      } catch {
        done({ status: 'failed', file })
      }
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [branchId, key, fileId, studentId, scanned])

  return state.key === key ? state.value : { status: 'loading' }
}

/** A plain message in the middle of the viewer. */
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-8 text-center" data-testid="original-note">
      <LuFileX2 className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-balance text-muted-foreground">{children}</p>
    </div>
  )
}

export function ResultOriginal({ e, onClose }: { e: WithId<Evaluation>; onClose: () => void }) {
  const { branchId } = useBranch()
  const lang = useLang()
  const t = useT()
  const original = useOriginal(e)
  const file = 'file' in original ? original.file : null
  const sius = e.source === 'sius'
  const title =
    lang === 'ko'
      ? `${positionIn(e.position, 'ko')} ${sius ? 'SIUS 결과' : '종이 표적지'} · ${dateText(e.dateKey, 'medium', 'ko')}`
      : `${POSITION_LABELS[e.position]} ${sius ? 'SIUS result' : 'paper card'} · ${formatDateKey(e.dateKey, 'medium')}`

  const download = async () => {
    if (!file) return
    try {
      await downloadFile(branchId, file)
    } catch {
      toast.error(t('The file couldn’t be downloaded', '파일을 내려받지 못했어요'), { description: t('Try again in a moment.', '잠시 후 다시 시도해 주세요.') })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        // No focus ring on Download as it opens; Escape closes it from the start.
        onOpenAutoFocus={(ev) => ev.preventDefault()}
        className="flex h-[92svh] max-w-[min(1100px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]"
        data-testid="result-original"
      >
        <div className="flex items-center gap-1.5 border-b px-3 py-2.5 sm:gap-3 sm:px-4">
          <FileGlyph kind={file?.kind ?? (sius ? 'pdf' : 'png')} className="size-6" />
          <div className="min-w-0 flex-1 leading-tight">
            <DialogTitle className="truncate text-sm font-semibold">{title}</DialogTitle>
            <DialogDescription className="truncate text-xs">{[e.studentName, file?.name].filter(Boolean).join(' · ')}</DialogDescription>
          </div>
          {file ? (
            // Phones: the icon alone, so the title keeps its room.
            <Button variant="outline" size="sm" aria-label={t('Download', '다운로드')} onClick={() => void download()} data-testid="original-download">
              <LuDownload />
              <span className="hidden sm:inline">{t('Download', '다운로드')}</span>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label={t('Close', '닫기')} onClick={onClose}>
            <LuX />
          </Button>
        </div>
        <div className={cn('min-h-0 flex-1 bg-muted/40', original.status === 'card' ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-hidden')}>
          {original.status === 'loading' ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : original.status === 'missing' ? (
            <Note title={t('The original isn’t available', '원본을 볼 수 없어요')}>
              {t('It may have been moved or removed from the academy’s files. The scores stay here.', '아카데미 파일에서 옮겨졌거나 지워졌을 수 있어요. 점수는 그대로 여기에 있어요.')}
            </Note>
          ) : original.status === 'failed' ? (
            <Note title={t('The file couldn’t be opened', '파일을 열지 못했어요')}>{t('Check your connection and try again.', '인터넷 연결을 확인하고 다시 시도해 주세요.')}</Note>
          ) : original.status === 'other' ? (
            <Note title={t('This kind of file can’t be shown here', '여기서는 이 파일을 볼 수 없어요')}>{t('Download it to open it.', '다운로드해서 열어 주세요.')}</Note>
          ) : original.status === 'card' ? (
            <CardView image={original.image} e={e} />
          ) : original.as === 'pdf' ? (
            <iframe title={original.file.name} src={original.url} className="size-full border-0 bg-white" />
          ) : original.as === 'video' ? (
            <div className="flex h-full items-center justify-center">
              <video src={original.url} controls className="max-h-full max-w-full" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <img src={original.url} alt={title} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A scanned card, read-only: the card big with each bull's score drawn on it (zoom and move it), the total, and each
 * bull as a tile; picking a bull (on the card or its tile) rings it and shows it up close with how far its shot is from
 * the centre. On a wide screen the card fills the left and the rest sits beside it; on a phone, under it.
 */
function CardView({ image, e }: { image: ImageBitmap; e: WithId<Evaluation> }) {
  const t = useT()
  const review = useMemo(() => savedReview(e), [e])
  const touch = useTouchScreen()
  const [bull, setBull] = useState<number | null>(null)
  const closeUp = useRef<HTMLDivElement>(null)
  // A bull picked (on the card, or its tile) brings its close-up into view: under the card on a phone.
  useEffect(() => {
    if (bull !== null) closeUp.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [bull])
  if (!review) return null
  const chosen = review.bulls.find((b) => b.n === bull) ?? null
  const most = review.shotsPerBull * review.bulls.length * 10

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:h-full lg:flex-row" data-testid="card-view">
      <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:justify-center">
        <CardPicture
          image={image}
          review={review}
          selected={bull}
          onBull={(n) => setBull((b) => (b === n ? null : n))}
          label={t(
            'The card with each bull’s score. Choose a bull to see it up close; zoom with the wheel, a pinch, or the + and − keys, and 0 to see it whole.',
            '표적별 점수가 표시된 표적지예요. 표적을 고르면 크게 볼 수 있어요. 휠, 두 손가락, + − 키로 확대하고 0을 누르면 전체가 보여요.',
          )}
          className="mx-auto w-full lg:h-full lg:w-auto lg:max-w-full"
          style={{ aspectRatio: `${FLAT_SIZE.width} / ${FLAT_SIZE.height}` }}
        />
      </div>
      <aside className="space-y-4 lg:w-80 lg:shrink-0 lg:overflow-y-auto" aria-label={t('The card’s scores', '표적지 점수')}>
        <section className="rounded-xl border bg-card p-4">
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl leading-none font-semibold tabular-nums" data-testid="card-view-total">
              {e.total}
            </span>
            <span className="text-muted-foreground tabular-nums">/ {most}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`${e.shots} shots${e.groupMm !== null ? ` · group ${e.groupMm} mm` : ''}`, `${e.shots}발${e.groupMm !== null ? ` · 탄착군 ${e.groupMm} mm` : ''}`)}
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label={t('The bulls', '표적별 점수')}>
            {review.bulls.map((b) => {
              const values = b.shots.map((s) => s.value)
              const label = scoreLabel(values)
              return (
                <button
                  key={b.n}
                  type="button"
                  aria-pressed={bull === b.n}
                  aria-label={t(`Bull ${b.n}: ${values.length ? values.join(' and ') : 'no shot found, a 0'}. Show it up close`, `${b.n}번 표적: ${values.length ? values.join(', ') : '찾은 발이 없어 0점'}. 크게 보기`)}
                  onClick={() => setBull((x) => (x === b.n ? null : b.n))}
                  className={cn(
                    'flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    bull === b.n && 'bg-muted ring-2 ring-foreground/60',
                  )}
                  data-testid={`card-view-bull-${b.n}`}
                >
                  <span className="text-[10px] leading-none text-muted-foreground">{b.n}</span>
                  <span className={cn('max-w-full truncate leading-tight font-semibold tabular-nums', label.length > 4 ? 'text-sm' : 'text-lg')}>{label}</span>
                </button>
              )
            })}
          </div>
        </section>
        <div ref={closeUp} className="scroll-mb-3">
          {chosen ? (
            <BullUpClose image={image} bull={chosen} perBull={review.shotsPerBull} holeRadius={review.holeRadius} />
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <LuScanSearch className="mt-0.5 size-4 shrink-0" aria-hidden />
              {touch
                ? t('Tap a bull to see it up close. Pinch the card to zoom.', '표적을 누르면 크게 볼 수 있어요. 두 손가락으로 표적지를 확대해 보세요.')
                : t('Click a bull to see it up close. Scroll on the card to zoom, and drag to look around.', '표적을 누르면 크게 볼 수 있어요. 표적지 위에서 스크롤하면 확대되고, 끌어서 둘러볼 수 있어요.')}
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

/** How much of the card the close-up shows around a bull's centre, in millimetres: ring 1 and a little beyond. */
const CLOSE_MM = ringRadiusMm(1) + 2.5
const CLOSE_PX = 168

/** One bull up close, from the card's picture: its shot ringed where the scan (or a coach) placed it, at its hole's size, and its score. */
function BullUpClose({ image, bull, perBull, holeRadius }: { image: CanvasImageSource; bull: ReviewBull; perBull: number; holeRadius?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(CLOSE_PX * dpr)
    canvas.height = Math.round(CLOSE_PX * dpr)
    const half = CLOSE_MM * FLAT.pxPerMm
    const s = canvas.width / (2 * half)
    ctx.setTransform(s, 0, 0, s, -(bull.center.x - half) * s, -(bull.center.y - half) * s)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, FLAT_SIZE.width, FLAT_SIZE.height)
    for (const shot of bull.shots) {
      if (shot.x === null || shot.y === null) continue
      const x = bull.center.x + shot.x * FLAT.pxPerMm
      const y = bull.center.y - shot.y * FLAT.pxPerMm
      ctx.beginPath()
      ctx.arc(x, y, holeRadiusOf(shot, { holeRadius }) * FLAT.pxPerMm, 0, Math.PI * 2)
      ctx.lineWidth = (2.5 * dpr) / s
      ctx.strokeStyle = SHOT_COLOR
      ctx.stroke()
    }
  }, [image, bull, holeRadius])

  const lang = useLang()
  const t = useT()
  const values = bull.shots.map((s) => s.value)
  const missing = Math.max(0, perBull - bull.shots.length)
  return (
    <section className="flex items-start gap-4 rounded-xl border bg-card p-3" aria-label={t(`Bull ${bull.n} up close`, `${bull.n}번 표적 크게 보기`)} data-testid="bull-up-close">
      <canvas
        ref={ref}
        style={{ width: CLOSE_PX, height: CLOSE_PX }}
        className="shrink-0 rounded-lg border bg-white"
        role="img"
        aria-label={t(`Bull ${bull.n} on the card, its ${bull.shots.length > 1 ? 'shots' : 'shot'} ringed in green`, `표적지의 ${bull.n}번 표적이에요. 맞은 자리는 초록 원으로 표시했어요`)}
      />
      <div className="min-w-0 pt-0.5">
        <p className="text-xs text-muted-foreground">{t(`Bull ${bull.n}`, `${bull.n}번 표적`)}</p>
        <p className="text-3xl leading-tight font-semibold tabular-nums">{scoreLabel(values)}</p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {bull.shots.map((shot, i) => {
            const at = shot.x !== null && shot.y !== null ? shotOffset({ x: shot.x, y: shot.y }, lang) : null
            const centre = at && (at.words === 'centre' || at.words === '정중앙')
            return (
              <li key={i}>
                {bull.shots.length > 1 ? `${shot.value}: ` : ''}
                {at
                  ? centre
                    ? t('right in the centre', '정중앙')
                    : t(`${at.mm} mm from the centre, ${at.words}`, `중심에서 ${at.words} ${at.mm} mm`)
                  : t('typed in, no place on the card', '직접 입력해서 표적지에 자리가 없어요')}
              </li>
            )
          })}
          {missing ? (
            <li>
              {lang === 'ko'
                ? missing === perBull
                  ? '여기서 찾은 발이 없어서 0점으로 계산해요.'
                  : `${missing}발을 찾지 못해서 0점으로 계산해요.`
                : `${missing === perBull ? 'No shot found here' : `${missing === 1 ? 'One shot' : `${missing} shots`} not found`}: ${missing === 1 ? 'it counts' : 'they count'} as 0.`}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  )
}
