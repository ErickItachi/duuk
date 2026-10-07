// Only fixed categories enter responses/logs. Provider errors may contain secrets.
export function mailFailure(error, stage) {
  const authentication =
    error?.authenticationFailed === true || error?.code === "EAUTH";
  const knownCodes = new Set([
    "EAUTH",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "CONNECT_TIMEOUT",
    "GREETING_TIMEOUT",
    "ClosedAfterConnectTLS",
    "NoConnection",
  ]);
  const code = knownCodes.has(error?.code) ? error.code : "other";
  if (authentication)
    return {
      kind: "authentication",
      code,
      status: 422,
      message:
        stage === "smtp"
          ? "A caixa de entrada foi validada, mas a GoDaddy recusou a autenticação de envio. Confirme a senha do e-mail no webmail da GoDaddy."
          : "A GoDaddy recusou o acesso à caixa. Confirme a senha que abre contato@duukfilms.com no webmail. Se sua conta usa verificação em duas etapas, confira a senha de aplicativo nas configurações de segurança da GoDaddy.",
    };
  return {
    kind: "connection",
    code,
    status: 502,
    message:
      "O painel não conseguiu manter a conexão com a GoDaddy. Tente novamente em instantes. Se continuar, informe o erro ao suporte da DUUK.",
  };
}
