# Maintainerr - Custom Copilot Instructions

## Project Overview

Maintainerr is a media management application that helps users automatically manage their media libraries by creating rules to handle unused or unwatched content. It integrates with Plex, \*arr applications (Radarr/Sonarr), Overseerr/Jellyseerr, and Tautulli to provide comprehensive media lifecycle management.

## Repository Structure

This is a **TypeScript monorepo** managed with **Turborepo** and **Yarn workspaces**:

```
├── server/          # Nest.js backend API
├── ui/             # Vite + React Router frontend application
├── packages/
│   └── contracts/  # Shared TypeScript types, DTOs, and interfaces
├── package.json    # Root package with Turborepo scripts
└── turbo.json      # Turborepo configuration
```

## Technology Stack

### Backend (`server/`)

- **Framework**: Nest.js with TypeScript
- **Database**: TypeORM with SQLite
- **Testing**: Jest with @suites for dependency mocking and unit testing
- **API Documentation**: Swagger/OpenAPI
- **Validation**: Zod schemas with nestjs-zod
- **Architecture**: Event-driven with schedulers, graceful shutdown support

### Frontend (`ui/`)

- **Build System**: Vite 7+ for fast development and production builds
- **Framework**: React 19+ with React Router 7+ for client-side routing
- **Styling**: TailwindCSS with Headless UI components
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form with Zod validation
- **UI Components**: Custom components with Heroicons
- **Page Metadata**: React 19 Document Metadata support
- **Environment Variables**: Vite environment variables (import.meta.env.VITE\_\*)

### Shared (`packages/contracts/`)

- **Purpose**: Shared TypeScript types, DTOs, validation schemas
- **Technologies**: Zod schemas, class-validator decorators, Nest.js decorators

## Development Workflow

### Key Commands

```bash
# Install dependencies
yarn install

# Development (all packages)
yarn dev

# Build entire project
yarn build

# Lint all packages
yarn lint

# Format code
yarn format

# Run tests
yarn test

# Type checking
yarn check-types
```

### Package-Specific Commands

```bash
# Server development
yarn workspace @maintainerr/server dev

# UI development
yarn workspace @maintainerr/ui dev

# Contracts build (required by server/ui)
yarn workspace @maintainerr/contracts build
```

## Coding Standards

### Code Style

