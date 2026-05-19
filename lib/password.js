import crypto from "crypto"
import bcrypt from "bcryptjs"

// Kami menggunakan pbkdf2 bawaan Node.js yang dikompilasi secara native,
// menjamin performa super cepat (di bawah 10-20ms) dibanding bcryptjs (1000-2000ms).
const ITERATIONS = 10000
const KEY_LEN = 64
const DIGEST = "sha512"

/**
 * Hash password menggunakan PBKDF2 (Native Node.js Crypto)
 * Format output: pbkdf2$sha512$10000$salt$hash
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex")
  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${hash}`
}

/**
 * Verifikasi password. Mendukung backward-compatibility untuk hash lama berformat bcrypt.
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false

  // Jika hash lama berformat bcrypt (selalu diawali dengan $2a$ atau $2b$)
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    return bcrypt.compare(password, storedHash)
  }

  // Jika hash baru berformat pbkdf2
  if (storedHash.startsWith("pbkdf2$")) {
    const parts = storedHash.split("$")
    if (parts.length !== 5) return false

    const [, digest, iterStr, salt, hash] = parts
    const iterations = parseInt(iterStr, 10)

    const candidateHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, digest).toString("hex")
    return candidateHash === hash
  }

  return false
}
