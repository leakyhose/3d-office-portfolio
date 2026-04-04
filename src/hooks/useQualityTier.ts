import { createContext, useContext } from 'react'
import { getGPUTier, type TierResult } from 'detect-gpu'

export type QualityLevel = 'low' | 'medium' | 'high'

export interface QualitySettings {
  level: QualityLevel
  dpr: [number, number]
  shadowMapSize: number
  enableN8AO: boolean
  enableBloom: boolean
  n8aoHalfRes: boolean
  n8aoQuality: 'performance' | 'low' | 'medium' | 'high'
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    dpr: [1, 1],
    shadowMapSize: 1024,
    enableN8AO: false,
    enableBloom: false,
    n8aoHalfRes: true,
    n8aoQuality: 'performance',
  },
  medium: {
    level: 'medium',
    dpr: [1, 1.5],
    shadowMapSize: 2048,
    enableN8AO: false,
    enableBloom: true,
    n8aoHalfRes: true,
    n8aoQuality: 'low',
  },
  high: {
    level: 'high',
    dpr: [1, 2],
    shadowMapSize: 2048,
    enableN8AO: true,
    enableBloom: true,
    n8aoHalfRes: false,
    n8aoQuality: 'medium',
  },
}

export const QualityContext = createContext<QualitySettings>(PRESETS.high)

export function useQuality() {
  return useContext(QualityContext)
}

export function getPreset(level: QualityLevel): QualitySettings {
  return PRESETS[level]
}

export function downgradeLevel(current: QualityLevel): QualityLevel {
  if (current === 'high') return 'medium'
  return 'low'
}

export function upgradeLevel(current: QualityLevel): QualityLevel {
  if (current === 'low') return 'medium'
  return 'high'
}

let _cachedTier: TierResult | null = null

export async function detectQualityLevel(): Promise<QualityLevel> {
  try {
    _cachedTier = await getGPUTier()
    const tier = _cachedTier.tier
    if (tier <= 1) return 'low'
    if (tier === 2) return 'medium'
    return 'high'
  } catch {
    // If detection fails, default to medium as a safe middle ground
    return 'medium'
  }
}
