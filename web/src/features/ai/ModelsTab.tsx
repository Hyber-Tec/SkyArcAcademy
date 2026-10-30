import { useEffect, useRef, useState } from 'react'
import { LuChevronDown, LuCircleAlert, LuFlaskConical, LuKeyRound, LuTrash2 } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ResolvedAiConfig } from '@shared/ai/config'
import { formatPrice, formatTokens, formatUsd, priceWords } from '@shared/ai/cost'
import { AI_MODELS, AI_MODELS_CHECKED, AI_PROVIDER_INFO, cleanModelId, findModel, isModelId, modelsOf, priceOf, recommendedModel, thinkingLevelsOf } from '@shared/ai/models'
import { type AiSettingsInput, checkAiSettings } from '@shared/ai/settings'
import { AI_FEATURES, AI_FEATURE_INFO, AI_PROVIDERS, type AiFeature, type AiFeatureConfig, type AiProvider, THINKING_LABELS, type ThinkingLevel } from '@shared/ai/types'
import { formatDateKey } from '@shared/time'
import { useConfirm } from '@/components/app/useConfirm'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { type AiTestResult, callError, saveAiSettings, testAiModel } from './api'

/** AI → Models: each feature's provider, model, thinking level and switch; the limits; the prices typed in. */
export function ModelsTab({ config }: { config: ResolvedAiConfig }) {
  return (
    <div className="max-w-4xl space-y-6">
      {AI_FEATURES.map((f) => (
        <FeatureCard key={f} feature={f} config={config} />
      ))}
      <LimitsCard config={config} />
      <PricesCard config={config} />
    </div>
  )
}

const OTHER = '__other__'
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The level to keep when the model changes: the same if it takes it, else low, else its first, else Default. */
function levelFor(provider: AiProvider, model: string, want: ThinkingLevel | null): ThinkingLevel | null {
  const levels = thinkingLevelsOf(provider, model)
  if (!levels.length) return null
  if (want === null || levels.includes(want)) return want
  return levels.includes('low') ? 'low' : levels[0]
}

const numberOrNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))

