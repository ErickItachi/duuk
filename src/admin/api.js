import { supabase } from "../content/supabase";

export async function platformRequest(functionName, body) {
  if (navigator.onLine === false)
    throw new Error("Você está offline. Reconecte para continuar.");
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });
  if (error) {
    let message = "Não foi possível concluir. Tente novamente.";
    try {
      const result = await error.context?.json();
      if (result?.error) message = result.error;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export const teamRequest = (body) => platformRequest("duuk-team", body);
export const notificationRequest = (body) =>
  platformRequest("duuk-notifications", body);
export const mailRequest = (body) => platformRequest("duuk-mail", body);
export function checked(result) {
  if (result.error)
    throw new Error(
      result.error.code?.startsWith("PT")
        ? result.error.message
        : "Não foi possível salvar. Confira os campos e suas permissões.",
    );
  return result.data;
}
export async function rows(table, configure = (q) => q) {
  const output = [];
  for (let offset = 0; ; offset += 500) {
    const data =
      checked(
        await configure(supabase.from(table).select("*")).range(
          offset,
          offset + 499,
        ),
      ) || [];
    output.push(...data);
    if (data.length < 500) return output;
  }
}
