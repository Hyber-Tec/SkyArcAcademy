import { useState } from 'react'
import { LuExternalLink, LuKeyRound, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import type { ResolvedAiConfig } from '@shared/ai/config'
import { AI_PROVIDER_INFO } from '@shared/ai/models'
import { AI_FEATURES, AI_FEATURE_INFO, AI_PROVIDERS, type AiProvider } from '@shared/ai/types'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { callError, removeAiKey, saveAiKey } from './api'

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null

/**
 * AI → Keys: each provider's API key, added or replaced here and kept where only Cloud Functions read it. The page
 * never sees a key again: only its last 4 characters, and who set it when.
 */
export function KeysTab({ config }: { config: ResolvedAiConfig }) {
  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Keys</CardTitle>
        <CardDescription>
          Each provider’s API key. Once saved, a key is kept where only the app’s server reads it: no browser or phone ever gets it, this page included, so you’ll see only its last 4 characters. Replace it any time; every change is in Changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {AI_PROVIDERS.map((p) => (
          <KeyRow key={p} provider={p} config={config} />
        ))}
      </CardContent>
    </Card>
  )
}

function KeyRow({ provider, config }: { provider: AiProvider; config: ResolvedAiConfig }) {
  const { timezone } = useBranch()
  const { confirm, dialog } = useConfirm()
  const info = AI_PROVIDER_INFO[provider]
  const key = config.providers[provider]
  const usedBy = AI_FEATURES.filter((f) => config.features[f].provider === provider).map((f) => AI_FEATURE_INFO[f].label)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const setAt = millis(key?.keySetAt)

  async function save() {
    setBusy(true)
    try {
      const r = await saveAiKey(provider, value)
      toast.success(key ? `${info.label} key replaced` : `${info.label} key added`, { description: `It ends in …${r.keyLast4}. Try it with Test on Models.` })
      setEditing(false)
      setValue('')
    } catch (e) {
      toast.error('Couldn’t save the key', { description: callError(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Remove the ${info.label} key?`,
      description: usedBy.length
        ? `${usedBy.join(' and ')} uses ${info.label}: it stops for everyone until a key is added again. The key is deleted; you’d paste it again to bring it back.`
        : 'The key is deleted; you’d paste it again to bring it back.',
      confirmLabel: 'Remove the key',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await removeAiKey(provider)
      toast.success(`${info.label} key removed`)
    } catch (e) {
      toast.error('Couldn’t remove the key', { description: callError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-6 py-4" data-testid={`ai-key-${provider}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <LuKeyRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {info.label}
            {key ? <Badge className="bg-emerald-600 text-white">Set</Badge> : <Badge variant="secondary">Not set</Badge>}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {key ? (
              <>
                <span className="font-mono text-foreground">…{key.keyLast4}</span> · {setAt ? `set ${formatInstant(setAt, timezone)}` : 'just set'} by {key.keySetBy?.name || key.keySetBy?.email}
              </>
            ) : (
              'No key yet.'
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {usedBy.length ? `Used by ${usedBy.join(', ')}. ` : 'No feature uses it now. '}
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
              {info.keyWhere} <LuExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
              {key ? 'Replace' : 'Add key'}
            </Button>
            {key ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()} aria-label={`Remove the ${info.label} key`}>
                {busy ? <Spinner /> : <LuTrash2 />} Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pl-13"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) void save()
          }}
        >
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={key ? `The new ${info.label} key` : `Paste the ${info.label} key`}
            aria-label={`${info.label} API key`}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="font-mono sm:max-w-md"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !value.trim()}>
              {busy ? <Spinner /> : null} {key ? 'Replace the key' : 'Save the key'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setValue('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {dialog}
    </div>
  )
}
