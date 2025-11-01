import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";
import { Message, provider, ThinkingConfig } from "../models";
import { AnthropicModels } from "../models/anthropic";
import { GeminiModels } from "../models/gemini";
import { OpenAIModels } from "../models/openai";
import { MistralModels } from "../models/mistral";

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
  (t) => [unique().on(t.name)],
);

export const token_usages = sqliteTable(
  "token_usages",
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
    message: integer("message")
      .notNull()
      .references(() => messages.id),
    total: integer("total").notNull(),
    input: integer("input").notNull(),
    output: integer("output").notNull(),
    cached: integer("cached").notNull(),
    thinking: integer("thinking").notNull(),
  },
  (t) => [index("token_usages_idx_experiment_agent").on(t.experiment, t.agent)],
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
    provider: text("provider").$type<provider>().notNull(),
    model: text("model")
      .$type<AnthropicModels | GeminiModels | OpenAIModels | MistralModels>()
      .notNull(),
    thinking: text("thinking").$type<ThinkingConfig>().notNull(),
  },
  (t) => [unique().on(t.name, t.experiment)],
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
        t.created,
      ),
    ];
  },
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
  (t) => [unique().on(t.experiment, t.agent, t.position)],
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
  },
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
  (t) => [unique().on(t.from, t.to, t.experiment)],
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
  (t) => [unique().on(t.author, t.publication)],
);

export const solutions = sqliteTable(
  "solutions",
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
    // null when thre is no current solution (anymore)
    publication: integer("publication").references(() => publications.id),
    agent: integer("agent")
      .notNull()
      .references(() => agents.id),

    reason: text("reason", {
      enum: [
        "no_previous",
        "previous_wrong",
        "previous_improved",
        "new_approach",
      ],
    }).notNull(),
    rationale: text("content").notNull(),
  },
  (t) => [
    index("solutions_idx_experiment_agent_created").on(
      t.experiment,
      t.agent,
      t.created,
    ),
  ],
);
