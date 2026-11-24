const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
    return Promise.reject(new Error("External network access is disabled in database initialization tests."));
  }
  return originalFetch(input, init);
};
