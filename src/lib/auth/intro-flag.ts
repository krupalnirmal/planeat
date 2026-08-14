/**
 * Marks that a device has already been through splash → onboarding → select
 * language once. Set as soon as the splash screen mounts (not at the end of
 * the sequence) so someone who drops off partway through never gets routed
 * back into it on their next visit.
 */
export const INTRO_SEEN_FLAG = 'planeat_intro_seen';
