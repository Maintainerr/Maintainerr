export const delay = (ms: number, fn?: () => Promise<void> | void) => {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (fn) {
        Promise.resolve(fn())
          .then(() => resolve())
          .catch((error) => reject(error));
      } else {
        resolve();
      }
    }, ms);
  });
};
