import { describe, expect, it } from 'vitest'
import { EASE, MS, PICK } from './motion'

// vitest empties css imports, so read styles.css with Node's own fs
const css: string = (globalThis as unknown as { process: { getBuiltinModule: (n: string) => { readFileSync: (p: string, e: string) => string } } }).process.getBuiltinModule('node:fs').readFileSync('src/styles.css', 'utf8')
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
// the shadcn drawer is the sheet's own physics (CSS, 300 ms); it keeps them, and docs/motion.md says so
const SHEET = './ui/drawer.tsx'

describe('motion lives in src/ui/motion.ts', () => {
  const src = Object.keys(sources).filter(f => !/motion(\.test)?\.ts$/.test(f) && f !== SHEET && !f.endsWith('.test.ts'))
  it('has components to check', () => expect(src.length).toBeGreaterThan(5))
  it('no component writes its own duration, delay, curve or spring', () => {
    const bad: string[] = []
    for (const f of src) {
      const text = strip(sources[f])
      for (const re of [/\b\d+(\.\d+)?ms\b/, /\bduration-\d+/, /\b(duration|delay)\s*:\s*[\d.]/, /\bease\s*:\s*[\[']/, /cubic-bezier\(/, /\b(stiffness|damping|bounce)\s*:/, /\btype\s*:\s*['"](spring|tween)['"]/]) {
        const m = text.match(re)
        if (m) bad.push(`${f}: ${m[0]}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('styles.css repeats the motion tokens exactly', () => {
    const v = (n: string) => css.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim()
    expect(v('dur-press')).toBe(`${MS.press}ms`)
    expect(v('dur-small')).toBe(`${MS.small}ms`)
    expect(v('dur-card')).toBe(`${MS.card}ms`)
    expect(v('dur-slide')).toBe(`${MS.slide}ms`)
    expect(v('dur-pick')).toBe(`${MS.pick}ms`)
    expect(v('pick-scale')).toBe(String(PICK.scale))
    expect(v('ease-out')).toBe(`cubic-bezier(${EASE.join(', ')})`)
  })
})
