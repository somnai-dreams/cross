// Browser checks use the real DOM and CSS engine without adding a test framework.
const built = await Bun.build({ entrypoints: [`${import.meta.dir}/mount.ts`], target: 'browser' })
if (!built.success) throw new AggregateError(built.logs, 'Browser check build failed')
const script = await built.outputs[0]!.text()
const html = await Bun.file(`${import.meta.dir}/index.html`).text()
Bun.serve({ hostname: '127.0.0.1', port: 4177, fetch(request) {
  switch (new URL(request.url).pathname) {
    case '/': return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    case '/mount.js': return new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
    case '/favicon.ico': return new Response(null, { status: 204 })
    default: return new Response(null, { status: 404 })
  }
} })
console.log('Open http://127.0.0.1:4177/ and run the browser checks.')
