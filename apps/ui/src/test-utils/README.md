# UI Test Utilities

Use the query-result builders in `queryResults.ts` when mocking TanStack Query
hooks in specs. They provide complete React Query v5 result objects, so upstream
contract changes fail in one helper instead of being hidden by partial
`ReturnType<typeof useFoo>` casts.

Prefer:

```ts
useFooMock.mockReturnValue(buildQuerySuccessResult(data))
useFooMock.mockReturnValue(buildQueryLoadingResult())
useFooMock.mockReturnValue(buildQueryErrorResult(new Error('offline')))
```

Avoid:

```ts
useFooMock.mockReturnValue({
  data,
  isLoading: false,
} as unknown as ReturnType<typeof useFoo>)
```

## Automatic unmounting

`react-cleanup.ts` runs before every spec file (wired via `setupFiles` in
`vite.config.ts`) and unmounts rendered components after each test. Specs do not
need their own `afterEach(cleanup)`.

A tree left mounted keeps React's scheduler holding work, and anything it runs
after vitest tears the jsdom environment down throws `window is not defined`.
That surfaces as an unhandled error rather than a test failure, so it fails the
whole run while every test still reports green.
