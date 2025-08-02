import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const experiments = sqliteTable(
  "experiments",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    name: text("name").notNull(),
    problem: text("problem").notNull(),
  },
  (t) => [unique().on(t.name)]
);

export const agents = sqliteTable(
  "agents",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    experiment: integer("experiment")
      .notNull()
      .references(() => experiments.id),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
  },
  (t) => [unique().on(t.name, t.experiment)]
);

export const memories = sqliteTable("memories", {
  id: integer("id").primaryKey(),
  created: integer("created", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updated: integer("updated", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),

  experiment: integer("experiment")
    .notNull()
    .references(() => experiments.id),
  agent: integer("agent")
    .notNull()
    .references(() => agents.id),

  content: text("content").notNull(),
});

export const publications = sqliteTable("publications", {
  id: integer("id").primaryKey(),
  created: integer("created", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updated: integer("updated", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),

  experiment: integer("experiment")
    .notNull()
    .references(() => experiments.id),
  author: integer("author")
    .notNull()
    .references(() => agents.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status", { enum: ["SUBMITTED", "PUBLISHED", "REJECTED"] }),
});

export const citations = sqliteTable(
  "citations",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    experiment: integer("experiment")
      .notNull()
      .references(() => experiments.id),

    from: integer("from")
      .notNull()
      .references(() => publications.id),

    to: integer("to")
      .notNull()
      .references(() => publications.id),
  },
  (t) => [unique().on(t.from, t.to, t.experiment)]
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey(),
    created: integer("created", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated: integer("updated", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    experiment: integer("experiment")
      .notNull()
      .references(() => experiments.id),
    publication: integer("publication")
      .notNull()
      .references(() => publications.id),
    reviewer: integer("author")
      .notNull()
      .references(() => agents.id),

    // null when requested by the system until submitted
    grade: text("grade", {
      enum: ["STRONG_ACCEPT", "ACCEPT", "REJECT", "STRONG_REJECT"],
    }),
    content: text("content"),
  },
  (t) => [unique().on(t.reviewer, t.publication)]
);
