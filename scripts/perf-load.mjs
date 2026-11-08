// Cold-load measure: node scripts/perf-load.mjs [url] [runs]   (serve dist first: npx vite preview --port 4174)
// Phone-like: 4x CPU slowdown, 1.6 Mbit/s down, 150 ms latency. Prints (stderr) median FCP, LCP, KB on the wire, requests; stdout = LCP ms.
import { createRequire } from 'node:module'
const puppeteer = createRequire('/opt/homebrew/lib/node_modules/puppeteer/x.js')('puppeteer')
const URL = process.argv[2] || 'http://localhost:4174/', RUNS = +process.argv[3] || 5
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }), res = []
for (let i = 0; i < RUNS; i++) {
  const ctx = await b.createBrowserContext(), p = await ctx.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const c = await p.createCDPSession()
  await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000 })
  await c.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  let bytes = 0, reqs = 0
  if (process.env.LOG) c.on("Network.requestWillBeSent", e => console.error(Math.round(performance.now()), e.request.url.replace(/.*localhost:\d+/, "")));
  c.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; reqs++ })
  await p.setRequestInterception(true)
  p.on('request', r => (/localhost/.test(r.url()) ? r.continue() : r.abort()))
  await p.evaluateOnNewDocument(() => { window.__m = {}; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m[e.name === "first-paint" ? "fp" : "fcp"] = e.startTime }).observe({ type: 'paint', buffered: true }); new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) })
  if (process.env.WARM) { await p.goto(URL, { waitUntil: "networkidle0" }); await new Promise(r => setTimeout(r, 4000)); bytes = 0; reqs = 0; await p.reload({ waitUntil: "networkidle0" }) } else await p.goto(URL, { waitUntil: "networkidle0" })
  const m = await p.evaluate(() => window.__m)
  res.push({ fp: m.fp, fcp: m.fcp, lcp: m.lcp, kb: bytes / 1024, reqs }); await ctx.close()
}
await b.close()
const med = k => res.map(r => r[k]).sort((a, z) => a - z)[res.length >> 1]
const out = { fp: Math.round(med("fp")), fcp: Math.round(med('fcp')), lcp: Math.round(med('lcp')), kb: Math.round(med('kb')), reqs: med('reqs') }
console.error(JSON.stringify(out)); console.log(out.lcp)
