import { supabase } from "../content/supabase";
import { checked, rows, teamRequest } from "../admin/api";
export const listClients = () =>
  rows("duuk_clients", (q) =>
    q.order("updated_at", { ascending: false }).order("id"),
  );
export const listActivities = () =>
  rows("duuk_activities", (q) =>
    q.order("occurred_at", { ascending: false }).order("id"),
  );
export const listFollowups = () =>
  rows("duuk_follow_ups", (q) => q.order("due_at").order("id"));
export const directory = () => teamRequest({ action: "directory" });
export async function saveClient(form, record) {
  const result = checked(
    await (
      record
        ? supabase
            .from("duuk_clients")
            .update(form)
            .eq("id", record.id)
            .eq("version", record.version)
        : supabase.from("duuk_clients").insert(form)
    )
      .select()
      .maybeSingle(),
  );
  if (!result)
    throw new Error("O cliente mudou em outra aba. Atualize antes de editar.");
  return result;
}
export async function deleteClient(record) {
  const data = checked(
    await supabase
      .from("duuk_clients")
      .delete()
      .eq("id", record.id)
      .eq("version", record.version)
      .select("id"),
  );
  if (!data?.length) throw new Error("O cliente mudou. Atualize a lista.");
}
export const addActivity = async (form) =>
  checked(
    await supabase.from("duuk_activities").insert(form).select().single(),
  );
export const addFollowup = async (form) =>
  checked(
    await supabase.from("duuk_follow_ups").insert(form).select().single(),
  );
export const completeFollowup = async (body) =>
  checked(await supabase.rpc("duuk_complete_followup", body));
export const clientHistory = (id) =>
  rows("duuk_client_history", (q) =>
    q.eq("client_id", id).order("created_at", { ascending: false }).order("id"),
  );
export async function commercialData() {
  const [clients, activities, followups, people] = await Promise.all([
    listClients(),
    listActivities(),
    listFollowups(),
    directory(),
  ]);
  return { clients, activities, followups, people };
}

export const movePipeline = async (record, next_stage) =>
  checked(
    await supabase.rpc("duuk_move_pipeline", {
      target: record.id,
      revision: record.version,
      next_stage,
    }),
  );
