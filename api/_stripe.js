import Stripe from 'stripe';

// Factory that creates a Stripe client using the Fetch API as its HTTP
// transport. Callers can intercept calls in tests by mocking globalThis.fetch
// before importing any module that calls makeStripe() — the FetchHttpClient
// captures globalThis.fetch at construction time, so the mock is in place for
// the lifetime of the module.
//
// In production (Vercel, Node 18+) globalThis.fetch is the platform fetch.
// No additional configuration is required.
export function makeStripe(secretKey) {
  if (!secretKey) return null;
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
