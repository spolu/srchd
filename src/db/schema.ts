import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";
import { Message } from "../models";

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
  },
  (t) => [unique().on(t.name, t.experiment)]
);

export const evolutions = sqliteTable(
  "evolutions",
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
    agent: integer("agent")
      .notNull()
      .references(() => agents.id),

    system: text("system").notNull(),
  },
  (t) => {
    return [
      index("evolutions_idx_experiment_agent_created").on(
        t.experiment,
        t.agent,
        t.created
      ),
    ];
  }
);

export const messages = sqliteTable(
  "messages",
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
    agent: integer("agent")
      .notNull()
      .references(() => agents.id),

    // 0-based position within the (experiment, agent) thread
    position: integer("position").notNull(),

    role: text("role", { enum: ["user", "agent"] as const })
      .$type<Message["role"]>()
      .notNull(),
    content: text("content", { mode: "json" })
      .$type<Message["content"]>()
      .notNull(),
  },
  (t) => [unique().on(t.experiment, t.agent, t.position)]
);

export const publications = sqliteTable(
  "publications",
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
    author: integer("author")
      .notNull()
      .references(() => agents.id),

    title: text("title").notNull(),
    content: text("content").notNull(),
    abstract: text("abstract").notNull(),
    status: text("status", {
      enum: ["SUBMITTED", "PUBLISHED", "REJECTED"],
    }).notNull(),
    reference: text("reference").notNull(),
  },
  (t) => {
    return [unique().on(t.experiment, t.reference)];
  }
);

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
    author: integer("author")
      .notNull()
      .references(() => agents.id),

    // null when requested by the system until submitted
    grade: text("grade", {
      enum: ["STRONG_ACCEPT", "ACCEPT", "REJECT", "STRONG_REJECT"],
    }),
    content: text("content"),
  },
  (t) => [unique().on(t.author, t.publication)]
);
