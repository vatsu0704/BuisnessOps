/**
 * Build-time feature switches.
 *
 * Constants rather than remote config: these gate whole surfaces, and a surface
 * that appears and disappears between app launches is worse than one that is
 * simply not there yet. Flipping one is a release.
 */

/**
 * The conversational query surface — requirement 7: "for now don't implement
 * the AI chat board, hide it from the current UI, we'll enable it in future".
 *
 * There is no AI to switch off. What this hides is three pieces of static
 * teaser UI that promise one: Home's decorative ask bar (which was never even
 * tappable), the "Ask your business anything" notice, and the chat-bubble icon
 * the Home tab borrowed from it.
 *
 * Nothing is deleted. The components and every `home.query*` / `reports.*`
 * string stay on disk, exactly as `AlertsScreen` is kept for Phase 5 — so
 * turning this back on when the query engine lands (PROJECT_FLOW Phase 2)
 * restores the surface rather than requiring it to be rewritten from the
 * screenshots.
 */
export const AI_CHAT_ENABLED = false;
