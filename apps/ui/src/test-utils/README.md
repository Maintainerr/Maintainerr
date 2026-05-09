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
