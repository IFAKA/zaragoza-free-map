const PFX = 'zgz:v2:'
/** Small localStorage helpers (settings only; all data is bundled, nothing is cached from the network). */
export const lsGet = (k: string): string | null => { try { return localStorage.getItem(PFX + k) } catch { return null } }
export const lsSet = (k: string, v: string): void => { try { localStorage.setItem(PFX + k, v) } catch { /* quota or private mode */ } }
