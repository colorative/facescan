/**
 * Generates a self-signed cert so the kiosk can be opened from another device
 * on the LAN — a phone, a laptop with a webcam, the kiosk panel itself.
 *
 * HTTPS is not optional here. `getUserMedia` only runs in a secure context;
 * `localhost` is treated as one but a bare LAN IP over HTTP is not, so
 * http://192.168.x.x would load the whole UI and then fail into the
 * "Scanner unavailable" panel with no camera.
 *
 * Every current LAN address goes into the SAN, because browsers reject a cert
 * for an IP that only appears in the Common Name.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'certs')
export const KEY = join(DIR, 'dev-key.pem')
export const CERT = join(DIR, 'dev-cert.pem')

/** Non-loopback IPv4 addresses, in interface order. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address)
}

/** True when the existing cert already covers every current address. */
function certCovers(addresses) {
  if (!existsSync(CERT) || !existsSync(KEY)) return false
  try {
    const text = execFileSync(
      'openssl',
      ['x509', '-in', CERT, '-noout', '-text'],
      { encoding: 'utf8' },
    )
    // Also refuse a cert that has already expired.
    const notAfter = execFileSync('openssl', ['x509', '-in', CERT, '-noout', '-enddate'], {
      encoding: 'utf8',
    })
    const expiry = new Date(notAfter.replace('notAfter=', '').trim())
    if (Number.isFinite(expiry.valueOf()) && expiry < new Date()) return false
    return addresses.every((a) => text.includes(`IP Address:${a}`))
  } catch {
    return false
  }
}

export function ensureCert({ quiet = false } = {}) {
  const addresses = lanAddresses()
  mkdirSync(DIR, { recursive: true })

  if (certCovers(addresses)) {
    if (!quiet) console.log('  ✓ existing cert already covers', addresses.join(', ') || 'localhost')
  } else {
    const san = [
      'DNS:localhost',
      'IP:127.0.0.1',
      ...addresses.map((a) => `IP:${a}`),
    ].join(',')

    execFileSync(
      'openssl',
      [
        'req', '-x509',
        '-newkey', 'rsa:2048',
        '-sha256',
        // Well under the 825-day limit browsers enforce, and short enough that
        // a stale cert on a shared machine expires rather than lingering.
        '-days', '365',
        '-nodes',
        '-keyout', KEY,
        '-out', CERT,
        '-subj', '/CN=facescan-kiosk',
        '-addext', `subjectAltName=${san}`,
      ],
      { stdio: 'pipe' },
    )
    if (!quiet) console.log('  ✓ generated cert for', san)
  }

  return {
    key: readFileSync(KEY),
    cert: readFileSync(CERT),
    addresses,
  }
}

// Run directly: generate and print the shareable URLs.
if (process.argv[1] && process.argv[1].endsWith('dev-cert.mjs')) {
  console.log('\nkiosk dev certificate')
  const { addresses } = ensureCert()
  const port = process.env.PORT ?? '5273'
  console.log('\nShare one of these:')
  for (const a of addresses) console.log(`  https://${a}:${port}`)
  console.log(`  https://localhost:${port}   (this machine)`)
  console.log(
    '\nThe cert is self-signed, so each device shows a warning once —\n' +
      'choose Advanced → Proceed. HTTPS is what makes the camera work at all.\n',
  )
}
