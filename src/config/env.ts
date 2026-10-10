import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  USE_PGLITE: z.enum(['true', 'false']).default('true'),
  PGLITE_DATA_DIR: z.string().default('./data/pglite'),
  JWT_SECRET: z.string().default('meri-dbu-student-super-secure-jwt-secret-key-2026'),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().default(60),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(15),
  AI_PROVIDER: z.string().default('internal-grounded-rag'),
  OPENAI_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads'),
  FRONTEND_URL: z.string().default('http://localhost:4000'),
  INSTITUTION_NAME: z.string().default('Debre Berhan University'),
  INSTITUTION_CODE: z.string().default('DBU'),
  DEFAULT_ACADEMIC_YEAR: z.string().default('2025/2026'),
  SEPARATION_OF_DUTIES_STRICT: z.enum(['true', 'false']).default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
