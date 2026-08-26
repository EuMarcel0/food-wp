import { AuthError } from "@supabase/supabase-js";

const BY_CODE: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar.",
  user_already_exists: "Este e-mail já está cadastrado.",
  email_exists: "Este e-mail já está cadastrado.",
  identity_already_exists: "Este e-mail já está cadastrado.",
  user_banned: "Esta conta foi bloqueada.",
  user_not_found: "Não encontramos uma conta com esses dados.",
  signup_disabled: "O cadastro está desativado no momento.",
  email_address_invalid: "E-mail inválido.",
  email_address_not_authorized: "Este e-mail não está autorizado.",
  weak_password: "A senha é muito fraca. Use pelo menos 6 caracteres.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_request_rate_limit: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  over_email_send_rate_limit:
    "Muitos e-mails enviados. Aguarde um pouco e tente de novo.",
  validation_failed: "Confira os dados e tente novamente.",
  session_not_found: "Sessão expirada. Entre novamente.",
  refresh_token_not_found: "Sessão expirada. Entre novamente.",
  bad_jwt: "Sessão inválida. Entre novamente.",
  unexpected_failure: "Não foi possível concluir. Tente de novo.",
};

const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
  [/user already registered/i, "Este e-mail já está cadastrado."],
  [/already been registered/i, "Este e-mail já está cadastrado."],
  [/password should be at least/i, "A senha deve ter pelo menos 6 caracteres."],
  [/unable to validate email/i, "E-mail inválido."],
  [/invalid format/i, "E-mail inválido."],
  [/email rate limit exceeded/i, "Muitos e-mails enviados. Aguarde um pouco."],
  [/for security purposes/i, "Aguarde alguns segundos e tente de novo."],
  [/signup requires a valid password/i, "Informe uma senha válida."],
  [/to signup, please provide your email/i, "Informe um e-mail válido."],
  [/network/i, "Falha de conexão. Verifique a internet."],
];

export function translateAuthError(error: unknown) {
  if (error instanceof AuthError) {
    if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
    const mapped = matchMessage(error.message);
    if (mapped) return mapped;
  }

  if (error instanceof Error) {
    const mapped = matchMessage(error.message);
    if (mapped) return mapped;
    if (/[áàâãéêíóôõúç]/i.test(error.message)) return error.message;
  }

  return "Não foi possível concluir. Tente novamente.";
}

function matchMessage(message: string) {
  for (const [pattern, text] of BY_MESSAGE) {
    if (pattern.test(message)) return text;
  }
  return null;
}
