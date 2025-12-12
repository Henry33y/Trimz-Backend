import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const HARDCODED_TEST_KEY = process.env.PAYSTACK_TEST_KEY_FALLBACK || 'sk_test_27fca895080a3d7d26a95bc52665e9325f6e6589';

const secretPaths = [
  process.env.PAYSTACK_SECRET_FILE,
  path.resolve(process.cwd(), '.paystack-secret')
].filter(Boolean);

function readSecretFromFile(filePath) {
  try {
    const value = fs.readFileSync(filePath, 'utf8').trim();
    if (value) {
      return { secret: value, source: `file:${filePath}` };
    }
  } catch (err) {
    // ignore file errors; we'll fall through to other sources
  }
  return null;
}

export function resolvePaystackSecret() {
  const envKeys = Object.keys(process.env || {}).filter((key) => key.toLowerCase().includes('paystack'));

  if (process.env.PAYSTACK_SECRET_KEY) {
    return { secret: process.env.PAYSTACK_SECRET_KEY, source: 'env:PAYSTACK_SECRET_KEY', envKeys };
  }
  if (process.env.PAYSTACK_SECRET) {
    return { secret: process.env.PAYSTACK_SECRET, source: 'env:PAYSTACK_SECRET', envKeys };
  }
  if (process.env.paystack_secret_key) {
    return { secret: process.env.paystack_secret_key, source: 'env:paystack_secret_key', envKeys };
  }

  for (const filePath of secretPaths) {
    const fileSecret = readSecretFromFile(filePath);
    if (fileSecret) {
      fileSecret.envKeys = envKeys;
      return fileSecret;
    }
  }

  return { secret: HARDCODED_TEST_KEY, source: 'fallback:test-key', envKeys };
}
