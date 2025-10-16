import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/migrations',
  dbCredentials: {
    url: './db.sqlite'
  }
});
