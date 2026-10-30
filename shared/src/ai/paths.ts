/**
 * The AI's platform-wide collections (docs/DECISIONS.md §26), outside every academy (shared/src/ai/types.ts says what
 * each holds). Apart from shared/src/paths.ts, so that only the code that uses them changes with them.
 */
export const AI_COL = {
  /** Who may open the AI page (and the phone's "View the app as"): one document per lower-cased email. */
  superAdmins: 'superAdmins',
  /** `main`: the models, the keys' last 4 characters, the limits and prices; `public`: which features are on. */
  aiConfig: 'aiConfig',
  /** The providers' keys: server only. */
  aiKeys: 'aiKeys',
  /** Each request: its tokens, cost, time and outcome. */
  aiUsage: 'aiUsage',
  /** The change history. */
  aiChanges: 'aiChanges',
  /** Each person's requests in the last hour: server only. */
  aiLimits: 'aiLimits',
} as const

/** The documents of `aiConfig`. */
export const AI_DOC = {
  config: 'main',
  public: 'public',
} as const
