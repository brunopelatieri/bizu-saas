import Stripe from "stripe";

export type StripeClient = Stripe;

/** SDK oficial. A versão da API é a fixada pelo pacote, conferida junto com as fixtures. */
export function createStripeClient(secretKey: string): StripeClient {
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 15_000,
    appInfo: { name: "bizu-saas" },
  });
}
