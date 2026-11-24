/** Short-lived, server-side OAuth state registry. Popup callbacks return to the
 * same local server, so the state never needs to be exposed to browser storage. */
export class PendingOAuthState<T> {
  private readonly attempts = new Map<string, { value: T; createdAt: number }>();

  create(state: string, value: T, createdAt = Date.now()): void {
    this.prune(createdAt);
    this.attempts.set(state, { value, createdAt });
  }

  consume(state: unknown, now = Date.now()): T | null {
    if (typeof state !== "string") return null;
    const attempt = this.attempts.get(state);
    if (!attempt || now - attempt.createdAt > 10 * 60_000) return null;
    this.attempts.delete(state);
    return attempt.value;
  }

  private prune(now: number): void {
    for (const [state, attempt] of this.attempts) if (now - attempt.createdAt > 10 * 60_000) this.attempts.delete(state);
  }
}

export function zohoCallbackFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/OAuth exchange failed/.test(message)) return { code: "ZOHO_TOKEN_EXCHANGE_FAILED", message: "O Zoho não aceitou a troca da autorização na região configurada. Verifique o callback e tente novamente." };
  if (/account lookup failed|returned no account address/.test(message)) return { code: "ZOHO_ACCOUNT_LOOKUP_FAILED", message: "O Zoho autorizou a conexão, mas não foi possível identificar uma caixa postal na resposta de contas. Verifique o escopo ZohoMail.accounts.READ e a região da conta." };
  if (/fetch failed|timeout|network/i.test(message)) return { code: "ZOHO_NETWORK_UNREACHABLE", message: "O Scout não conseguiu alcançar o Zoho para concluir a conexão. Tente novamente." };
  return { code: "ZOHO_CONNECTION_FAILED", message: "O Zoho não conseguiu concluir a conexão. Tente novamente." };
}
