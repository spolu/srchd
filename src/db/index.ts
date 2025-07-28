import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("~/stash/or1g1n/db.sqlite");
export const db = drizzle({ client: sqlite, schema });
