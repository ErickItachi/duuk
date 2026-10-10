import { supabase } from "../content/supabase";
import { platformRequest, teamRequest } from "../admin/api";
import { monthRange } from "./model";

export async function officeRequest(body) {
  const { data, error } = await supabase.functions.invoke("duuk-office", {
    body,
  });
  if (error) {
    let message =
      "Não foi possível concluir. Confira a conexão e tente novamente.";
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return data;
}
export const driveRequest = (body) => platformRequest("duuk-drive", body);
export async function listDriveStatuses(kinds) {
  const { data, error } = await supabase
    .from("duuk_drive_documents")
    .select("id,kind,contract_id,status,drive_trashed_at")
    .in("kind", kinds)
    .not("contract_id", "is", null)
    .limit(2000);
  return error ? [] : data;
}
export async function signRequest(body) {
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/duuk-sign`,
    {
      method: "POST",
      headers: {
        apikey: supabase.supabaseKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    const failure = new Error(data.error || "Não foi possível abrir o documento.");
    failure.status = response.status;
    throw failure;
  }
  return data;
}
const check = (result) => {
  if (result.error)
    throw new Error(
      "Não foi possível carregar ou salvar. Confira sua conexão.",
    );
  return result.data;
};
async function allRows(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = check(await query().range(offset, offset + 499));
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
export const listContracts = (includeTrash = false) =>
  allRows(() => {
    const query = supabase
      .from("duuk_contracts")
      .select(
        "id,title,client_name,client_email,duuk_name,status,version,created_at,updated_at,signed_path,rendered_version,deleted_at",
      )
      .order("created_at", { ascending: false })
      .order("id");
    return includeTrash ? query : query.is("deleted_at", null);
  });
export async function listEvents(month) {
  const range = monthRange(month);
  return allRows(() =>
    supabase
      .from("duuk_events")
      .select("*")
      .lt("start_date", range.end)
      .gte("end_date", range.start)
      .order("start_date")
      .order("id"),
  );
}
export const listTeamDirectory = () => teamRequest({ action: "directory" });
export async function saveEvent(form, record) {
  const request = record
    ? supabase
        .from("duuk_events")
        .update(form)
        .eq("id", record.id)
        .eq("version", record.version)
    : supabase.from("duuk_events").insert(form);
  const result = await request.select().maybeSingle();
  check(result);
  if (!result.data)
    throw new Error(
      "O compromisso foi alterado em outra aba. Atualize a agenda antes de editar.",
    );
  return result.data;
}
export async function deleteEvent(record) {
  const result = await supabase
    .from("duuk_events")
    .delete()
    .eq("id", record.id)
    .eq("version", record.version)
    .select("id");
  check(result);
  if (!result.data.length)
    throw new Error("O compromisso mudou. Atualize a agenda antes de excluir.");
}
export async function listExpenses(month) {
  const range = monthRange(month);
  return allRows(() =>
    supabase
      .from("duuk_expenses")
      .select("*")
      .gte("due_date", range.start)
      .lt("due_date", range.end)
      .order("due_date")
      .order("id"),
  );
}
export async function saveExpense(form, record) {
  const request = record
    ? supabase
        .from("duuk_expenses")
        .update(form)
        .eq("id", record.id)
        .eq("version", record.version)
    : supabase.from("duuk_expenses").insert(form);
  const result = await request.select().maybeSingle();
  check(result);
  if (!result.data)
    throw new Error(
      "A despesa foi alterada em outra aba. Recarregue antes de editar.",
    );
  return result.data;
}
export async function deleteExpense(record) {
  const result = await supabase
    .from("duuk_expenses")
    .delete()
    .eq("id", record.id)
    .eq("version", record.version)
    .select("id");
  check(result);
  if (!result.data.length)
    throw new Error("A despesa mudou. Recarregue antes de excluir.");
}
export async function listMetrics(days = 30) {
  const first = new Date();
  first.setDate(first.getDate() - days + 1);
  return allRows(() =>
    supabase
      .from("duuk_daily_metrics")
      .select("*")
      .gte(
        "day",
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
        }).format(first),
      )
      .order("day")
      .order("page")
      .order("event")
      .order("device")
      .order("source"),
  );
}
