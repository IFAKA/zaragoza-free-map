// Which season the shelter layer talks about. Decided only from the device date: no weather, no location, no request.
export type Season = 'warm' | 'cool' | 'neutral'

/** 1 Nov to 31 Mar = 'warm' (heated indoors), 1 Jun to 30 Sep = 'cool' (cooled indoors), April, May and October = 'neutral'. */
export function seasonOf(date: Date = new Date()): Season {
  const m = date.getMonth() + 1
  if (m >= 11 || m <= 3) return 'warm'
  if (m >= 6 && m <= 9) return 'cool'
  return 'neutral'
}
