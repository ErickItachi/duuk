import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfirmModal, Icon, Modal, RefreshButton } from "../admin/components";
import { EmptyState, ErrorState, PageTitle, Pagination, SearchField } from "../admin/forms";
import { matchesQuery, usePagination } from "../admin/ds/list";
import { useCreateIntent } from "../admin/shell/hooks";
import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useAuth } from "../content/AuthContext";
import { deleteEvent, listEvents, listTeamDirectory, saveEvent } from "./api";
import { DateField, DayGrid, MonthNavigation } from "./Calendar";
import {
  addDays,
  eventCategories,
  eventPayload,
  eventsOnDay,
  eventStatuses,
  eventTime,
  monthLabel,
} from "./calendarModel.js";
import { dateLabel, today } from "./model";
import { dayParts, longDate, useValidation } from "./officeHelpers";
import { ListSkeleton, OfficeField } from "./OfficeParts";
import { useQuery } from "./useQuery";

const statusTones = {
  planned: "ds-badge--neutral",
  confirmed: "ds-badge--info",
  done: "ds-badge--success",
  cancelled: "ds-badge--danger",
};
const views = [
  ["calendar", "Calendário", "calendar"],
  ["list", "Lista", "list"],
];

// Mirrors eventPayload (calendarModel.js), so each problem appears next to its field before saving.
function eventErrors(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = "Dê um nome ao compromisso.";
  if (!form.responsible_id)
    errors.responsible_id = "Escolha quem será responsável pelo compromisso.";
  if (!form.end_date || form.end_date < form.start_date)
    errors.end_date = "A data final deve ser igual ou posterior à inicial.";
  else if (form.end_date > addDays(form.start_date, 366))
    errors.end_date = "Use um período de até um ano.";
  if (!form.all_day && !form.start_time)
    errors.start_time = "Informe o horário de início.";
  else if (
    !form.all_day &&
    form.end_time &&
    form.end_date === form.start_date &&
    form.end_time <= form.start_time
  )
    errors.end_time = "O horário final deve ser posterior ao inicial.";
  return errors;
}

