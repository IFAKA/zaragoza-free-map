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

describe('parseCityHorario (more real strings: sports halls, museums, fire stations)', () => {
  it('sentences with Laborables / Sabados / Domingos y festivos', () => {
    expect(parseCityHorario('<p>Laborables de 08 a 23 horas Sábados de 08 a 23 horas Domingos y festivos de 08 a 15 horas</p>')?.r).toBe('Mo-Sa 08:00-23:00; Su 08:00-15:00')
    expect(parseCityHorario('<p>De lunes a sabado de 8 a 22 h. Domingos de 8 a 15 h.</p>')?.r).toBe('Mo-Sa 08:00-22:00; Su 08:00-15:00')
  })
  it('dash between days, and a lead-in sentence', () => {
    expect(parseCityHorario('<p>Lunes a viernes de 8.00 a 19.00- Sábado de 8.00 a 14.00</p>')?.r).toBe('Mo-Fr 08:00-19:00; Sa 08:00-14:00; Su off')
    expect(parseCityHorario('<p>El horario de apertura de centro, es de lunes a viernes de 8:30 a 21:00 y sábados de 8:30 a 14:00.</p>')?.r).toBe('Mo-Fr 08:30-21:00; Sa 08:30-14:00; Su off')
  })
  it('fixed-date exception lines are skipped, a closed period is kept', () => {
    const museum = '<ul><li>De martes a viernes de 10 a 14 h y de 17 a 21 h</li><li>Domingos y festivos: de 10 a 14:30 h.</li><li>Lunes, cerrado</li><li>Días 24 y 31 de diciembre, abierto de 10 a 14 h</li><li>Días 25 de diciembre y 1 de enero, cerrado.</li></ul>'
    expect(parseCityHorario(museum)?.r).toBe('Mo off; Tu-Fr 10:00-14:00,17:00-21:00; Sa off; Su 10:00-14:30')
    expect(parseCityHorario('<ul><li>Horario: miércoles, jueves y viernes, de 16,30 a 20,30 h</li><li>Cerrada del 1 al 16 de agosto</li></ul>')).toEqual({ r: 'Mo-Tu off; We-Fr 16:30-20:30; Sa-Su off', u: [801, 816] })
  })
  it('24 hours every day', () => {
    expect(parseCityHorario('<p>24 horas al día, todos los días del año.</p>')?.r).toBe('Mo-Su 00:00-24:00')
    expect(openState('Mo-Su 00:00-24:00', 6, 1439)).toBe(true)
  })
  it('stays unknown when the text has no days, only booking, or only "tardes"', () => {
    expect(parseCityHorario('<p>De 8,30 a 13,30 h.</p>')).toBeNull()
    expect(parseCityHorario('<p>Atención con cita previa.</p>')).toBeNull()
    expect(parseCityHorario('<ul><li>De martes a domingo en horario de tardes</li><li>Lunes cerradas</li></ul>')).toBeNull()
  })
})
