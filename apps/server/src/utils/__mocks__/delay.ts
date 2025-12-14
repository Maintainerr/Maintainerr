export const delay = (ms: number, fn?: () => Promise<void> | void) => {
  if (fn) {
    return fn();
  }

  return Promise.resolve();
};
