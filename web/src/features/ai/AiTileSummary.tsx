import { featureReady } from '@shared/ai/config'
import { formatUsd } from '@shared/ai/cost'
import { findModel } from '@shared/ai/models'
import { AI_FEATURES, AI_FEATURE_INFO } from '@shared/ai/types'
import { useAiConfig } from './api'

/** The AI tile's line on the Settings home (super admins only): each feature's state and model, and the limit. */
export function AiTileSummary() {
  const { config, loading } = useAiConfig()
  if (loading) return null
  const features = AI_FEATURES.map((f) => {
    const c = config.features[f]
    const model = findModel(c.provider, c.model)?.label ?? c.model
    const state = featureReady(config, f) ? 'on' : c.enabled ? 'on, no key yet' : 'off'
    return `${AI_FEATURE_INFO[f].label}: ${state}, ${model}`
  })
  const limit = config.monthlyLimitUsd === null ? 'No monthly limit' : `Limit ${formatUsd(config.monthlyLimitUsd)} a month`
  return <>{[...features, limit].join(' · ')}</>
}
