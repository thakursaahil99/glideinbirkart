// Real environment variables win over .env, so the suite never touches the development database.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.WORKERS_ENABLED = 'false';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/glideinbir_kart_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
