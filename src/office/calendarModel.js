export const eventCategories = {
  filming: "Gravação",
  editing: "Edição",
  meeting: "Reunião",
  delivery: "Entrega",
  other: "Outros",
};
export const eventStatuses = {
  planned: "Planejado",
  confirmed: "Confirmado",
  done: "Concluído",
  cancelled: "Cancelado",
};
export const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const iso = (date) => date.toISOString().slice(0, 10);
export function addDays(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return iso(date);
}
export function shiftMonth(month, offset) {
  const [year, number] = month.split("-").map(Number);
  return iso(new Date(Date.UTC(year, number - 1 + offset, 1, 12))).slice(0, 7);
}
export function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return `${monthNames[number - 1]} ${year}`;
}
export function calendarDays(month) {
  const first = `${month}-01`,
    weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - weekday));
}
export function eventsOnDay(events, day) {
  return events
    .filter((event) => event.start_date <= day && event.end_date >= day)
    .sort(
      (a, b) =>
        Number(b.all_day) - Number(a.all_day) ||
        (a.start_time || "").localeCompare(b.start_time || "") ||
        a.title.localeCompare(b.title, "pt-BR"),
    );
}
export function eventTime(event) {
  if (event.all_day) return "Dia inteiro";
  const start = event.start_time?.slice(0, 5) || "";
  return event.end_time ? `${start} — ${event.end_time.slice(0, 5)}` : start;
}
export function eventPayload(form) {
  if (!form.title.trim()) throw new Error("Dê um nome ao compromisso.");
  if (!form.responsible_id)
    throw new Error("Escolha quem será responsável pelo compromisso.");
  if (!form.start_date || !form.end_date || form.end_date < form.start_date)
    throw new Error("A data final deve ser igual ou posterior à inicial.");
  if (form.end_date > addDays(form.start_date, 366))
    throw new Error("Use um período de até um ano.");
  if (!form.all_day && !form.start_time)
    throw new Error("Informe o horário de início.");
  if (
    !form.all_day &&
    form.end_time &&
    form.end_date === form.start_date &&
    form.end_time <= form.start_time
  )
    throw new Error("O horário final deve ser posterior ao inicial.");
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    location: form.location.trim(),
    client_name: form.client_name.trim(),
    start_date: form.start_date,
    end_date: form.end_date,
    all_day: form.all_day,
    start_time: form.all_day ? null : form.start_time,
    end_time: form.all_day ? null : form.end_time || null,
    category: form.category,
    status: form.status,
    responsible_id: form.responsible_id,
  };
}
