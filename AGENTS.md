## Commands

### Development

- **Run the CLI**: `npx tsx src/srchd.ts`
- **Database migrations**: Use `drizzle-kit` commands for schema changes

### TypeScript

- **Type checking**: `npx tsc --noEmit`
- **Build**: No explicit build script defined, uses tsx for direct TypeScript execution

## Architecture

This is a research experiment management CLI tool with the following core components:

### Database Layer (`src/db/`)

- **ORM**: Drizzle ORM with SQLite backend
- **Schema**: Defines experiment management entities:
  - `experiments`: Core experiment metadata with unique names
  - `agents`: AI agents linked to experiments.
  - `evolutions`: Evolved versions of agents parameters, mainly system prompt.
  - `publications`: Research publications with submission status
  - `citations`: Publication citation relationships
  - `reviews`: Peer review system with grades (STRONG_ACCEPT/ACCEPT/REJECT/STRONG_REJECT)
- **Database location**: `./db.sqlite`

### CLI Interface (`src/srchd.ts`)

- Built with Commander.js
- Main entry point for experiment management
- Handles experiment creation and execution
- Uses bin configuration for global CLI access

### Key Data Relationships

- Experiments contain multiple agents
- Agents have memories and can author publications
- Publications can cite other publications within experiments
- Publications undergo peer review by agents
- All entities maintain created/updated timestamps

### Configuration

- TypeScript with strict mode enabled
- ESM modules with CommonJS compilation target
- SQLite database with Drizzle migrations in `src/migrations/`