- **ESLint**: Strict TypeScript rules across all packages
- **Prettier**: Consistent formatting (run `yarn format`)
- **Commits**: Follow [Conventional Commits](https://conventionalcommits.org/) specification
- **Import Organization**: Prefer absolute imports, group by type (external, internal, relative)

### TypeScript Guidelines

- Use strict type checking
- Prefer `interface` for object shapes, `type` for unions/computed types
- Use Zod schemas for runtime validation (especially in contracts package)
- Leverage Nest.js decorators for API documentation and validation

### Architecture Patterns

#### Backend Patterns

- **Controllers**: Handle HTTP requests, delegate to services
- **Services**: Business logic, integrate with external APIs
- **DTOs**: Use Zod schemas from contracts package
- **Entities**: TypeORM entities for database models
- **Modules**: Feature-based module organization
- **Events**: Use Nest.js EventEmitter for decoupled communication

#### Frontend Patterns

- **Routing**: React Router with `createBrowserRouter` for declarative routing
- **Routes**: Explicit route configuration in `/src/router.tsx` with nested route support
- **Components**: Reusable UI components in `/src/components`
- **Hooks**: Custom hooks for data fetching (TanStack Query) and navigation (useNavigate, useLocation)
- **Forms**: React Hook Form with Zod resolvers
- **API**: Axios client with TypeScript contracts
- **Page Metadata**: React Helmet Async for managing `<head>` elements declaratively
- **Code Splitting**: React.lazy with Suspense for dynamic imports

#### Shared Contracts

- **DTOs**: Request/response shapes with validation
- **Events**: Type-safe event definitions
- **Enums**: Shared constants and enumerations

## File Organization

### Server Structure

```
server/src/
├── modules/        # Feature modules (collections, rules, settings, etc.)
├── common/         # Shared utilities, decorators, filters
├── database/       # TypeORM entities and migrations
├── events/         # Event definitions and handlers
└── main.ts         # Application bootstrap
```

### UI Structure

```
ui/src/
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks
├── pages/          # Page components for routes (DocsPage, PlexLoadingPage)
├── utils/          # Client-side utilities
├── styles/         # Global styles and Tailwind config
├── router.tsx      # React Router configuration with route definitions
└── main.tsx        # Application entry point
```

## Refactoring Guidelines

When modifying existing code, follow these specific refactoring priorities:

### Forms and UI Components

- **React Hook Forms Migration**: Forms that do not use React Hook Form should be refactored to use it, along with their Zod validation schemas and corresponding DTOs from the contracts package. See [PR #1871](https://github.com/Maintainerr/Maintainerr/pull/1871) as a reference example.
- **Form Components**: Use existing form components from `ui/src/components/Forms/` (Input, Select, etc.) and create new ones in this directory if necessary, following the same patterns.
- **Component Naming**: Component file names should follow the exported type name(s) rather than using generic `index.tsx` files. For example, use `UserSettingsForm.tsx` instead of `index.tsx`.

### Server-Side Type Safety

- **Strict Typing Evolution**: Extra care should be taken in the **server** project. While strict type checking is not currently enabled (`strictNullChecks: false`, `noImplicitAny: false`), we are moving toward stricter standards.
- **Type Specifications**: When creating new code, specify explicit types including `undefined` when applicable, rather than relying on computed types.
- **Any Type Elimination**: When encountering `any` types during code changes, attempt to use proper types or create specific type definitions. This includes external API requests and responses.
- **Gradual Migration**: Incrementally improve type safety without breaking existing functionality.

## External Integrations

The application integrates with several external services:

- **Plex**: Media server API for collections and metadata
- **Radarr/Sonarr**: Movie/TV show management APIs
- **Overseerr/Jellyseerr**: Request management systems
- **Tautulli**: Plex analytics and statistics

When working with these integrations:

- Use proper error handling and retry logic (axios-retry)
- Implement caching where appropriate (node-cache)
- Follow rate limiting best practices
- Use TypeScript interfaces for external API responses

## External API Documentation

Reference the following OpenAPI specifications and API documentation when working with external service integrations:

### Media Management Services

- **Sonarr**: [OpenAPI Specification](https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/Sonarr.Api.V3/openapi.json)
- **Radarr**: [OpenAPI Specification](https://raw.githubusercontent.com/Radarr/Radarr/develop/src/Radarr.Api.V3/openapi.json)
- **Tautulli**: [API Reference Documentation](https://docs.tautulli.com/extending-tautulli/api-reference)

### Request Management Services

- **Overseerr**: [API Documentation](https://api-docs.overseerr.dev/overseerr-api.yml)
- **Jellyseerr**: [OpenAPI Specification](https://github.com/fallenbagel/jellyseerr/blob/develop/jellyseerr-api.yml)

### Media Server Services

- **Plex**: [OpenAPI Specification](https://raw.githubusercontent.com/LukeHagar/plex-api-spec/refs/heads/main/src/pms-spec.yaml) | [Additional Documentation](https://www.plexopedia.com/plex-media-server/api/)

These specifications provide comprehensive type definitions and endpoint documentation for creating robust integrations with proper TypeScript typing.

## Testing Guidelines

### Backend Testing

- **Unit Tests**: Jest with @suites for dependency mocking
- **File Pattern**: `*.spec.ts` files alongside source code
- **Coverage**: Focus on service logic and complex business rules
- **Test Database**: Use in-memory SQLite for integration tests

### Frontend Testing

- Testing infrastructure exists but keep tests focused on critical user flows
- Use React Testing Library patterns when adding tests

## Development Notes

### Environment Setup

- **Node.js**: Version 20.19.0+ or 22.12.0+
- **Package Manager**: Yarn 4.5.1 (managed via corepack)
- **Data Directory**: Requires `data/` folder with proper permissions for development

### Key Configuration Files

- `turbo.json`: Turborepo task configuration and caching
- `tsconfig.json`: TypeScript configuration per package
- `.yarnrc.yml`: Yarn package manager configuration
- Docker support available via `Dockerfile`

### Performance Considerations

- Use Turborepo caching for faster builds
- Leverage Vite's fast HMR and optimized production builds
- Implement proper database indexing in TypeORM entities
- Use React Query for efficient data fetching and caching
- Use React.lazy with Suspense for code splitting
- Optimize images and assets appropriately

## Contributing Guidelines

Before contributing:

1. Read `CONTRIBUTING.md` for detailed guidelines
2. Follow the branching strategy (meaningful branch names)
3. Ensure all tests pass: `yarn test`
4. Verify linting: `yarn lint`
5. Format code: `yarn format`
6. Use conventional commit messages

When suggesting code changes:

- Maintain consistency with existing patterns
- Consider performance and maintainability
- Update relevant documentation
- Add appropriate error handling
- Follow TypeScript best practices
