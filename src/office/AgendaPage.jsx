import { LoadingPanel } from "../admin/forms";
import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useCallback, useEffect, useState } from "react";
import { ConfirmModal, Icon, Modal, RefreshButton } from "../admin/components";
import { deleteEvent, listEvents, listTeamDirectory, saveEvent } from "./api";
import { DateField, DayGrid, MonthNavigation } from "./Calendar";
import {
  eventCategories,
  eventPayload,
  eventsOnDay,
  eventStatuses,
  eventTime,
} from "./calendarModel.js";
import { dateLabel, today } from "./model";
import { useQuery } from "./useQuery";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../content/AuthContext";

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
  useUnsavedChanges(true);
  const update = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
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
      <form onSubmit={save}>
        <fieldset disabled={busy} className="office-form">
          <label className="admin-field">
            <span>Título do compromisso</span>
            <input
              required
              maxLength={160}
              value={form.title}
              placeholder="Ex.: Gravação · campanha de lançamento"
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <div className="admin-field-row">
            <label className="admin-field">
              <span>Tipo</span>
              <select
                aria-label="Tipo"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
              >
                {Object.entries(eventCategories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Situação</span>
              <select
                aria-label="Situação"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {Object.entries(eventStatuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="admin-field">
            <span>Responsável pelo compromisso</span>
            <select
              required
              aria-label="Responsável pelo compromisso"
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
            <small>
              Essa pessoa ficará registrada na agenda e aparecerá nos detalhes
              do compromisso.
            </small>
          </label>
          <div className="admin-field-row">
            <DateField
              label="Data inicial"
              value={form.start_date}
              min="1900-01-01"
              max="2100-12-31"
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  start_date: value,
                  end_date:
                    previous.end_date < value ? value : previous.end_date,
                }))
              }
            />
            <DateField
              label="Data final"
              value={form.end_date}
              min={form.start_date}
              onChange={(value) => update("end_date", value)}
            />
          </div>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => update("all_day", e.target.checked)}
            />
            Dia inteiro
          </label>
          {!form.all_day && (
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Horário inicial</span>
                <input
                  type="time"
                  required
                  value={form.start_time}
                  onChange={(e) => update("start_time", e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>Horário final · opcional</span>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => update("end_time", e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="admin-field">
            <span>Cliente · opcional</span>
            <input
              maxLength={160}
              value={form.client_name}
              onChange={(e) => update("client_name", e.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Local · opcional</span>
            <input
              maxLength={200}
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Observações</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
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
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar compromisso"}
          </button>
        </div>
      </form>
    </Modal>
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
    records = data?.month === month ? data.records : [],
    visible = records.filter(
      (record) => filter === "all" || record.category === filter,
    ),
    dayEvents = eventsOnDay(visible, selected);
  const people = data?.month === month ? data.people || [] : [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const responsibleName = (record) =>
    peopleById.get(record.responsible_id)?.name || "Responsável não disponível";
  const changeMonth = (value) => {
    setMonth(value);
    setSelected(value === current.slice(0, 7) ? current : `${value}-01`);
  };
  const selectDay = (day) => {
    setSelected(day);
    if (!day.startsWith(month)) setMonth(day.slice(0, 7));
  };
  const eventCard = (record) => (
    <article
      className={`office-event-card is-${record.category}${record.status === "cancelled" ? " is-cancelled" : ""}`}
      key={record.id}
    >
      <span className="office-event-mark" />
      <button
        type="button"
        className="office-record-title"
        onClick={() => setEditing(record)}
      >
        <span className="office-event-kicker">
          {eventCategories[record.category]} · {eventTime(record)}
        </span>
        <strong>{record.title}</strong>
        <small className="office-event-responsible">
          <Icon name="user" size={13} />
          {responsibleName(record)}
        </small>
        <small>
          {view === "list"
            ? `${dateLabel(record.start_date)}${record.end_date !== record.start_date ? ` — ${dateLabel(record.end_date)}` : ""} · `
            : ""}
          {[record.client_name, record.location].filter(Boolean).join(" · ") ||
            "Sem cliente ou local informado"}
        </small>
        {record.description && <small>{record.description}</small>}
      </button>
      <span
        className={`office-badge ${record.status === "done" ? "is-done" : record.status === "confirmed" ? "is-pending" : ""}`}
      >
        {eventStatuses[record.status]}
      </span>
      <div className="office-row-actions">
        <button
          className="admin-icon-button"
          aria-label={`Editar ${record.title}`}
          onClick={() => setEditing(record)}
        >
          <Icon name="edit" />
        </button>
        <button
          className="admin-icon-button admin-icon-button--danger"
          aria-label={`Excluir ${record.title}`}
          onClick={() => setRemoving(record)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </article>
  );
  return (
    <>
      <div className="admin-page-title">
        <div>
          <p className="admin-eyebrow">ADMINISTRATIVO / PRODUÇÃO</p>
          <h1>
            Agenda<span>.</span>
          </h1>
          <p>Do primeiro encontro à última entrega.</p>
        </div>
        <RefreshButton onRefresh={reload} />
        <button className="admin-button" onClick={() => setEditing("new")}>
          <Icon name="plus" />
          Novo compromisso
        </button>
      </div>
      <section className="admin-panel office-agenda">
        <div className="office-agenda-toolbar">
          <MonthNavigation month={month} onChange={changeMonth} />
          <div className="office-agenda-controls">
            <button
              className="admin-button admin-button--secondary"
              onClick={() => {
                setMonth(current.slice(0, 7));
                setSelected(current);
              }}
            >
              Hoje
            </button>
            <div
              className="admin-filter-tabs"
              aria-label="Visualização da agenda"
            >
              {[
                ["calendar", "Calendário"],
                ["list", "Lista"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={view === key}
                  className={view === key ? "is-active" : ""}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="office-agenda-filter">
          <div className="admin-filter-tabs" aria-label="Tipos de compromisso">
            {[["all", "Todos"], ...Object.entries(eventCategories)].map(
              ([key, label]) => (
                <button
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
          <span className="office-muted">
            {loading && data?.month !== month
              ? "Carregando…"
              : `${visible.length} compromisso${visible.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {error && (
          <p className="admin-error office-agenda-error" role="alert">
            {error}{" "}
            <button className="admin-text-button" onClick={reload}>
              Tentar novamente
            </button>
          </p>
        )}
        {view === "calendar" ? (
          <>
            <DayGrid
              month={month}
              selected={selected}
              onSelect={selectDay}
              events={visible}
            />
            <div className="office-agenda-day">
              <div className="office-section-title">
                <div>
                  <p className="admin-eyebrow">EM CENA NESTE DIA</p>
                  <h2>{dateLabel(selected)}</h2>
                </div>
                <button
                  className="admin-text-button"
                  onClick={() => setEditing("new")}
                >
                  <Icon name="plus" size={16} />
                  Adicionar neste dia
                </button>
              </div>
              {loading && data?.month !== month ? (
                <LoadingPanel label="Carregando compromissos…" />
              ) : dayEvents.length ? (
                dayEvents.map(eventCard)
              ) : (
                <div className="office-agenda-empty">
                  <Icon name="calendar" size={26} />
                  <div>
                    <strong>Espaço para a próxima ideia.</strong>
                    <p>Nenhum compromisso neste dia.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="office-agenda-list">
            {loading && data?.month !== month ? (
              <LoadingPanel label="Carregando agenda…" />
            ) : visible.length ? (
              visible.map(eventCard)
            ) : (
              <div className="admin-empty">
                <Icon name="calendar" size={36} />
                <h2>Sua próxima produção começa aqui</h2>
                <p>
                  Adicione gravações, reuniões, edições e entregas à agenda.
                </p>
              </div>
            )}
          </div>
        )}
        <div className="office-agenda-footer">
          <span>
            <i />
            Hoje
          </span>
          <span>Horário de Brasília · agenda privada da DUUK</span>
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
