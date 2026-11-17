// Test the APNs token signing and request shape with a throwaway key (no network to Apple).
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:9')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'x')
const mod = await import(Deno.args[0])
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
let bin = ''; for (const b of pkcs8) bin += String.fromCharCode(b)
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
const jwt: string = await mod.apnsJwt({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', pem })
const [h, c, sig] = jwt.split('.')
const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')))
const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - sig.length % 4) % 4)), (ch) => ch.charCodeAt(0))
const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sigBytes, new TextEncoder().encode(`${h}.${c}`))
const req = mod.apnsRequest('ab'.repeat(32), { title: 'In 15 min · 9:00 AM', body: 'Team meeting', url: '/calendar', tag: 'event-42' }, jwt)
console.log(JSON.stringify({ header: dec(h), claims: { iss: dec(c).iss, iatRecent: Math.abs(dec(c).iat - Date.now() / 1000) < 5 }, sigLen: sigBytes.length, signatureValid: ok,
  url: req.url, headers: Object.keys(req.init.headers), topic: (req.init.headers as Record<string,string>)['apns-topic'], body: JSON.parse(req.init.body as string) }, null, 1))
Deno.exit(0)
