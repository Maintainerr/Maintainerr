// Suites 4 no longer sets these up on install. They type unitRef.get() as a
// Jest mock and, through the Jest one, load the Jest globals every spec uses:
// TypeScript 6 no longer includes @types packages on its own.
/// <reference types="@suites/doubles.jest/unit" />
/// <reference types="@suites/di.nestjs/metadata" />
