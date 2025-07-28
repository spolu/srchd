import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/migrations',
  dbCredentials: {
    url: '~/stash/or1g1n/db.sqlite'
  }
});
