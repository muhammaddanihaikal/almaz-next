import { describe, it, expect } from "vitest"
import bcrypt from "bcryptjs"
import { hashPassword, verifyPassword } from "@/lib/password"

describe("Password Hashing & Verification Utility", () => {
  describe("hashPassword", () => {
    it("harus menghasilkan string hash dengan format pbkdf2", () => {
      const hash = hashPassword("secret123")
      expect(hash).toBeTypeOf("string")
      expect(hash.startsWith("pbkdf2$")).toBe(true)
      expect(hash.split("$")).toHaveLength(5)
    })

    it("harus menghasilkan hash unik untuk password yang sama (salt acak)", () => {
      const hash1 = hashPassword("secret123")
      const hash2 = hashPassword("secret123")
      expect(hash1).not.toBe(hash2)
    })
  })

  describe("verifyPassword (format baru - pbkdf2)", () => {
    it("harus mengembalikan true untuk password yang cocok", async () => {
      const password = "mySecurePassword"
      const hash = hashPassword(password)
      const isMatch = await verifyPassword(password, hash)
      expect(isMatch).toBe(true)
    })

    it("harus mengembalikan false untuk password yang salah", async () => {
      const password = "mySecurePassword"
      const hash = hashPassword(password)
      const isMatch = await verifyPassword("wrongPassword", hash)
      expect(isMatch).toBe(false)
    })

    it("harus mengembalikan false untuk format hash yang rusak", async () => {
      const isMatch = await verifyPassword("somePassword", "pbkdf2$invalid$hash")
      expect(isMatch).toBe(false)
    })
  })

  describe("verifyPassword (format lama - bcrypt backward compatibility)", () => {
    it("harus mengembalikan true untuk password bcrypt yang cocok", async () => {
      const password = "myBcryptPassword"
      const legacyHash = await bcrypt.hash(password, 10)
      
      // Pastikan hash menggunakan format legacy bcrypt
      expect(legacyHash.startsWith("$2a$") || legacyHash.startsWith("$2b$")).toBe(true)

      const isMatch = await verifyPassword(password, legacyHash)
      expect(isMatch).toBe(true)
    })

    it("harus mengembalikan false untuk password bcrypt yang salah", async () => {
      const password = "myBcryptPassword"
      const legacyHash = await bcrypt.hash(password, 10)
      
      const isMatch = await verifyPassword("wrongPassword", legacyHash)
      expect(isMatch).toBe(false)
    })
  })

  describe("verifyPassword (Edge Cases)", () => {
    it("harus menangani null/undefined/empty string dengan aman", async () => {
      expect(await verifyPassword(null, "somehash")).toBe(false)
      expect(await verifyPassword("password", null)).toBe(false)
      expect(await verifyPassword("password", "")).toBe(false)
      expect(await verifyPassword("", "somehash")).toBe(false)
    })
  })
})
