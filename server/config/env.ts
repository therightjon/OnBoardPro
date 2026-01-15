import 'dotenv/config'; // Load .env file first
import { z } from 'zod';

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Security
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  COOKIE_DOMAIN: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  SENSITIVE_RATE_LIMIT_WINDOW_MS: z.coerce.number().optional(),
  SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().default(60),

  // Proxy Configuration
  // Comma-separated list of trusted proxy IPs/CIDRs, or "loopback" for localhost only
  // When set, X-Forwarded-For header is trusted only from these proxies
  TRUSTED_PROXIES: z.string().optional(),

  // Session Timeouts
  // SESSION_IDLE_TIMEOUT_HOURS: Inactivity timeout in hours (default: 2)
  // SESSION_ABSOLUTE_TIMEOUT_HOURS: Maximum session duration in hours (default: 24)
  SESSION_IDLE_TIMEOUT_HOURS: z.coerce.number().min(0.1).default(2),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().min(1).default(24),

  // Background Jobs
  DISABLE_DEADLINE_SCANNER: z.string().optional(),
  DISABLE_EMAIL_JOBS: z.string().optional(),
  DISABLE_NOTIFICATION_CLEANUP: z.string().optional(),

  // SMTP (Optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // OAuth Providers (Optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  AZURE_TENANT_ID: z.string().optional(),

  // LDAP (Optional)
  LDAP_URL: z.string().optional(),
  LDAP_BIND_DN: z.string().optional(),
  LDAP_BIND_PASSWORD: z.string().optional(),
  LDAP_SEARCH_BASE: z.string().optional(),
  LDAP_SEARCH_FILTER: z.string().optional(),

  // Feature Flags
  ENABLE_GOOGLE_AUTH: z.string().optional(),
  ENABLE_AZURE_AUTH: z.string().optional(),
  ENABLE_LDAP_AUTH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment configuration validation failed:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const env = parsedEnv;

// Log configuration on startup (development only)
if (env.NODE_ENV === 'development') {
  console.log('✓ Environment configuration validated');
  console.log(`  NODE_ENV: ${env.NODE_ENV}`);
  console.log(`  PORT: ${env.PORT}`);
  console.log(`  DATABASE_URL: ${env.DATABASE_URL.substring(0, 20)}...`);
  console.log(`  SESSION_SECRET: ${env.SESSION_SECRET.substring(0, 8)}... (${env.SESSION_SECRET.length} chars)`);
}
