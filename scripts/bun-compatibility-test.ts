#!/usr/bin/env bun
/**
 * Bun Compatibility Test Script for OnBoardPro
 * 
 * Run with: bun scripts/bun-compatibility-test.ts
 * 
 * This script validates critical dependencies and APIs work correctly
 * under Bun before committing to a full migration.
 */

const results: { name: string; status: "✅" | "❌" | "⚠️"; message: string }[] = [];

function log(name: string, status: "✅" | "❌" | "⚠️", message: string) {
  results.push({ name, status, message });
  console.log(`${status} ${name}: ${message}`);
}

async function testEnvironmentVariables() {
  console.log("\n📋 Testing Environment Variables...\n");
  
  // Check if .env is auto-loaded by Bun
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasSessionSecret = !!process.env.SESSION_SECRET;
  
  if (hasDbUrl) {
    log("DATABASE_URL", "✅", "Loaded from .env");
  } else {
    log("DATABASE_URL", "❌", "Not found - check .env file exists");
  }
  
  if (hasSessionSecret) {
    log("SESSION_SECRET", "✅", "Loaded from .env");
  } else {
    log("SESSION_SECRET", "⚠️", "Not found (may be optional for this test)");
  }
}

async function testCryptoAPIs() {
  console.log("\n🔐 Testing Crypto APIs...\n");
  
  try {
    const { scrypt, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } = await import("crypto");
    const { promisify } = await import("util");
    const scryptAsync = promisify(scrypt);
    
    // Test scrypt (used in auth.service.ts)
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync("testpassword", salt, 64) as Buffer;
    log("crypto.scrypt", "✅", `Hash generated (${hash.length} bytes)`);
    
    // Test AES-256-GCM (used in secret.ts)
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("test", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    
    if (decrypted === "test") {
      log("crypto.aes-256-gcm", "✅", "Encryption/decryption working");
    } else {
      log("crypto.aes-256-gcm", "❌", "Decryption mismatch");
    }
    
    // Test timingSafeEqual (used in password comparison)
    const buf1 = Buffer.from("test");
    const buf2 = Buffer.from("test");
    const isEqual = timingSafeEqual(buf1, buf2);
    log("crypto.timingSafeEqual", isEqual ? "✅" : "❌", isEqual ? "Working" : "Failed");
    
  } catch (error) {
    log("crypto module", "❌", `Failed: ${error}`);
  }
}

async function testBunPasswordAPI() {
  console.log("\n🔑 Testing Bun.password API (bcrypt replacement)...\n");
  
  try {
    // @ts-ignore - Bun global
    if (typeof Bun === "undefined") {
      log("Bun.password", "⚠️", "Not running under Bun runtime");
      return;
    }
    
    // @ts-ignore - Bun global
    const hash = await Bun.password.hash("testpassword123", {
      algorithm: "bcrypt",
      cost: 10
    });
    log("Bun.password.hash", "✅", `Generated bcrypt hash (${hash.length} chars)`);
    
    // @ts-ignore - Bun global
    const valid = await Bun.password.verify("testpassword123", hash);
    log("Bun.password.verify", valid ? "✅" : "❌", valid ? "Verification successful" : "Verification failed");
    
    // @ts-ignore - Bun global
    const invalid = await Bun.password.verify("wrongpassword", hash);
    log("Bun.password (reject bad)", !invalid ? "✅" : "❌", !invalid ? "Correctly rejected" : "Should have rejected");
    
  } catch (error) {
    log("Bun.password", "❌", `Failed: ${error}`);
  }
}

async function testBcryptFallback() {
  console.log("\n🔒 Testing bcrypt (Node.js fallback)...\n");
  
  try {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash("testpassword", 10);
    log("bcrypt.hash", "✅", `Generated hash (${hash.length} chars)`);
    
    const valid = await bcrypt.default.compare("testpassword", hash);
    log("bcrypt.compare", valid ? "✅" : "❌", valid ? "Verification successful" : "Verification failed");
    
  } catch (error: any) {
    if (error.code === "ERR_MODULE_NOT_FOUND" || error.message?.includes("native")) {
      log("bcrypt", "⚠️", "Native module issue - use Bun.password instead");
    } else {
      log("bcrypt", "❌", `Failed: ${error.message}`);
    }
  }
}

async function testPostgresConnection() {
  console.log("\n🗄️ Testing PostgreSQL Connection...\n");
  
  if (!process.env.DATABASE_URL) {
    log("pg connection", "⚠️", "Skipped - DATABASE_URL not set");
    return;
  }
  
  try {
    const pg = await import("pg");
    const Pool = pg.default?.Pool || pg.Pool;
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("neon.tech") 
        ? { rejectUnauthorized: false } 
        : undefined,
      max: 1,
      connectionTimeoutMillis: 5000
    });
    
    const result = await pool.query("SELECT 1 as test, NOW() as time");
    log("pg.Pool.query", "✅", `Connected, server time: ${result.rows[0].time}`);
    
    await pool.end();
    log("pg.Pool.end", "✅", "Connection closed cleanly");
    
  } catch (error: any) {
    log("pg connection", "❌", `Failed: ${error.message}`);
  }
}

