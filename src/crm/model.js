export const stages = [
  ["new", "Novo lead"],
  ["contacted", "Contato realizado"],
  ["waiting", "Aguardando resposta"],
  ["followup", "Follow-up"],
  ["meeting", "Reunião"],
  ["proposal", "Proposta"],
  ["negotiation", "Negociação"],
  ["won", "Fechado"],
  ["lost", "Perdido"],
];
export const channels = [
  ["call", "Ligação"],
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["instagram", "Instagram"],
  ["meeting", "Reunião"],
  ["other", "Outro"],
];
export const stageLabel = (key) => stages.find((s) => s[0] === key)?.[1] || key;
export const localDay = (value) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );
export const localInput = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return parts.replace(" ", "T");
};
export const timestamp = (value) =>
  value ? new Date(`${value}:00-03:00`).toISOString() : null;
export const fmtTime = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
export function commercialStats(
  clients,
  activities,
  followups,
  now = new Date(),
) {
  const day = localDay(now),
    month = day.slice(0, 7),
    start = new Date(`${day}T00:00:00-03:00`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const week = localDay(start);
  const won = clients.filter((c) => c.stage === "won").length,
    lost = clients.filter((c) => c.stage === "lost").length;
  return {
    total: clients.length,
    contacts: activities.length,
    today: activities.filter((a) => localDay(a.occurred_at) === day).length,
    week: activities.filter(
      (a) => localDay(a.occurred_at) >= week && localDay(a.occurred_at) <= day,
    ).length,
    month: activities.filter((a) => localDay(a.occurred_at).startsWith(month))
      .length,
    negotiating: clients.filter((c) => c.stage === "negotiation").length,
    proposals: clients.filter((c) => c.stage === "proposal").length,
    won,
    lost,
    pending: followups.filter((f) => !f.completed_at).length,
    conversion: won + lost ? Math.round((won / (won + lost)) * 100) : 0,
  };
}
