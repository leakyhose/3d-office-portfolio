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
  multisampling: number
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
    multisampling: 4,
  },
  medium: {
    level: 'medium',
    dpr: [1, 1.5],
    shadowMapSize: 2048,
    enableN8AO: false,
    enableBloom: true,
    n8aoHalfRes: true,
    n8aoQuality: 'low',
    multisampling: 8,
  },
  high: {
    level: 'high',
    dpr: [1, 1.5],
    shadowMapSize: 2048,
    enableN8AO: true,
    enableBloom: true,
    n8aoHalfRes: true,
    n8aoQuality: 'medium',
    multisampling: 8,
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

// detect-gpu fetches benchmark JSON from unpkg on every call; cache the
// verdict so repeat visits skip the network round-trip entirely.
const TIER_STORAGE_KEY = 'quality-tier-v1'

export async function detectQualityLevel(): Promise<QualityLevel> {
  try {
    const stored = localStorage.getItem(TIER_STORAGE_KEY)
    if (stored === 'low' || stored === 'medium' || stored === 'high') return stored
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to detection
  }
  try {
    _cachedTier = await getGPUTier()
    const tier = _cachedTier.tier
    const level: QualityLevel = tier <= 1 ? 'low' : tier === 2 ? 'medium' : 'high'
    try {
      localStorage.setItem(TIER_STORAGE_KEY, level)
    } catch {
      // best-effort cache only
    }
    return level
  } catch {
    // If detection fails, default to medium as a safe middle ground
    return 'medium'
  }
}