function FeatureCard({ feature, config }: { feature: AiFeature; config: ResolvedAiConfig }) {
  const navigate = useNavigate()
  const info = AI_FEATURE_INFO[feature]
  const saved = config.features[feature]
  const [draft, setDraft] = useState<AiFeatureConfig>(saved)
  const [other, setOther] = useState(() => !findModel(saved.provider, saved.model))
  const typed = config.prices[draft.model]
  const [price, setPrice] = useState({ input: typed ? String(typed.inputPerM) : '', output: typed ? String(typed.outputPerM) : '' })
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [test, setTest] = useState<AiTestResult | null>(null)

  const listed = findModel(draft.provider, draft.model)
  const levels = thinkingLevelsOf(draft.provider, draft.model)
  const typedPrice = { inputPerM: numberOrNull(price.input), outputPerM: numberOrNull(price.output) }
  const priceChanged = !listed && draft.model && (typedPrice.inputPerM !== (config.prices[draft.model]?.inputPerM ?? null) || typedPrice.outputPerM !== (config.prices[draft.model]?.outputPerM ?? null))
  const dirty = !same(draft, saved) || !!priceChanged
  const shownPrice = listed ? priceOf(draft.provider, draft.model, config.prices) : typedPrice.inputPerM !== null && typedPrice.outputPerM !== null ? (typedPrice as { inputPerM: number; outputPerM: number }) : null
  const key = config.providers[draft.provider]

  // What's saved moves on (this save, or another super admin's) while nothing here is changed: follow it.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })
  useEffect(() => {
    if (dirtyRef.current) return
    setDraft(saved)
    setOther(!findModel(saved.provider, saved.model))
    const p = config.prices[saved.model]
    setPrice({ input: p ? String(p.inputPerM) : '', output: p ? String(p.outputPerM) : '' })
  }, [saved, config.prices])

  const setProvider = (provider: AiProvider) => {
    const model = recommendedModel(provider).id
    setOther(false)
    setTest(null)
    setDraft((d) => ({ ...d, provider, model, thinking: levelFor(provider, model, d.thinking) }))
  }
  const setModel = (value: string) => {
    setTest(null)
    if (value === OTHER) {
      setOther(true)
      setDraft((d) => ({ ...d, model: '' }))
      setPrice({ input: '', output: '' })
      return
    }
    setOther(false)
    setDraft((d) => ({ ...d, model: value, thinking: levelFor(d.provider, value, d.thinking) }))
  }
  const typeModel = (value: string) => {
    setTest(null)
    const id = cleanModelId(value)
    setDraft((d) => ({ ...d, model: value.trim() === '' ? '' : value }))
    const p = config.prices[id]
    if (p) setPrice({ input: String(p.inputPerM), output: String(p.outputPerM) })
  }

  function input(): AiSettingsInput | string {
    const model = cleanModelId(draft.model)
    if (!isModelId(model)) return model ? `“${model}” isn’t a model ID.` : 'Choose or type the model.'
    const out: AiSettingsInput = { features: { [feature]: { ...draft, model } } }
    if (!findModel(draft.provider, model)) {
      if (typedPrice.inputPerM === null || typedPrice.outputPerM === null) return `Type the prices for ${model} (dollars per 1M tokens).`
      out.prices = { [model]: { inputPerM: typedPrice.inputPerM, outputPerM: typedPrice.outputPerM } }
    }
    return out
  }

  async function save() {
    const data = input()
    if (typeof data === 'string') return void toast.error(data)
    const checked = checkAiSettings(data, config)
    if (!checked.ok) return void toast.error(checked.error)
    setBusy('save')
    try {
      await saveAiSettings(data)
      toast.success(`${info.label}: saved`, { description: checked.changes.map((c) => c.summary.replace(`${info.label}: `, '')).join(' · ') || undefined })
    } catch (e) {
      toast.error('Couldn’t save', { description: callError(e) })
    } finally {
      setBusy(null)
    }
  }

  function discard() {
    setDraft(saved)
    setOther(!findModel(saved.provider, saved.model))
    const p = config.prices[saved.model]
    setPrice({ input: p ? String(p.inputPerM) : '', output: p ? String(p.outputPerM) : '' })
    setTest(null)
  }

  async function runTest() {
    const model = cleanModelId(draft.model)
    if (!isModelId(model)) return void toast.error('Choose or type the model first.')
    setBusy('test')
    setTest(null)
    try {
      setTest(await testAiModel(draft.provider, model, draft.thinking))
    } catch (e) {
      setTest({ ok: false, error: callError(e), ms: 0 })
    } finally {
      setBusy(null)
    }
  }

  const status = saved.enabled ? (config.providers[saved.provider] ? { label: 'On', className: 'bg-emerald-600 text-white' } : { label: 'On, no key', className: 'bg-amber-500 text-white' }) : { label: 'Off', className: '' }

  return (
    <Card data-testid={`ai-feature-${feature}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              {info.label}
              <Badge variant={saved.enabled ? 'default' : 'secondary'} className={status.className}>
                {status.label}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">{info.description}</CardDescription>
          </div>
          <Label className="flex shrink-0 items-center gap-2 text-sm font-normal">
            <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} aria-label={`${info.label} on`} />
            {draft.enabled ? 'On' : 'Off'}
          </Label>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Select value={draft.provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger className="w-full" aria-label="Provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {AI_PROVIDER_INFO[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Model</FieldLabel>
            <Select value={other ? OTHER : draft.model} onValueChange={setModel}>
              <SelectTrigger className="w-full" aria-label="Model">
                {/* The trigger shows the model's name only; the list shows its ID and prices too. */}
                <SelectValue placeholder="Choose a model">{other ? 'Another model' : (listed?.label ?? draft.model)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {modelsOf(draft.provider).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.id} · {formatPrice(priceOf(m.provider, m.id, config.prices)!.inputPerM)} / {formatPrice(priceOf(m.provider, m.id, config.prices)!.outputPerM)}
                      {m.recommended ? ' · recommended' : ''}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Another model (type its ID)…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {other ? (
          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
            <Field className="sm:col-span-3">
              <FieldLabel htmlFor={`${feature}-model`}>Model ID</FieldLabel>
              <Input id={`${feature}-model`} value={draft.model} onChange={(e) => typeModel(e.target.value)} placeholder={draft.provider === 'gemini' ? 'gemini-3.5-flash-lite' : draft.provider === 'anthropic' ? 'claude-haiku-5-5' : 'gpt-5-mini'} spellCheck={false} autoComplete="off" />
              <FieldDescription>As {AI_PROVIDER_INFO[draft.provider].label}’s API names it. Check the provider’s page for its prices.</FieldDescription>
            </Field>
            <PriceInput label="Input price" value={price.input} onChange={(v) => setPrice((p) => ({ ...p, input: v }))} />
            <PriceInput label="Output price" value={price.output} onChange={(v) => setPrice((p) => ({ ...p, output: v }))} />
            <p className="self-end pb-2 text-xs text-muted-foreground">Dollars per 1M tokens. Thinking is billed as output.</p>
          </div>
        ) : null}

        <Field>
          <FieldLabel>Thinking</FieldLabel>
          {levels.length ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={draft.thinking ?? 'default'}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, thinking: v === 'default' ? null : (v as ThinkingLevel) }))}
              className="flex-wrap justify-start"
              aria-label="Thinking level"
            >
              {(['default', ...levels] as const).map((l) => (
                <ToggleGroupItem key={l} value={l} className="px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">
                  {l === 'default' ? 'Default' : THINKING_LABELS[l]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <p className="text-sm text-muted-foreground">{listed?.label ?? 'This model'} can’t be told how much to think.</p>
          )}
          <FieldDescription>More thinking can write better text, but takes longer and costs more (thinking is billed as output). Default leaves it to the model.</FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">Price:</span> {priceWords(shownPrice)}
          </span>
          <span className="flex items-center gap-1">
            <LuKeyRound className="size-3.5" aria-hidden />
            {key ? `${AI_PROVIDER_INFO[draft.provider].label} key …${key.keyLast4}` : `No ${AI_PROVIDER_INFO[draft.provider].label} key yet`}
          </span>
        </div>
        {!key ? (
          <Alert>
            <LuCircleAlert />
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>Until there’s a {AI_PROVIDER_INFO[draft.provider].label} key, {info.label.toLowerCase()} stays off for everyone, even when it’s on here.</span>
              <Button size="xs" variant="outline" onClick={() => navigate('/admin/settings/ai/keys', { replace: true })}>
                Add a key
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" disabled={!!busy || !key} onClick={() => void runTest()} data-testid="ai-test">
            {busy === 'test' ? <Spinner /> : <LuFlaskConical />} Test
          </Button>
          <span className="text-xs text-muted-foreground">A tiny request with the model and thinking above, saved or not. It’s logged as a test.</span>
          <div className="flex-1" />
          {dirty ? (
            <>
              <Button variant="ghost" disabled={!!busy} onClick={discard}>
                Discard
              </Button>
              <Button disabled={!!busy} onClick={() => void save()}>
                {busy === 'save' ? <Spinner /> : null} Save
              </Button>
            </>
          ) : null}
        </div>
        {test ? <TestResult result={test} /> : null}
      </CardContent>
    </Card>
  )
}

function TestResult({ result }: { result: AiTestResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm" role="status" data-testid="ai-test-result">
        <div className="font-medium text-destructive">The test failed{result.ms ? ` after ${(result.ms / 1000).toFixed(1)} s` : ''}</div>
        <div className="mt-0.5 break-words text-muted-foreground">{result.error}</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm" role="status" data-testid="ai-test-result">
      <div className="font-medium text-emerald-700 dark:text-emerald-400">It answered in {(result.ms / 1000).toFixed(1)} s</div>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {formatTokens(result.inputTokens)} in · {formatTokens(result.outputTokens)} out · {formatTokens(result.thinkingTokens)} thinking · {result.priced ? formatUsd(result.costUsd) : 'no price for this model yet'}
      </div>
    </div>
  )
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.10" aria-label={`${label}, dollars per 1M tokens`} />
        <InputGroupAddon align="inline-end">
          <InputGroupText>/ 1M</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}

function LimitsCard({ config }: { config: ResolvedAiConfig }) {
  const [monthly, setMonthly] = useState(config.monthlyLimitUsd === null ? '' : String(config.monthlyLimitUsd))
  const [noLimit, setNoLimit] = useState(config.monthlyLimitUsd === null)
  const [hourly, setHourly] = useState(String(config.hourlyLimit))
  const [busy, setBusy] = useState(false)
  const nextMonthly = noLimit ? null : numberOrNull(monthly)
  const dirty = nextMonthly !== config.monthlyLimitUsd || Number(hourly) !== config.hourlyLimit

  // Follow what's saved while nothing here is changed.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })
  useEffect(() => {
    if (dirtyRef.current) return
    setMonthly(config.monthlyLimitUsd === null ? '' : String(config.monthlyLimitUsd))
    setNoLimit(config.monthlyLimitUsd === null)
    setHourly(String(config.hourlyLimit))
  }, [config.monthlyLimitUsd, config.hourlyLimit])

  async function save() {
    if (!noLimit && nextMonthly === null) return void toast.error('Type the monthly limit in dollars, or choose no limit.')
    const data: AiSettingsInput = { monthlyLimitUsd: nextMonthly, hourlyLimit: Number(hourly) }
    const checked = checkAiSettings(data, config)
    if (!checked.ok) return void toast.error(checked.error)
    setBusy(true)
    try {
      await saveAiSettings(data)
      toast.success('Limits saved')
    } catch (e) {
      toast.error('Couldn’t save the limits', { description: callError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-testid="ai-limits">
      <CardHeader>
        <CardTitle>Limits</CardTitle>
        <CardDescription>Guards on every AI request, every feature and the Test button included. When one is reached, the request is refused with a message saying why.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ai-monthly">Monthly limit</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="ai-monthly" inputMode="decimal" value={noLimit ? '' : monthly} disabled={noLimit} onChange={(e) => setMonthly(e.target.value)} placeholder={noLimit ? 'No limit' : '10'} />
              <InputGroupAddon align="inline-end">
                <InputGroupText>a month</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <Label className="mt-1 flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={noLimit} onCheckedChange={(v) => setNoLimit(v === true)} /> No limit
            </Label>
            <FieldDescription>New requests stop once this month’s logged cost reaches it (months in the academy’s time zone).</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-hourly">Requests per person, an hour</FieldLabel>
            <InputGroup>
              <InputGroupInput id="ai-hourly" inputMode="numeric" value={hourly} onChange={(e) => setHourly(e.target.value.replace(/\D/g, ''))} />
              <InputGroupAddon align="inline-end">
                <InputGroupText>requests an hour</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>So nobody runs up the bill by accident.</FieldDescription>
          </Field>
        </div>
        {dirty ? (
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMonthly(config.monthlyLimitUsd === null ? '' : String(config.monthlyLimitUsd))
                setNoLimit(config.monthlyLimitUsd === null)
                setHourly(String(config.hourlyLimit))
              }}
            >
              Discard
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? <Spinner /> : null} Save limits
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PricesCard({ config }: { config: ResolvedAiConfig }) {
  const { confirm, dialog } = useConfirm()
  const [listOpen, setListOpen] = useState(false)
  const [adding, setAdding] = useState({ model: '', input: '', output: '' })
  const [busy, setBusy] = useState(false)
  const typed = Object.entries(config.prices).sort(([a], [b]) => a.localeCompare(b))
  const inUse = new Set(AI_FEATURES.map((f) => config.features[f].model))

  async function save(prices: AiSettingsInput['prices'], done: string) {
    const checked = checkAiSettings({ prices }, config)
    if (!checked.ok) return void toast.error(checked.error)
    setBusy(true)
    try {
      await saveAiSettings({ prices })
      toast.success(done)
      return true
    } catch (e) {
      toast.error('Couldn’t save the price', { description: callError(e) })
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const id = cleanModelId(adding.model)
    const inputPerM = numberOrNull(adding.input)
    const outputPerM = numberOrNull(adding.output)
    if (!isModelId(id)) return void toast.error('Type the model’s ID.')
    if (inputPerM === null || outputPerM === null) return void toast.error('Type both prices, in dollars per 1M tokens.')
    if (await save({ [id]: { inputPerM, outputPerM } }, `Price saved for ${id}`)) setAdding({ model: '', input: '', output: '' })
  }

  async function remove(id: string) {
    const listed = AI_MODELS.find((m) => m.id === id)
    const ok = await confirm({
      title: `Remove the price for ${id}?`,
      description: listed ? `${listed.label} goes back to the list’s price (${priceWords(listed)}).` : 'Requests to it would have no price, so it can’t be removed while a feature uses it.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (ok) await save({ [id]: null }, `Price removed for ${id}`)
  }

  return (
    <Card data-testid="ai-prices">
      <CardHeader>
        <CardTitle>Prices</CardTitle>
        <CardDescription>
          The cost of each request is worked out from these: dollars per 1 million tokens, with thinking billed as output. A price typed here wins over the list’s (providers change them), and a model typed in by hand needs one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {typed.length ? (
          <ul className="divide-y rounded-lg border text-sm">
            {typed.map(([id, p]) => (
              <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{id}</span>
                <span className="text-muted-foreground tabular-nums">{priceWords(p)}</span>
                {inUse.has(id) ? <Badge variant="secondary">In use</Badge> : null}
                <Button variant="ghost" size="icon-sm" aria-label={`Remove the price for ${id}`} disabled={busy} onClick={() => void remove(id)}>
                  <LuTrash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No prices typed in: every model uses the list’s.</p>
        )}
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="price-model">Model ID</FieldLabel>
            <Input id="price-model" value={adding.model} onChange={(e) => setAdding((a) => ({ ...a, model: e.target.value }))} placeholder="model-id" spellCheck={false} autoComplete="off" />
          </Field>
          <PriceInput label="Input" value={adding.input} onChange={(v) => setAdding((a) => ({ ...a, input: v }))} />
          <PriceInput label="Output" value={adding.output} onChange={(v) => setAdding((a) => ({ ...a, output: v }))} />
          <Button variant="outline" disabled={busy} onClick={() => void add()}>
            Save price
          </Button>
        </div>

        <Collapsible open={listOpen} onOpenChange={setListOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
              <LuChevronDown className={cn('transition-transform', listOpen && 'rotate-180')} /> The list’s models and prices
              <span className="text-xs font-normal">· checked {formatDateKey(AI_MODELS_CHECKED, 'medium')}</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 text-right font-medium">Input</th>
                    <th className="px-3 py-2 text-right font-medium">Output</th>
                    <th className="px-3 py-2 font-medium">Thinking</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {AI_MODELS.map((m) => (
                    <tr key={`${m.provider}:${m.id}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{m.label}</div>
                        <div className="font-mono text-xs text-muted-foreground">{m.id}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{AI_PROVIDER_INFO[m.provider].label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(m.inputPerM)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(m.outputPerM)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{m.thinking.length ? m.thinking.map((t) => THINKING_LABELS[t]).join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Per 1M tokens. Check the providers’ pages:{' '}
              {AI_PROVIDERS.map((p, i) => (
                <span key={p}>
                  {i ? ', ' : ''}
                  <a className="underline underline-offset-2 hover:text-foreground" href={AI_PROVIDER_INFO[p].pricesUrl} target="_blank" rel="noreferrer">
                    {AI_PROVIDER_INFO[p].label}
                  </a>
                </span>
              ))}
              .
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      {dialog}
    </Card>
  )
}
