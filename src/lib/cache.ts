const PFX = 'zgz:v2:'
/** Small localStorage helpers: settings, and the one live list (duty pharmacies, saved with its date by lib/duty.ts). All other data is bundled. */
export const lsGet = (k: string): string | null => { try { return localStorage.getItem(PFX + k) } catch { return null } }
export const lsSet = (k: string, v: string): void => { try { localStorage.setItem(PFX + k, v) } catch { /* quota or private mode */ } }