async function testDrizzleORM() {
  console.log("\n📊 Testing Drizzle ORM...\n");
  
  if (!process.env.DATABASE_URL) {
    log("drizzle", "⚠️", "Skipped - DATABASE_URL not set");
    return;
  }
  
  try {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { sql } = await import("drizzle-orm");
    const pg = await import("pg");
    const Pool = pg.default?.Pool || pg.Pool;
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("neon.tech") 
        ? { rejectUnauthorized: false } 
        : undefined,
      max: 1
    });
    
    const db = drizzle(pool);
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    log("drizzle.execute", "✅", `Query successful, found ${result.rows[0]?.count ?? 0} users`);
    
    await pool.end();
    
  } catch (error: any) {
    if (error.message?.includes("does not exist")) {
      log("drizzle", "⚠️", "Query ran but table missing (DB not initialized)");
    } else {
      log("drizzle", "❌", `Failed: ${error.message}`);
    }
  }
}

async function testExpressApp() {
  console.log("\n🌐 Testing Express.js...\n");
  
  try {
    const express = await import("express");
    const app = express.default();
    
    app.get("/test", (req, res) => res.json({ ok: true }));
    
    log("express", "✅", "App created successfully");
    
    // Test helmet
    const helmet = await import("helmet");
    app.use(helmet.default());
    log("helmet", "✅", "Middleware loaded");
    
    // Test compression
    const compression = await import("compression");
    app.use(compression.default());
    log("compression", "✅", "Middleware loaded");
    
  } catch (error: any) {
    log("express", "❌", `Failed: ${error.message}`);
  }
}

async function testLdapJs() {
  console.log("\n📁 Testing ldapjs (if used)...\n");
  
  try {
    const ldap = await import("ldapjs");
    const createClient = ldap.default?.createClient || ldap.createClient;
    
    if (typeof createClient === "function") {
      log("ldapjs", "✅", "Module loaded successfully");
    } else {
      log("ldapjs", "⚠️", "Module loaded but createClient not found");
    }
    
  } catch (error: any) {
    log("ldapjs", "⚠️", `Not available: ${error.message} (OK if not using LDAP)`);
  }
}

async function testZod() {
  console.log("\n✅ Testing Zod validation...\n");
  
  try {
    const { z } = await import("zod");
    
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });
    
    const valid = schema.safeParse({ email: "test@example.com", password: "password123" });
    const invalid = schema.safeParse({ email: "not-email", password: "short" });
    
    if (valid.success && !invalid.success) {
      log("zod", "✅", "Validation working correctly");
    } else {
      log("zod", "❌", "Validation behavior unexpected");
    }
    
  } catch (error: any) {
    log("zod", "❌", `Failed: ${error.message}`);
  }
}

async function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 COMPATIBILITY TEST SUMMARY");
  console.log("=".repeat(60) + "\n");
  
  const passed = results.filter(r => r.status === "✅").length;
  const warnings = results.filter(r => r.status === "⚠️").length;
  const failed = results.filter(r => r.status === "❌").length;
  
  console.log(`✅ Passed:   ${passed}`);
  console.log(`⚠️ Warnings: ${warnings}`);
  console.log(`❌ Failed:   ${failed}`);
  console.log("");
  
  if (failed > 0) {
    console.log("❌ FAILED TESTS:");
    results.filter(r => r.status === "❌").forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
    console.log("");
  }
  
  if (warnings > 0) {
    console.log("⚠️ WARNINGS:");
    results.filter(r => r.status === "⚠️").forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
    console.log("");
  }
  
  // Overall verdict
  console.log("=".repeat(60));
  if (failed === 0 && warnings <= 2) {
    console.log("🎉 VERDICT: Good candidate for Bun migration!");
  } else if (failed === 0) {
    console.log("🤔 VERDICT: Migration possible with some adjustments");
  } else {
    console.log("⛔ VERDICT: Address failures before migrating");
  }
  console.log("=".repeat(60) + "\n");
}

// Run all tests
async function main() {
  console.log("🐰 Bun Compatibility Test for OnBoardPro");
  console.log("=".repeat(60));
  
  // @ts-ignore
  if (typeof Bun !== "undefined") {
    // @ts-ignore
    console.log(`Runtime: Bun ${Bun.version}`);
  } else {
    console.log("Runtime: Node.js " + process.version);
    console.log("⚠️  For accurate results, run with: bun scripts/bun-compatibility-test.ts");
  }
  
  await testEnvironmentVariables();
  await testCryptoAPIs();
  await testBunPasswordAPI();
  await testBcryptFallback();
  await testPostgresConnection();
  await testDrizzleORM();
  await testExpressApp();
  await testLdapJs();
  await testZod();
  await printSummary();
}

main().catch(console.error);
