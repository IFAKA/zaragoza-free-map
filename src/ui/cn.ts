/** Join class names, skipping falsy values and state callbacks (we only pass plain strings). */
export const cn = (...a: unknown[]) => a.filter((x): x is string => typeof x === 'string' && x !== '').join(' ')
