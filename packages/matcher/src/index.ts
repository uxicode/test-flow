export {
  applyReview,
  deleteMatchSet,
  findLatestMatchSet,
  listMatchSets,
  loadMatchSet,
  MATCH_VERSION,
  saveMatchSet,
  saveMatchSetById,
  type MatchCandidate,
  type MatchSet,
  type MatchSetMeta,
  type MatchStatus,
  type MatchMethod,
  type TcStepMatch,
} from "./match-result.js";

export { matchTcToMap, resolveApprovedLocator, resolveApprovedSelector, EXACT_THRESHOLD, MODEL_THRESHOLD, type ResolvedLocator } from "./matcher.js";
export { _parseModelResponseForTest, MAX_MODEL_CANDIDATES } from "./model-match.js";
export { normalizeLabel, isSynonym, controlKindsCompatible } from "./normalize.js";
export { ruleMatchStep } from "./rule-match.js";
export { LABEL_SYNONYMS } from "./synonyms.js";
