/**
 * Conversational intents that map to app actions rather than answers.
 * Pure functions — unit-tested; the AI layer consults them before retrieval.
 */

const INDEX_REBUILD_PATTERNS: RegExp[] = [
  // "run a calibration pass on the vault", "calibrate your index"
  /\bcalibrat(?:e|ion|ing)\b[^\n]{0,40}\b(?:vault|index)\b/i,
  /\b(?:vault|index)\b[^\n]{0,40}\bcalibrat(?:e|ion|ing)\b/i,
  // "re-index", "reindex the vault"
  /\bre-?index\b/i,
  // "rebuild your index / embeddings / semantic index"
  /\brebuild\b[^\n]{0,30}\b(?:index|embedding|semantic)\b/i,
  /\b(?:index|embedding|semantic)\b[^\n]{0,30}\brebuild\b/i
]

/** True when the user is asking HAL to rebuild the vault's semantic index. */
export function detectIndexRebuildIntent(text: string): boolean {
  return INDEX_REBUILD_PATTERNS.some((re) => re.test(text))
}
