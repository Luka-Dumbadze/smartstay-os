import 'server-only'
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai'

/** Generation model for every agent (per-agent thinking level comes from ai_team.agents.thinking_level). */
export const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'

export const THINKING: Record<'low' | 'medium' | 'high', ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

let client: GoogleGenAI | null = null

export function geminiConfigured(): boolean {
  return process.env.GOOGLE_GENAI_USE_VERTEX === '1' || Boolean(process.env.GEMINI_API_KEY?.trim())
}

/**
 * Gemini client.
 * - Default: Gemini Developer API with GEMINI_API_KEY (use a billed key: free-tier content is used to improve Google products).
 * - GOOGLE_GENAI_USE_VERTEX=1: Vertex AI (GCP_PROJECT_ID + GCP_LOCATION, Application Default Credentials) for EU residency.
 * - GEMINI_BASE_URL: optional endpoint override (API gateway / proxy / local test double).
 */
export function gemini(): GoogleGenAI {
  if (client) return client
  const baseUrl = process.env.GEMINI_BASE_URL?.trim()
  const httpOptions = { timeout: 30_000, ...(baseUrl ? { baseUrl } : {}) }
  if (process.env.GOOGLE_GENAI_USE_VERTEX === '1') {
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: process.env.GCP_LOCATION || 'europe-west1',
      httpOptions,
    })
  } else {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    client = new GoogleGenAI({ apiKey, httpOptions })
  }
  return client
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])

/** Exponential backoff with jitter on 429 / 5xx (Gemini troubleshooting guidance); other errors are thrown at once. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const status = e instanceof ApiError ? e.status : undefined
      if (status === undefined || !RETRYABLE.has(status) || i === attempts - 1) throw e
      const delay = Math.min(8_000, 800 * 2 ** i) * (0.5 + Math.random())
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
