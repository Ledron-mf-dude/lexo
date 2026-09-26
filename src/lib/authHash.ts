// Password-reset and invite links come back with tokens in the URL hash (#access_token=…&type=recovery).
// supabase-js consumes and clears that hash right after start-up, so its type has to be read before that happens:
// this module is imported first in main.tsx for exactly that reason.
export const linkType = new URLSearchParams(window.location.hash.replace(/^#\/?/, '')).get('type')

export const openedFromPasswordLink = linkType === 'recovery' || linkType === 'invite'
