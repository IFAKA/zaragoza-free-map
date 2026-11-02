import { describe, expect, it } from 'vitest'
import { parseCityHorario, schedFor } from './cityHours'
import { openState } from './hours'

// Real `horario` strings from zaragoza.es/sede equipamiento/catalog (libraries), shortened only in whitespace.
const WINTER_SUMMER = '<ul>\n\t<li>Lunes: de 15 a 21 h.</li>\n\t<li>Martes a viernes: de 8&#39;30 a 21 h.</li>\n\t<li>S&aacute;bados: de 9&#39;30 a 14 h.</li>\n</ul>\n\n<p>&nbsp;</p>\n\n<p><strong>HORARIO DE VERANO&nbsp;</strong>(del 22 de junio al 6 de septiembre)</p>\n\n<ul>\n\t<li>Lunes, martes, jueves y viernes de 8.30 a 14.30 horas</li>\n\t<li>Mi&eacute;rcoles de 14 a 20 horas</li>\n\t<li>S&aacute;bados y domingos: cerradas</li>\n</ul>\n'

describe('parseCityHorario (real strings)', () => {
  it('1. day list with two seasons', () => {
    expect(parseCityHorario(WINTER_SUMMER)).toEqual({
      r: 'Mo 15:00-21:00; Tu-Fr 08:30-21:00; Sa 09:30-14:00; Su off',
      s: 'Mo-Tu 08:30-14:30; We 14:00-20:00; Th-Fr 08:30-14:30; Sa-Su off', sf: 622, st: 906,
    })
  })
  it('2. comma decimal and "horas"', () => {
    expect(parseCityHorario('<p>Lunes a viernes, de 8,30 a 14,15 horas.</p> ')).toEqual({ r: 'Mo-Fr 08:30-14:15; Sa-Su off' })
  })
  it('3. two windows joined by "y" on the same line', () => {
    expect(parseCityHorario('<p>De lunes a viernes de 9 a 14 h. y lunes de 17 a 20 h.</p>\n')?.r).toBe('Mo 09:00-14:00,17:00-20:00; Tu-Fr 09:00-14:00; Sa-Su off')
  })
  it('4. colon times with an attached h', () => {
    expect(parseCityHorario('<p>Lunes a viernes: de 10:45 a 13:30h&nbsp;y de 16:30 a 20:00h.</p>')?.r).toBe('Mo-Fr 10:45-13:30,16:30-20:00; Sa-Su off')
  })
  it('5. plain text with dash range', () => {
    expect(parseCityHorario('Lunes a viernes 9 - 13:30 h')).toEqual({ r: 'Mo-Fr 09:00-13:30; Sa-Su off' })
  })
  it('6. apostrophe minutes and a stray double dot', () => {
    expect(parseCityHorario('<p>Lunes a viernes: de 16&#39;30 a 20 h..</p>')?.r).toBe('Mo-Fr 16:30-20:00; Sa-Su off')
  })
  it('unknown: no day names, term-time only, loan service only, staff only', () => {
    expect(parseCityHorario('<p><strong>Horario:</strong> 07:30-14:30</p> ')).toBeNull()
    expect(parseCityHorario('<ul><li><strong>Horario</strong><ul><li>08:00-14:30</li></ul></li></ul> ')).toBeNull()
    expect(parseCityHorario('<p>Lunes  lectivos de 17.00 a 20.00</p> ')).toBeNull()
    expect(parseCityHorario('Horario servicio de préstamo:<ul><li> Mañanas: De lunes a viernes: 10,45h. a 11,15h</li><li>Tardes: De lunes a viernes: 18,15h. a 18,45h.</li></ul>')).toBeNull()
    expect(parseCityHorario('<p>Atención personalizada de <strong>Lunes a Viernes de 08:30 a 14:30</strong>. El resto de tiempo la biblioteca permanece abierta para uso exclusivo del personal</p>')).toBeNull()
    expect(parseCityHorario('')).toBeNull()
    expect(parseCityHorario(undefined)).toBeNull()
  })
})

describe('schedFor + openState', () => {
  const s = parseCityHorario(WINTER_SUMMER)!
  it('picks the summer block only between its dates', () => {
    expect(schedFor(s, 621)).toBe(s.r)
    expect(schedFor(s, 622)).toBe(s.s)
    expect(schedFor(s, 906)).toBe(s.s)
    expect(schedFor(s, 907)).toBe(s.r)
  })
  it('Wednesday 16:00 is closed in winter and open in summer', () => {
    expect(openState(schedFor(s, 301)!, 2, 16 * 60)).toBe(true) // winter: Tu-Fr 08:30-21:00
    expect(openState(schedFor(s, 701)!, 2, 21 * 60)).toBe(false) // summer: We 14:00-20:00
    expect(openState(schedFor(s, 701)!, 2, 16 * 60)).toBe(true)
  })
  it('closed-summer-weekends note makes those dates unknown', () => {
    const w = { r: 'Mo-Fr 09:00-14:00; Sa-Su off', u: [701, 831] as [number, number] }
    expect(schedFor(w, 715)).toBeNull()
    expect(schedFor(w, 915)).toBe(w.r)
  })
})