function EventEditor({ record, day, people, currentUserId, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    record
      ? {
          ...record,
          start_time: record.start_time?.slice(0, 5) || "",
          end_time: record.end_time?.slice(0, 5) || "",
          responsible_id: record.responsible_id || currentUserId,
        }
      : {
          title: "",
          description: "",
          location: "",
          client_name: "",
          start_date: day,
          end_date: day,
          all_day: true,
          start_time: "09:00",
          end_time: "",
          category: "filming",
          status: "planned",
          responsible_id: currentUserId,
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { errors, control, field, check } = useValidation(eventErrors, form);
  useUnsavedChanges(true);
  const update = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const dateProps = (name) => ({
    id: control(name).id,
    error: errors[name],
    errorId: field(name).errorId,
  });
  const save = async (event) => {
    event.preventDefault();
    if (busy || !check()) return;
    setError("");
    setBusy(true);
    try {
      await saveEvent(eventPayload(form), record);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={record ? "Editar compromisso" : "Novo compromisso"}
      subtitle="Gravações, reuniões e entregas no horário de Brasília."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} noValidate>
        <fieldset disabled={busy} className="office-form">
          <div className="admin-form-grid">
            <OfficeField label="Título do compromisso" className="ds-span-2" {...field("title")}>
              <input
                {...control("title")}
                required
                maxLength={160}
                value={form.title}
                placeholder="Ex.: Gravação · campanha de lançamento"
                onChange={(e) => update("title", e.target.value)}
              />
            </OfficeField>
            <OfficeField label="Tipo" {...field("category")}>
              <select
                {...control("category")}
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {Object.entries(eventCategories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </OfficeField>
            <OfficeField label="Situação" {...field("status")}>
              <select
                {...control("status")}
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {Object.entries(eventStatuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </OfficeField>
            <OfficeField
              label="Responsável pelo compromisso"
              className="ds-span-2"
              hint="Essa pessoa ficará registrada na agenda e aparecerá nos detalhes do compromisso."
              {...field("responsible_id")}
            >
              <select
                {...control("responsible_id", true)}
                required
                value={form.responsible_id || ""}
                onChange={(e) => update("responsible_id", e.target.value)}
              >
                <option value="">Escolher responsável</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.job_title ? ` · ${person.job_title}` : ""}
                  </option>
                ))}
              </select>
            </OfficeField>
            <DateField
              label="Data inicial"
              value={form.start_date}
              min="1900-01-01"
              max="2100-12-31"
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  start_date: value,
                  end_date: previous.end_date < value ? value : previous.end_date,
                }))
              }
              {...dateProps("start_date")}
            />
            <DateField
              label="Data final"
              value={form.end_date}
              min={form.start_date}
              max={addDays(form.start_date, 366)}
              onChange={(value) => update("end_date", value)}
              {...dateProps("end_date")}
            />
            <label className="admin-checkbox ds-span-2">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) => update("all_day", e.target.checked)}
              />
              Dia inteiro
            </label>
            {!form.all_day && (
              <>
                <OfficeField label="Horário inicial" {...field("start_time")}>
                  <input
                    {...control("start_time")}
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => update("start_time", e.target.value)}
                  />
                </OfficeField>
                <OfficeField label="Horário final" optional {...field("end_time")}>
                  <input
                    {...control("end_time")}
                    type="time"
                    value={form.end_time}
                    onChange={(e) => update("end_time", e.target.value)}
                  />
                </OfficeField>
              </>
            )}
            <OfficeField label="Cliente" optional {...field("client_name")}>
              <input
                {...control("client_name")}
                maxLength={160}
                value={form.client_name}
                onChange={(e) => update("client_name", e.target.value)}
              />
            </OfficeField>
            <OfficeField label="Local" optional {...field("location")}>
              <input
                {...control("location")}
                maxLength={200}
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
              />
            </OfficeField>
            <OfficeField label="Observações" className="ds-span-2" {...field("description")}>
              <textarea
                {...control("description")}
                maxLength={2000}
                rows={3}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </OfficeField>
          </div>
          {error && <ErrorState>{error}</ErrorState>}
        </fieldset>
        <div className="admin-modal__foot">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>
            {busy ? "Salvando…" : "Salvar compromisso"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EventRow({ record, listView, responsible, onEdit, onRemove }) {
  const category = eventCategories[record.category];
  const date = dayParts(record.start_date);
  const place =
    [record.client_name, record.location].filter(Boolean).join(" · ") ||
    "Sem cliente ou local informado";
  return (
    <article
      className={`office-event-card is-${record.category}${record.status === "cancelled" ? " is-cancelled" : ""}`}
    >
      {listView ? (
        <div className="office-event-when is-date" aria-hidden="true">
          <strong>{date.day}</strong>
          <span>
            {date.month} · {date.weekday}
          </span>
        </div>
      ) : record.all_day ? (
        <div className="office-event-when" aria-hidden="true">
          <strong>Dia</strong>
          <span>inteiro</span>
        </div>
      ) : (
        <div className="office-event-when" aria-hidden="true">
          <strong>{record.start_time?.slice(0, 5)}</strong>
          {record.end_time && <span>{record.end_time.slice(0, 5)}</span>}
        </div>
      )}
      <button type="button" className="office-record-title office-event-main" onClick={onEdit}>
        <span className="office-event-kicker">
          {listView ? (
            <span>{[category, eventTime(record)].filter(Boolean).join(" · ")}</span>
          ) : (
            <span>
              {category}
              <span className="ds-visually-hidden">
                {category ? " · " : ""}
                {eventTime(record)}
              </span>
            </span>
          )}
          <span className={`ds-badge ${statusTones[record.status] || "ds-badge--neutral"}`}>
            {eventStatuses[record.status]}
          </span>
        </span>
        <strong>{record.title}</strong>
        <span className="office-event-meta">
          {listView && (
            <span>
              {dateLabel(record.start_date)}
              {record.end_date !== record.start_date ? ` — ${dateLabel(record.end_date)}` : ""}
            </span>
          )}
          <span>
            <Icon name="user" size={13} />
            {responsible}
          </span>
          <span>{place}</span>
        </span>
        {record.description && (
          <span className="office-event-description">{record.description}</span>
        )}
      </button>
      <div className="office-row-actions">
        <button
          type="button"
          className="admin-icon-button"
          aria-label={`Editar ${record.title}`}
          onClick={onEdit}
        >
          <Icon name="edit" />
        </button>
        <button
          type="button"
          className="admin-icon-button admin-icon-button--danger"
          aria-label={`Excluir ${record.title}`}
          onClick={onRemove}
        >
          <Icon name="trash" />
        </button>
      </div>
    </article>
  );
}

export default function AgendaPage({ notify }) {
  const auth = useAuth(),
    currentUserId = auth.user?.id || "";
  const [params] = useSearchParams(),
    requestedDay = params.get("dia"),
    validDay =
      /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(
        requestedDay || "",
      ) && !Number.isNaN(Date.parse(requestedDay)),
    current = today(),
    initial = validDay ? requestedDay : current;
  const [month, setMonth] = useState(initial.slice(0, 7)),
    [selected, setSelected] = useState(initial),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("calendar"),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState(null),
    [removing, setRemoving] = useState(null);
  useEffect(() => {
    if (validDay) {
      const timer = setTimeout(() => {
        setMonth(requestedDay.slice(0, 7));
        setSelected(requestedDay);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [requestedDay, validDay]);
  const query = useCallback(async () => {
    const records = await listEvents(month);
    let people = [];
    try {
      people = await listTeamDirectory();
    } catch {}
    return { month, records, people };
  }, [month]);
  const { data, error, loading, reload } = useQuery(query),
    ready = data?.month === month,
    records = ready ? data.records : [],
    people = ready ? data.people || [] : [];
  useCreateIntent("compromisso", () => setEditing("new"), ready);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const responsibleName = (record) =>
    peopleById.get(record.responsible_id)?.name || "Responsável não disponível";
  const visible = records.filter(
      (record) => filter === "all" || record.category === filter,
    ),
    dayEvents = eventsOnDay(visible, selected),
    listed =
      view === "list"
        ? visible.filter((record) =>
            matchesQuery(
              search,
              record.title,
              record.client_name,
              record.location,
              record.description,
              eventCategories[record.category],
              responsibleName(record),
            ),
          )
        : visible,
    pager = usePagination(listed, {
      pageSize: 25,
      resetKey: `${month}|${filter}|${search}|${view}`,
    });
  const loadingMonth = loading && !ready,
    failed = !ready && !loading && Boolean(error),
    searching = view === "list" && Boolean(search.trim()),
    filtered = filter !== "all" || searching;
  const changeMonth = (value) => {
    setMonth(value);
    setSelected(value === current.slice(0, 7) ? current : `${value}-01`);
  };
  const selectDay = (day) => {
    setSelected(day);
    if (!day.startsWith(month)) setMonth(day.slice(0, 7));
  };
  const goToday = () => {
    setMonth(current.slice(0, 7));
    setSelected(current);
  };
  const clearFilters = () => {
    setFilter("all");
    setSearch("");
  };
  const row = (record, listView) => (
    <li key={record.id}>
      <EventRow
        record={record}
        listView={listView}
        responsible={responsibleName(record)}
        onEdit={() => setEditing(record)}
        onRemove={() => setRemoving(record)}
      />
    </li>
  );
  const count = loadingMonth
    ? "Carregando…"
    : searching
      ? `${listed.length} de ${visible.length} compromisso${visible.length === 1 ? "" : "s"}`
      : `${visible.length} compromisso${visible.length === 1 ? "" : "s"}`;
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATIVO / PRODUÇÃO"
        title="Agenda"
        description="Do primeiro encontro à última entrega."
      >
        <RefreshButton onRefresh={reload} />
        <button type="button" className="admin-button" onClick={() => setEditing("new")}>
          <Icon name="plus" />
          Novo compromisso
        </button>
      </PageTitle>
      <section className="admin-panel office-agenda">
        <div className="office-agenda-toolbar">
          <div className="office-agenda-nav">
            <MonthNavigation month={month} onChange={changeMonth} />
            <button
              type="button"
              className="admin-button admin-button--secondary admin-button--sm"
              onClick={goToday}
            >
              Hoje
            </button>
          </div>
          <div className="ds-segmented" role="group" aria-label="Visualização da agenda">
            {views.map(([key, label, icon]) => (
              <button
                type="button"
                key={key}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="office-agenda-filter">
          <div className="admin-filter-tabs" role="group" aria-label="Tipos de compromisso">
            {[["all", "Todos"], ...Object.entries(eventCategories)].map(
              ([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={filter === key}
                  className={filter === key ? "is-active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <div className="office-agenda-filter__end">
            {view === "list" && (
              <SearchField
                value={search}
                onChange={setSearch}
                label="Buscar compromissos"
                placeholder="Buscar compromisso"
              />
            )}
            <span className="office-agenda-count">{count}</span>
          </div>
        </div>
        {error && <ErrorState onRetry={reload}>{error}</ErrorState>}
        {view === "calendar" ? (
          <div className="office-agenda-body is-calendar">
            <DayGrid
              month={month}
              selected={selected}
              onSelect={selectDay}
              events={visible}
            />
            <div className="office-agenda-day">
              <div className="office-agenda-day-head">
                <div>
                  <h2>
                    {longDate(selected, {
                      year: selected.slice(0, 4) !== current.slice(0, 4),
                    })}
                  </h2>
                  {selected === current && (
                    <span className="ds-badge ds-badge--accent">Hoje</span>
                  )}
                </div>
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() => setEditing("new")}
                >
                  <Icon name="plus" />
                  Adicionar neste dia
                </button>
              </div>
              {loadingMonth ? (
                <ListSkeleton label="Carregando compromissos…" rows={2} />
              ) : failed ? (
                <p className="office-muted">
                  Não foi possível carregar os compromissos deste mês.
                </p>
              ) : dayEvents.length ? (
                <ul className="office-event-list">
                  {dayEvents.map((record) => row(record, false))}
                </ul>
              ) : (
                <div className="office-agenda-empty">
                  <Icon name="calendar" />
                  <div>
                    <strong>Espaço para a próxima ideia.</strong>
                    <p>
                      {filter === "all"
                        ? "Nenhum compromisso neste dia."
                        : "Nenhum compromisso deste tipo neste dia."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="office-agenda-list">
            {loadingMonth ? (
              <ListSkeleton label="Carregando agenda…" />
            ) : failed ? null : pager.items.length ? (
              <ul className="office-event-list">
                {pager.items.map((record) => row(record, true))}
              </ul>
            ) : (
              <EmptyState
                icon="calendar"
                title={
                  filtered
                    ? "Nenhum compromisso com esses filtros"
                    : "Sua próxima produção começa aqui"
                }
                action={
                  filtered ? (
                    <button
                      type="button"
                      className="admin-button admin-button--secondary"
                      onClick={clearFilters}
                    >
                      Limpar filtros
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => setEditing("new")}
                    >
                      <Icon name="plus" />
                      Novo compromisso
                    </button>
                  )
                }
              >
                {filtered
                  ? `Nada encontrado em ${monthLabel(month)}. Ajuste a busca ou escolha outro tipo.`
                  : "Adicione gravações, reuniões, edições e entregas à agenda."}
              </EmptyState>
            )}
          </div>
        )}
        {view === "list" && <Pagination pager={pager} noun="compromissos" />}
        <div className="office-agenda-footer">
          <span>
            <i aria-hidden="true" />
            Hoje
          </span>
          <span>
            <Icon name="clock" />
            Horário de Brasília · agenda privada da DUUK
          </span>
        </div>
      </section>
      {editing && (
        <EventEditor
          record={editing === "new" ? null : editing}
          day={selected}
          people={people}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reload();
            notify("Compromisso salvo na agenda.");
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          title="Excluir compromisso?"
          message={`“${removing.title}” será removido da agenda.`}
          action="Excluir compromisso"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteEvent(removing);
            await reload();
            notify("Compromisso excluído.");
          }}
        />
      )}
    </>
  );
}
