import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCreateIntent, useMediaQuery } from "../admin/shell/hooks";
import "./crm.css";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { brl, cents } from "../office/model";
import { ConfirmModal, Icon, Modal, RefreshButton } from "../admin/components";
import {
  Avatar,
  EmptyState,
  ErrorState,
  FieldError,
  PageTitle,
  Pagination,
  SearchField,
} from "../admin/forms";
import { matchesQuery, usePagination } from "../admin/ds/list";
import {
  recordContact,
  addFollowup,
  clientHistory,
  commercialData,
  completeFollowup,
  deleteClient,
  movePipeline,
  saveClient,
  rescheduleFollowup,
} from "./api";
import {
  channels,
  commercialStats,
  fmtTime,
  localDay,
  localInput,
  stageLabel,
  stages,
  timestamp,
} from "./model";

import PipelineBoard, { StageIcon } from "./PipelineBoard";
import { WhatsAppComposer } from "./WhatsAppMessages";
import { whatsappPhone } from "./whatsapp";
import { focusFirstError, formErrors, hasErrors } from "./formErrors";

import { ClientProposals, ClientDocuments } from "../office/DriveDocuments";

const initialClient = {
  name: "",
  company: "",
  phone: "",
  whatsapp: "",
  email: "",
  instagram: "",
  website: "",
  city: "",
  segment: "",
  source: "",
  owner_id: "",
  stage: "new",
  notes: "",
  first_contact: "",
  next_follow_up: "",
  estimated: "",
  tags: "",
  project_name: "",
  event_date: "",
};
const phoneError =
  "Informe um telefone válido com DDI e DDD. Exemplo: +55 11 99999-9999.";
const channelIcons = {
  call: "phone",
  whatsapp: "message",
  email: "mail",
  instagram: "instagram",
  meeting: "users",
  other: "comment",
};
const periods = [
  ["pending", "Pendentes"],
  ["overdue", "Atrasados"],
  ["today", "Hoje"],
  ["tomorrow", "Amanhã"],
  ["upcoming", "Próximos"],
  ["done", "Concluídos"],
];
const channelLabel = (key) => channels.find((c) => c[0] === key)?.[1] || "Outro";

// Label, control, hint and field-level error, linked for assistive technology.
function Control({ id, label, error, hint, wide, children }) {
  return (
    <div className={`admin-field${wide ? " ds-span-2" : ""}`}>
      <label className="admin-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
const fieldProps = (uid, key, errors, hint) => ({
  id: `${uid}-${key}`,
  name: key,
  "aria-invalid": errors[key] ? true : undefined,
  "aria-describedby": errors[key]
    ? `${uid}-${key}-error`
    : hint
      ? `${uid}-${key}-hint`
      : undefined,
});

function StageBadge({ stage }) {
  const tone =
    stage === "won" ? " ds-badge--success" : stage === "lost" ? " crm-stage--lost" : "";
  return (
    <span className={`ds-badge crm-stage${tone}`}>
      <StageIcon stage={stage} size={12} />
      {stageLabel(stage)}
    </span>
  );
}

function ClientEditor({ record, people, onClose, onSaved }) {
  const auth = useAuth(),
    uid = useId(),
    [form, setForm] = useState(() =>
      record
        ? {
            ...record,
            owner_id: record.owner_id || "",
            first_contact: record.first_contact || "",
            event_date: record.event_date || "",
            next_follow_up: record.next_follow_up
              ? localInput(record.next_follow_up)
              : "",
            // An empty field saves the same zero value without asking for "0,00".
            estimated: record.estimated_cents
              ? String(record.estimated_cents / 100).replace(".", ",")
              : "",
            tags: record.tags.join(", "),
          }
        : { ...initialClient, owner_id: auth.user.id },
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  useUnsavedChanges(true);
  const update = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  };
  const hints = {
    phone: "Inclua DDI e DDD. Exemplo: +55 11 99999-9999.",
    tags: "Separe com vírgulas. Até 20 tags.",
  };
  const text = (key, label, max, extra = {}) => (
    <Control
      id={`${uid}-${key}`}
      label={label}
      error={errors[key]}
      hint={hints[key]}
    >
      <input
        {...fieldProps(uid, key, errors, hints[key])}
        type="text"
        value={form[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
        maxLength={max}
        {...extra}
      />
    </Control>
  );
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const custom = {};
    if (!form.name.trim()) custom.name = "Informe o nome do cliente.";
    if (!form.phone) custom.phone = "Informe o telefone com DDI e DDD.";
    else if (!whatsappPhone(form.phone)) custom.phone = phoneError;
    if (form.whatsapp && !whatsappPhone(form.whatsapp))
      custom.whatsapp = phoneError;
    if (form.estimated) {
      try {
        cents(form.estimated);
      } catch (cause) {
        custom.estimated = cause.message;
      }
    }
    const tagList = form.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (tagList.join(",").length > 1200)
      custom.tags = "Use até 1.200 caracteres no total das tags.";
    const found = formErrors(e.currentTarget, custom);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstError(e.currentTarget, found);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.keys(initialClient)
          .filter((k) => !["estimated", "tags"].includes(k))
          .map((k) => [k, form[k]]),
      );
      payload.owner_id = payload.owner_id || null;
      payload.event_date = payload.event_date || null;
      for (const key of ["phone", "whatsapp"]) {
        if (payload[key]) {
          const phone = whatsappPhone(payload[key]);
          if (!phone) throw new Error(phoneError);
          payload[key] = phone.number;
        }
      }
      payload.first_contact = payload.first_contact || null;
      payload.next_follow_up = timestamp(payload.next_follow_up);
      payload.estimated_cents = form.estimated ? cents(form.estimated) : 0;
      payload.tags = tagList;
      await saveClient(payload, record);
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
      title={record ? "Editar cliente" : "Novo cliente / lead"}
      subtitle="Cada oportunidade começa com uma conversa."
      onClose={() => !busy && onClose()}
      wide
    >
      <form onSubmit={submit} noValidate>
        <div className="admin-modal__body crm-form">
          <fieldset className="crm-form__section" disabled={busy}>
            <legend>Contato</legend>
            <div className="admin-form-grid">
              {text("name", "Nome", 160, { required: true, autoComplete: "off" })}
              {text("company", "Empresa", 160, { autoComplete: "off" })}
              {text("phone", "Telefone com DDI e DDD", 40, {
                type: "tel",
                required: true,
                placeholder: "+55 11 99999-9999",
                autoComplete: "off",
              })}
              {text("whatsapp", "Outro número de WhatsApp (opcional)", 40, {
                type: "tel",
                placeholder: "+55 11 99999-9999",
                autoComplete: "off",
              })}
              {text("email", "E-mail", 254, { type: "email", autoComplete: "off" })}
              {text("instagram", "Instagram", 160, { autoComplete: "off" })}
              {text("website", "Site", 500, {
                type: "url",
                placeholder: "https://",
                autoComplete: "off",
              })}
            </div>
          </fieldset>
          <fieldset className="crm-form__section" disabled={busy}>
            <legend>Projeto e origem</legend>
            <div className="admin-form-grid">
              {text("project_name", "Nome do projeto", 160)}
              {text("event_date", "Data do evento", undefined, { type: "date" })}
              {text("city", "Cidade", 120)}
              {text("segment", "Segmento", 120)}
              {text("source", "Origem do lead", 120)}
            </div>
          </fieldset>
          <fieldset className="crm-form__section" disabled={busy}>
            <legend>Negociação</legend>
            <div className="admin-form-grid">
              <Control id={`${uid}-owner_id`} label="Responsável">
                <select
                  {...fieldProps(uid, "owner_id", errors)}
                  value={form.owner_id}
                  onChange={(e) => update("owner_id", e.target.value)}
                >
                  <option value="">Sem responsável</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Control>
              <Control id={`${uid}-stage`} label="Etapa">
                <select
                  {...fieldProps(uid, "stage", errors)}
                  value={form.stage}
                  onChange={(e) => update("stage", e.target.value)}
                >
                  {stages.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Control>
              {text("first_contact", "Primeiro contato", undefined, { type: "date" })}
              {text("next_follow_up", "Próximo follow-up", undefined, {
                type: "datetime-local",
              })}
              {text("estimated", "Valor estimado (R$)", undefined, {
                inputMode: "decimal",
                placeholder: "0,00",
              })}
              {text("tags", "Tags (separadas por vírgula)", undefined)}
              <Control
                id={`${uid}-notes`}
                label="Observações"
                error={errors.notes}
                wide
              >
                <textarea
                  {...fieldProps(uid, "notes", errors)}
                  rows={4}
                  maxLength={5000}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Control>
            </div>
          </fieldset>
          {error && <ErrorState>{error}</ErrorState>}
        </div>
        <div className="admin-modal__foot">
          <button
            className="admin-button admin-button--secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="admin-button" disabled={busy} aria-busy={busy}>
            {busy ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ActivityEditor({ clients, clientId, onClose, onSaved }) {
  const auth = useAuth(),
    uid = useId();
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
      client_id: clientId || clients[0]?.id || "",
      occurred_at: localInput(),
      channel: "whatsapp",
      notes: "",
      result: "",
      next_step: "",
      new_stage: "",
      next_due: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  useUnsavedChanges(true);
  const update = (k, v) => {
    setForm((old) => ({ ...old, [k]: v }));
    setErrors((old) => (old[k] ? { ...old, [k]: "" } : old));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    // The contact RPC rejects empty notes, future contact dates and past next contacts.
    const custom = {};
    if (!form.notes.trim()) custom.notes = "Descreva o que foi conversado.";
    if (
      form.occurred_at &&
      Date.parse(timestamp(form.occurred_at)) > Date.now() + 5 * 60000
    )
      custom.occurred_at =
        "Use a data e o horário em que o contato aconteceu, sem datas futuras.";
    if (form.next_due && Date.parse(timestamp(form.next_due)) <= Date.now())
      custom.next_due = "Escolha uma data futura para o próximo contato.";
    const found = formErrors(e.currentTarget, custom);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstError(e.currentTarget, found);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const client = clients.find((item) => item.id === form.client_id);
      await recordContact({
        target: form.client_id,
        revision: client.version,
        request_id: requestId,
        contacted_at: timestamp(form.occurred_at),
        contact_channel: form.channel,
        contact_notes: form.notes,
        outcome: form.result,
        next_step: form.next_step,
        next_due: timestamp(form.next_due),
        new_stage: form.new_stage || null,
      });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Registrar contato realizado" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} noValidate>
        <div className="admin-modal__body admin-form-grid">
          <Control id={`${uid}-client_id`} label="Cliente" error={errors.client_id}>
            <select
              {...fieldProps(uid, "client_id", errors)}
              required
              value={form.client_id}
              onChange={(e) => update("client_id", e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Control>
          <Control
            id={`${uid}-occurred_at`}
            label="Data e horário · Brasília"
            error={errors.occurred_at}
          >
            <input
              {...fieldProps(uid, "occurred_at", errors)}
              type="datetime-local"
              required
              value={form.occurred_at}
              onChange={(e) => update("occurred_at", e.target.value)}
            />
          </Control>
          <Control id={`${uid}-channel`} label="Canal">
            <select
              {...fieldProps(uid, "channel", errors)}
              value={form.channel}
              onChange={(e) => update("channel", e.target.value)}
            >
              {channels.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Control>
          <Control
            id={`${uid}-notes`}
            label="O que foi conversado?"
            error={errors.notes}
            wide
          >
            <textarea
              {...fieldProps(uid, "notes", errors)}
              required
              maxLength={3000}
              rows={4}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Control>
          <Control id={`${uid}-result`} label="Resultado" error={errors.result}>
            <input
              {...fieldProps(uid, "result", errors)}
              maxLength={500}
              value={form.result}
              onChange={(e) => update("result", e.target.value)}
            />
          </Control>
          <Control id={`${uid}-next_step`} label="Próximo passo" error={errors.next_step}>
            <input
              {...fieldProps(uid, "next_step", errors)}
              maxLength={500}
              value={form.next_step}
              onChange={(e) => update("next_step", e.target.value)}
            />
          </Control>
          {(auth.hasPermission("crm.pipeline") || auth.hasPermission("crm.clients")) && (
            <Control id={`${uid}-new_stage`} label="Atualizar negociação">
              <select
                {...fieldProps(uid, "new_stage", errors)}
                value={form.new_stage}
                onChange={(event) => update("new_stage", event.target.value)}
              >
                <option value="">Manter etapa atual</option>
                {stages.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Control>
          )}
          {auth.hasPermission("crm.followups") && (
            <Control
              id={`${uid}-next_due`}
              label="Próximo contato (opcional)"
              error={errors.next_due}
            >
              <input
                {...fieldProps(uid, "next_due", errors)}
                type="datetime-local"
                value={form.next_due}
                onChange={(e) => update("next_due", e.target.value)}
              />
            </Control>
          )}
          {error && <ErrorState>{error}</ErrorState>}
        </div>
        <div className="admin-modal__foot">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="admin-button"
            disabled={busy || !clients.length}
            aria-busy={busy}
          >
            {busy ? "Salvando…" : "Registrar contato realizado"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function FollowupEditor({
  clients,
  people,
  clientId,
  onClose,
  onSaved,
  complete,
  reschedule,
}) {
  const auth = useAuth(),
    uid = useId(),
    [form, setForm] = useState({
      client_id: reschedule?.client_id || clientId || clients[0]?.id || "",
      owner_id: reschedule?.owner_id || auth.user.id,
      due_at: reschedule ? localInput(reschedule.due_at) : localInput(),
      notes: reschedule?.notes || "",
      result: "",
      next_due: "",
      new_stage: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  useUnsavedChanges(true);
  const update = (k, v) => {
    setForm((old) => ({ ...old, [k]: v }));
    setErrors((old) => (old[k] ? { ...old, [k]: "" } : old));
  };
  const clientName = clients.find(
    (c) => c.id === (complete?.client_id || reschedule?.client_id),
  )?.name;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const custom = {};
    if (complete && !form.result.trim())
      custom.result = "Informe o resultado do contato.";
    const found = formErrors(e.currentTarget, custom);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstError(e.currentTarget, found);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (complete)
        await completeFollowup({
          target: complete.id,
          revision: complete.version,
          outcome: form.result,
          next_due: timestamp(form.next_due),
          new_stage: form.new_stage || null,
        });
      else if (reschedule) await rescheduleFollowup(reschedule, timestamp(form.due_at));
      else
        await addFollowup({
          client_id: form.client_id,
          owner_id: form.owner_id,
          due_at: timestamp(form.due_at),
          notes: form.notes,
        });
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
      title={complete ? "Concluir follow-up" : reschedule ? "Reagendar follow-up" : "Agendar follow-up"}
      subtitle={complete || reschedule ? clientName : undefined}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} noValidate>
        <div className="admin-modal__body admin-form-grid">
          {complete ? (
            <>
              <Control
                id={`${uid}-result`}
                label="Resultado do contato"
                error={errors.result}
                wide
              >
                <textarea
                  {...fieldProps(uid, "result", errors)}
                  required
                  maxLength={1000}
                  rows={3}
                  value={form.result}
                  onChange={(e) => update("result", e.target.value)}
                />
              </Control>
              <Control
                id={`${uid}-next_due`}
                label="Próximo follow-up (opcional)"
                error={errors.next_due}
              >
                <input
                  {...fieldProps(uid, "next_due", errors)}
                  type="datetime-local"
                  value={form.next_due}
                  onChange={(e) => update("next_due", e.target.value)}
                />
              </Control>
              <Control id={`${uid}-new_stage`} label="Atualizar etapa">
                <select
                  {...fieldProps(uid, "new_stage", errors)}
                  disabled={!auth.hasPermission("crm.pipeline") && !auth.hasPermission("crm.clients")}
                  value={form.new_stage}
                  onChange={(e) => update("new_stage", e.target.value)}
                >
                  <option value="">Manter etapa atual</option>
                  {stages.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Control>
            </>
          ) : (
            <>
              <Control id={`${uid}-client_id`} label="Cliente" error={errors.client_id}>
                <select
                  {...fieldProps(uid, "client_id", errors)}
                  required
                  disabled={!!reschedule}
                  value={form.client_id}
                  onChange={(e) => update("client_id", e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Control>
              <Control id={`${uid}-owner_id`} label="Responsável" error={errors.owner_id}>
                <select
                  {...fieldProps(uid, "owner_id", errors)}
                  required
                  disabled={!!reschedule}
                  value={form.owner_id}
                  onChange={(e) => update("owner_id", e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Control>
              <Control
                id={`${uid}-due_at`}
                label="Data e horário · Brasília"
                error={errors.due_at}
              >
                <input
                  {...fieldProps(uid, "due_at", errors)}
                  required
                  type="datetime-local"
                  value={form.due_at}
                  onChange={(e) => update("due_at", e.target.value)}
                />
              </Control>
              <Control id={`${uid}-notes`} label="Observações" error={errors.notes} wide>
                <textarea
                  {...fieldProps(uid, "notes", errors)}
                  disabled={!!reschedule}
                  maxLength={2000}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Control>
            </>
          )}
          {error && <ErrorState>{error}</ErrorState>}
        </div>
        <div className="admin-modal__foot">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="admin-button"
            disabled={busy || !clients.length}
            aria-busy={busy}
          >
            {busy
              ? "Salvando…"
              : complete
                ? "Concluir contato"
                : reschedule
                  ? "Reagendar"
                  : "Agendar follow-up"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailList({ items }) {
  return (
    <dl className="crm-detail__grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value ? undefined : "is-empty"}>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
function ClientDetail({
  client,
  people,
  onClose,
  onEdit,
  onActivity,
  onFollowup,
  onEmail,
  onWhatsApp,

  canProposals,
  notify,
}) {
  const query = useQuery(
    useCallback(() => clientHistory(client.id), [client.id]),
  );
  const owner = people.find((p) => p.id === client.owner_id);
  return (
    <Modal
      title={client.name}
      subtitle={client.company || stageLabel(client.stage)}
      onClose={onClose}
      wide
    >
      <div className="admin-modal__body crm-detail">
        <dl className="crm-detail__summary">
          <div>
            <dt>Etapa</dt>
            <dd>
              <StageBadge stage={client.stage} />
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd className="crm-person">
              <Avatar profile={owner} size={20} />
              <span>{owner?.name || "Sem responsável"}</span>
            </dd>
          </div>
          <div>
            <dt>Valor estimado</dt>
            <dd className="crm-detail__money">{brl(client.estimated_cents)}</dd>
          </div>
          <div>
            <dt>Próximo follow-up</dt>
            <dd>{fmtTime(client.next_follow_up)}</dd>
          </div>
        </dl>
        <section className="crm-detail__section">
          <h3>Contato</h3>
          <DetailList
            items={[
              ["E-mail", client.email],
              ["Telefone", client.phone],
              ["WhatsApp", client.whatsapp],
              ["Instagram", client.instagram],
              ["Site", client.website],
            ]}
          />
        </section>
        <section className="crm-detail__section">
          <h3>Projeto e origem</h3>
          <DetailList
            items={[
              ["Projeto", client.project_name],
              ["Data do evento", client.event_date?.split("-").reverse().join("/")],
              ["Cidade", client.city],
              ["Segmento", client.segment],
              ["Origem", client.source],
              ["Último contato", client.last_contact ? fmtTime(client.last_contact) : ""],
              ["Tags", client.tags.join(", ")],
            ]}
          />
        </section>
        {client.notes && (
          <section className="crm-detail__section">
            <h3>Observações</h3>
            <p className="crm-notes">{client.notes}</p>
          </section>
        )}
        {canProposals && (
          <div className="crm-detail__files">
            <ClientProposals client={client} notify={notify} />
            <ClientDocuments client={client} notify={notify} />
          </div>
        )}
        <section className="crm-detail__section">
          <h3>Histórico do cliente</h3>
          {query.error && (
            <ErrorState onRetry={query.reload}>
              Não foi possível carregar o histórico. {query.error}
            </ErrorState>
          )}
          {query.loading && !query.data ? (
            <div className="crm-timeline-skeleton" role="status">
              <span className="ds-visually-hidden">Carregando o histórico…</span>
              {[0, 1, 2].map((item) => (
                <div key={item} aria-hidden="true">
                  <span className="ds-skeleton ds-skeleton--circle" />
                  <span className="ds-skeleton ds-skeleton--text" />
                </div>
              ))}
            </div>
          ) : query.data?.length ? (
            <ol className="crm-timeline">
              {query.data.map((h) => (
                <li key={h.id}>
                  <span className="crm-timeline__dot" aria-hidden="true" />
                  <div>
                    <h4>{h.action}</h4>
                    <p className="crm-timeline__meta">
                      {h.actor_name} ·{" "}
                      <time dateTime={h.created_at}>{fmtTime(h.created_at)}</time>
                    </p>
                    {h.details.stage && (
                      <p>
                        {h.details.previous_stage
                          ? `${stageLabel(h.details.previous_stage)} → `
                          : ""}
                        {stageLabel(h.details.stage)}
                      </p>
                    )}
                    {h.details.notes && <p>{h.details.notes}</p>}
                    {h.details.result && <p>Resultado: {h.details.result}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            query.data && (
              <p className="crm-detail__empty">
                Nenhum registro no histórico deste cliente ainda.
              </p>
            )
          )}
        </section>
      </div>
      <div className="admin-modal__foot crm-detail__actions">
        <div className="crm-detail__quick">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onWhatsApp}
            aria-label="Conversar no WhatsApp"
          >
            <Icon name="message" />
            <span className="crm-long">Conversar no WhatsApp</span>
            <span className="crm-short">WhatsApp</span>
          </button>
          {onEmail && (
            <Link
              className="admin-button admin-button--secondary"
              to={`/admin/comercial/emails?cliente=${client.id}&compor=1`}
              aria-label="Enviar e-mail"
            >
              <Icon name="mail" />
              <span className="crm-long">Enviar e-mail</span>
              <span className="crm-short">E-mail</span>
            </Link>
          )}
          {onEdit && (
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={onEdit}
            >
              <Icon name="edit" />
              Editar
            </button>
          )}
          {onFollowup && (
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={onFollowup}
            >
              <Icon name="clock" />
              Follow-up
            </button>
          )}
        </div>
        {onActivity && (
          <button type="button" className="admin-button" onClick={onActivity}>
            <Icon name="plus" />
            Registrar contato realizado
          </button>
        )}
      </div>
    </Modal>
  );
}

// Single-series bar list. Values are written next to each label, so the bars only add shape.
function BarList({ label, items, empty }) {
  if (!items.length) return <p className="crm-chart__empty">{empty}</p>;
  return (
    <ul className="crm-bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="crm-bars__label">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <span className="crm-bars__track" aria-hidden="true">
            <i style={{ width: `${Math.min(1, item.share) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
function ChartCard({ title, description, children }) {
  const id = useId();
  return (
    <section className="ds-card crm-chart" aria-labelledby={id}>
      <div className="crm-chart__head">
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
function CommercialOverview({ data, report = false, filters }) {
  const clients = filters
    ? data.clients.filter(
        (c) =>
          (!filters.owner || c.owner_id === filters.owner) &&
          (!filters.source || c.source === filters.source),
      )
    : data.clients;
  const clientIds = new Set(clients.map((c) => c.id));
  const activities = data.activities.filter(
    (a) =>
      clientIds.has(a.client_id) &&
      (!filters?.owner || a.user_id === filters.owner) &&
      (!filters?.from || localDay(a.occurred_at) >= filters.from) &&
      (!filters?.to || localDay(a.occurred_at) <= filters.to),
  );
  const stats = commercialStats(
    clients,
    activities,
    data.followups.filter((f) => clientIds.has(f.client_id) && (!filters?.owner || f.owner_id === filters.owner)),
  );
  const origin = Object.entries(
    clients.reduce(
      (all, c) => ({
        ...all,
        [c.source || "Não informada"]:
          (all[c.source || "Não informada"] || 0) + 1,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  const days = Object.entries(
    activities.reduce(
      (all, a) => ({
        ...all,
        [localDay(a.occurred_at)]: (all[localDay(a.occurred_at)] || 0) + 1,
      }),
      {},
    ),
  )
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14)
    .reverse();
  const busiestDay = Math.max(...days.map((d) => d[1]), 1);
  return (
    <>
      <dl className="crm-stats crm-kpis">
        {[
          ["Clientes cadastrados", stats.total],
          ["Negociações em andamento", stats.inProgress],
          ["Contatos registrados no período", stats.contacts],
          ["Contatos hoje", stats.today],
          ["Esta semana", stats.week],
          ["Este mês", stats.month],
          ["Em negociação", stats.negotiating],
          ["Propostas aguardando resposta", stats.proposals],
          ["Negociações concluídas", stats.won],
          ["Perdidos", stats.lost],
          ["Follow-ups pendentes", stats.pending],
          ["Conversão de oportunidades concluídas", `${stats.conversion}%`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <strong>{value}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <div className="crm-charts">
        <ChartCard title="Contatos por pessoa">
          <BarList
            label="Contatos registrados por pessoa"
            empty="A equipe aparece após o primeiro cadastro."
            items={data.people.map((p) => {
              const count = activities.filter((a) => a.user_id === p.id).length;
              return {
                key: p.id,
                label: (
                  <>
                    <Avatar profile={p} size={20} />
                    {p.name}
                  </>
                ),
                value: count,
                share: activities.length ? count / activities.length : 0,
              };
            })}
          />
        </ChartCard>
        <ChartCard title="Origem dos leads">
          <BarList
            label="Leads por origem"
            empty="Adicione leads para acompanhar as origens."
            items={origin.map(([name, count]) => ({
              key: name,
              label: name,
              value: count,
              share: clients.length ? count / clients.length : 0,
            }))}
          />
        </ChartCard>
        {report && (
          <>
            <ChartCard
              title="Contatos por dia"
              description="Dias mais recentes com contatos registrados no período."
            >
              <BarList
                label="Contatos por dia"
                empty="Nenhum contato no período."
                items={days.map(([day, count]) => ({
                  key: day,
                  label: day.split("-").reverse().join("/"),
                  value: count,
                  share: count / busiestDay,
                }))}
              />
            </ChartCard>
            <ChartCard title="Oportunidades por etapa">
              <BarList
                label="Oportunidades por etapa"
                empty="Nenhuma oportunidade cadastrada."
                items={stages.map(([key, label]) => {
                  const count = clients.filter((c) => c.stage === key).length;
                  return {
                    key,
                    label: (
                      <>
                        <StageIcon stage={key} />
                        {label}
                      </>
                    ),
                    value: count,
                    share: clients.length ? count / clients.length : 0,
                  };
                })}
              />
            </ChartCard>
          </>
        )}
      </div>
    </>
  );
}

function ReportFilters({ data, filters, onChange, withSource = false }) {
  const uid = useId(),
    [open, setOpen] = useState(false);
  const set = (key, value) => onChange((previous) => ({ ...previous, [key]: value }));
  const invalidRange = !!(filters.from && filters.to && filters.to < filters.from);
  const count = [filters.owner, filters.source, filters.from, filters.to].filter(Boolean).length;
  return (
    <section className="crm-report-filters" aria-label="Filtros do relatório">
      <button
        type="button"
        className="admin-button admin-button--secondary crm-report-filters__toggle"
        aria-expanded={open}
        aria-controls={`${uid}-fields`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="filter" />
        Filtros
        {count > 0 && (
          <span className="crm-toolbar__count">
            {count}
            <span className="ds-visually-hidden"> ativos</span>
          </span>
        )}
      </button>
      <div
        id={`${uid}-fields`}
        className={`crm-report-filters__fields${open || invalidRange ? " is-open" : ""}`}
      >
        <div className="admin-field">
          <label className="admin-label" htmlFor={`${uid}-owner`}>
            Responsável
          </label>
          <select
            id={`${uid}-owner`}
            value={filters.owner}
            onChange={(event) => set("owner", event.target.value)}
          >
            <option value="">Toda a equipe</option>
            {data.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        {withSource && (
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${uid}-source`}>
              Origem
            </label>
            <select
              id={`${uid}-source`}
              value={filters.source}
              onChange={(event) => set("source", event.target.value)}
            >
              <option value="">Todas</option>
              {[...new Set(data.clients.map((c) => c.source).filter(Boolean))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <div className="admin-field">
          <label className="admin-label" htmlFor={`${uid}-from`}>
            Contatos a partir de
          </label>
          <input
            id={`${uid}-from`}
            type="date"
            value={filters.from}
            onChange={(event) => set("from", event.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={`${uid}-to`}>
            Até
          </label>
          <input
            id={`${uid}-to`}
            type="date"
            min={filters.from}
            value={filters.to}
            aria-invalid={invalidRange || undefined}
            aria-describedby={invalidRange ? `${uid}-to-error` : undefined}
            onChange={(event) => set("to", event.target.value)}
          />
          <FieldError id={`${uid}-to-error`}>
            {invalidRange && "Escolha uma data igual ou posterior ao início."}
          </FieldError>
        </div>
        {count > 0 && (
          <button
            type="button"
            className="admin-text-button crm-report-filters__clear"
            onClick={() => onChange({ owner: "", source: "", from: "", to: "" })}
          >
            Limpar filtros
          </button>
        )}
      </div>
    </section>
  );
}

// Search on the left; filters inline on larger screens and behind one button on phones.
function FilterBar({ search, onSearch, placeholder, active, onClear, children }) {
  const [open, setOpen] = useState(false),
    id = useId();
  return (
    <div className="crm-toolbar">
      <div className="crm-toolbar__search">
        <SearchField
          value={search}
          onChange={onSearch}
          label="Buscar no Comercial"
          placeholder={placeholder}
        />
        <button
          type="button"
          className="admin-button admin-button--secondary crm-toolbar__toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="filter" />
          Filtros
          {active > 0 && (
            <span className="crm-toolbar__count">
              {active}
              <span className="ds-visually-hidden"> ativos</span>
            </span>
          )}
        </button>
      </div>
      <div
        id={id}
        className={`crm-toolbar__filters${open ? " is-open" : ""}`}
        role="group"
        aria-label="Filtros"
      >
        {children}
        {(active > 0 || search) && (
          <button type="button" className="admin-text-button crm-toolbar__clear" onClick={onClear}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
function FilterSelect({ label, value, onChange, children }) {
  return (
    <select
      className="ds-input ds-select"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function ClientList({
  clients,
  people,
  resetKey,
  filtered,
  canCreate,
  onCreate,
  onClear,
  onOpen,
  onWhatsApp,
  onEdit,
  onDelete,
}) {
  const pager = usePagination(clients, { pageSize: 25, resetKey });
  if (!clients.length)
    return (
      <section className="admin-panel">
        {filtered ? (
          <EmptyState
            icon="search"
            title="Nenhum cliente encontrado"
            action={
              <button type="button" className="admin-button admin-button--secondary" onClick={onClear}>
                Limpar filtros
              </button>
            }
          >
            Ajuste a busca ou os filtros para ver mais resultados.
          </EmptyState>
        ) : (
          <EmptyState
            icon="users"
            title="Nenhum cliente ainda"
            action={
              canCreate && (
                <button type="button" className="admin-button" onClick={onCreate}>
                  <Icon name="plus" />
                  Novo lead
                </button>
              )
            }
          >
            Cadastre o primeiro lead para acompanhar cada conversa até o fechamento.
          </EmptyState>
        )}
      </section>
    );
  return (
    <section className="admin-panel crm-clients" aria-label="Clientes e leads">
      <div className="crm-clients__head" aria-hidden="true">
        <span>Cliente</span>
        <span>Responsável</span>
        <span>Etapa</span>
        <span className="is-number">Valor estimado</span>
        <span />
      </div>
      {pager.items.map((c) => {
        const owner = people.find((p) => p.id === c.owner_id);
        return (
          <article className="crm-client" key={c.id}>
            <div className="crm-client__main">
              <h2>
                <button type="button" className="crm-client__open" onClick={() => onOpen(c)}>
                  {c.name}
                </button>
              </h2>
              <p>{c.company || c.email || "Novo contato"}</p>
              {c.tags.length > 0 && <small>{c.tags.join(" · ")}</small>}
            </div>
            <div className="crm-client__meta">
              <span className="crm-client__owner crm-person">
                <Avatar profile={owner} size={22} />
                <span>
                  <span className="ds-visually-hidden">Responsável: </span>
                  {owner?.name || "Sem responsável"}
                </span>
              </span>
              <span className="crm-client__stage">
                <StageBadge stage={c.stage} />
              </span>
            </div>
            <span className="crm-client__value">
              <span className="ds-visually-hidden">Valor estimado: </span>
              {brl(c.estimated_cents)}
            </span>
            <div className="admin-row-actions crm-client__actions">
              <button
                type="button"
                className="admin-icon-button"
                aria-label={`Conversar no WhatsApp com ${c.name}`}
                title="Conversar no WhatsApp"
                onClick={() => onWhatsApp(c)}
              >
                <Icon name="message" />
              </button>
              <button
                type="button"
                className="admin-icon-button"
                aria-label={`Editar ${c.name}`}
                title="Editar"
                onClick={() => onEdit(c)}
              >
                <Icon name="edit" />
              </button>
              <button
                type="button"
                className="admin-icon-button admin-icon-button--danger"
                aria-label={`Excluir ${c.name}`}
                title="Excluir"
                onClick={() => onDelete(c)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </article>
        );
      })}
      <Pagination pager={pager} noun="clientes" label="Páginas de clientes" />
    </section>
  );
}

function ActivityList({
  activities,
  clients,
  people,
  resetKey,
  filtered,
  canCreate,
  onCreate,
  onClear,
  onOpenClient,
}) {
  const pager = usePagination(activities, { pageSize: 25, resetKey });
  if (!activities.length)
    return (
      <section className="admin-panel">
        {filtered ? (
          <EmptyState
            icon="search"
            title="Nenhum contato encontrado"
            action={
              <button type="button" className="admin-button admin-button--secondary" onClick={onClear}>
                Limpar filtros
              </button>
            }
          >
            Ajuste a busca ou os filtros para ver mais resultados.
          </EmptyState>
        ) : (
          <EmptyState
            icon="activity"
            title="Nenhum contato registrado"
            action={
              canCreate && (
                <button type="button" className="admin-button" onClick={onCreate}>
                  <Icon name="plus" />
                  Registrar contato
                </button>
              )
            }
          >
            Registre o primeiro contato da equipe para acompanhar o ritmo da prospecção.
          </EmptyState>
        )}
      </section>
    );
  return (
    <section className="admin-panel crm-feed" aria-label="Contatos registrados">
      {pager.items.map((a) => {
        const client = clients.find((c) => c.id === a.client_id),
          person = people.find((p) => p.id === a.user_id);
        return (
          <article className="crm-activity" key={a.id}>
            <span className="crm-activity__icon" aria-hidden="true">
              <Icon name={channelIcons[a.channel] || "comment"} size={16} />
            </span>
            <div className="crm-activity__main">
              <div className="crm-activity__head">
                <h2>
                  {client ? (
                    <button type="button" className="crm-link" onClick={() => onOpenClient(client)}>
                      {client.name}
                    </button>
                  ) : (
                    "Cliente"
                  )}
                </h2>
                <time dateTime={a.occurred_at}>{fmtTime(a.occurred_at)}</time>
              </div>
              <p className="crm-activity__notes">{a.notes}</p>
              {(a.result || a.next_step) && (
                <dl className="crm-activity__facts">
                  {a.result && (
                    <div>
                      <dt>Resultado</dt>
                      <dd>{a.result}</dd>
                    </div>
                  )}
                  {a.next_step && (
                    <div>
                      <dt>Próximo passo</dt>
                      <dd>{a.next_step}</dd>
                    </div>
                  )}
                </dl>
              )}
              <p className="crm-activity__meta">
                <span className="crm-activity__channel">{channelLabel(a.channel)}</span>
                <span aria-hidden="true">·</span>
                <span className="crm-person">
                  <Avatar profile={person} size={18} />
                  <span>{person?.name}</span>
                </span>
              </p>
            </div>
          </article>
        );
      })}
      <Pagination pager={pager} noun="contatos" label="Páginas de contatos" />
    </section>
  );
}

function FollowupList({
  followups,
  clients,
  people,
  today,
  resetKey,
  filtered,
  period,
  onClear,
  onOpenClient,
  onWhatsApp,
  onReschedule,
  onComplete,
}) {
  const pager = usePagination(followups, { pageSize: 25, resetKey });
  if (!followups.length)
    return (
      <section className="admin-panel">
        {filtered ? (
          <EmptyState
            icon="search"
            title="Nenhum follow-up encontrado"
            action={
              <button type="button" className="admin-button admin-button--secondary" onClick={onClear}>
                Limpar filtros
              </button>
            }
          >
            Ajuste a busca ou os filtros para ver mais resultados.
          </EmptyState>
        ) : (
          <EmptyState icon="clock" title="Nenhum follow-up neste filtro">
            {period === "overdue"
              ? "Nenhum contato atrasado. A equipe está em dia."
              : period === "done"
                ? "Os follow-ups concluídos aparecem aqui."
                : "Agende o próximo contato para não perder o ritmo da negociação."}
          </EmptyState>
        )}
      </section>
    );
  return (
    <section className="admin-panel crm-feed" aria-label="Follow-ups">
      {pager.items.map((f) => {
        const client = clients.find((c) => c.id === f.client_id),
          owner = people.find((p) => p.id === f.owner_id),
          day = localDay(f.due_at),
          overdue = !f.completed_at && day < today,
          dueToday = !f.completed_at && day === today;
        return (
          <article
            className={`crm-followup${overdue ? " is-overdue" : ""}${f.completed_at ? " is-done" : ""}`}
            key={f.id}
          >
            <Avatar profile={owner} size={32} />
            <div className="crm-followup__main">
              <h2>
                {client ? (
                  <button type="button" className="crm-link" onClick={() => onOpenClient(client)}>
                    {client.name}
                  </button>
                ) : null}
              </h2>
              <p>{f.notes || "Retomar contato"}</p>
              <p className="crm-followup__due">
                <Icon name="clock" size={14} />
                <time dateTime={f.due_at}>{fmtTime(f.due_at)}</time>
                <span aria-hidden="true">·</span>
                <span>{owner?.name}</span>
                {overdue && (
                  <span className="ds-badge ds-badge--danger">
                    <Icon name="alertCircle" size={12} />
                    Atrasado
                  </span>
                )}
                {dueToday && <span className="ds-badge">Hoje</span>}
                {f.completed_at && (
                  <span className="ds-badge ds-badge--success">
                    <Icon name="check" size={12} />
                    Concluído
                  </span>
                )}
              </p>
              {f.result && (
                <p className="crm-followup__result">
                  <span>Resultado: </span>
                  {f.result}
                </p>
              )}
            </div>
            {!f.completed_at && (
              <div className="crm-followup__actions">
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label={`Conversar no WhatsApp com ${client?.name}`}
                  title="Conversar no WhatsApp"
                  onClick={() => onWhatsApp(client)}
                >
                  <Icon name="message" />
                </button>
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label={`Reagendar follow-up de ${client?.name}`}
                  title="Reagendar"
                  onClick={() => onReschedule(f)}
                >
                  <Icon name="calendar" />
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary admin-button--sm"
                  onClick={() => onComplete(f)}
                >
                  <Icon name="check" />
                  Concluir
                </button>
              </div>
            )}
          </article>
        );
      })}
      <Pagination pager={pager} noun="follow-ups" label="Páginas de follow-ups" />
    </section>
  );
}

// Skeletons follow the layout that is about to appear.
function PageSkeleton({ mode }) {
  const label = <span className="ds-visually-hidden">Carregando o Comercial…</span>;
  if (mode === "dashboard" || mode === "reports")
    return (
      <div className="crm-skeleton" role="status">
        {label}
        <div className="crm-kpis" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <span className="ds-skeleton ds-skeleton--text" />
              <span className="ds-skeleton ds-skeleton--title" />
            </div>
          ))}
        </div>
      </div>
    );
  if (mode === "pipeline")
    return (
      <div className="crm-skeleton crm-skeleton--board" role="status">
        {label}
        {[0, 1, 2, 3].map((column) => (
          <div className="crm-kanban-column" key={column} aria-hidden="true">
            <span className="ds-skeleton ds-skeleton--text" />
            <span className="ds-skeleton" />
            <span className="ds-skeleton" />
          </div>
        ))}
      </div>
    );
  return (
    <div className="admin-panel crm-skeleton crm-skeleton--list" role="status">
      {label}
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} aria-hidden="true">
          <span className="ds-skeleton ds-skeleton--circle" />
          <span>
            <span className="ds-skeleton ds-skeleton--text" />
            <span className="ds-skeleton ds-skeleton--text" />
          </span>
        </div>
      ))}
    </div>
  );
}

const titles = {
  dashboard: ["Comercial", "Conversas que se transformam em histórias."],
  clients: ["Clientes e leads", "Todas as suas oportunidades em um só lugar."],
  pipeline: ["Pipeline", "Dê movimento às suas oportunidades."],
  activities: [
    "Contatos e atividades",
    "O histórico real da prospecção da equipe.",
  ],
  followups: ["Follow-ups", "A próxima conversa, no momento certo."],
  reports: [
    "Relatórios comerciais",
    "Acompanhe o ritmo e os resultados da equipe.",
  ],
};
export default function CommercialPage({ mode = "dashboard", notify }) {
  const auth = useAuth(),
    [params] = useSearchParams(),
    phone = useMediaQuery("(max-width: 767px)");
  const query = useQuery(useCallback(() => commercialData(), [])),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState(""),
    [channel, setChannel] = useState(""),
    [sort, setSort] = useState("recent"),
    [period, setPeriod] = useState(() =>
      ["pending", "overdue", "today", "tomorrow", "upcoming", "done"].includes(
        params.get("filtro"),
      )
        ? params.get("filtro")
        : "pending",
    ),
    [editing, setEditing] = useState(null),
    [detail, setDetail] = useState(null),
    [activity, setActivity] = useState(null),
    [followup, setFollowup] = useState(null),
    [deleting, setDeleting] = useState(null),
    [moving, setMoving] = useState(""),
    [whatsapp, setWhatsApp] = useState(null),
    [reportFilters, setReportFilters] = useState({
      owner: "",
      source: "",
      from: "",
      to: "",
    });
  const data = query.data || {
    clients: [],
    activities: [],
    followups: [],
    people: [],
  };
  useCreateIntent("lead", () => setEditing("new"), mode === "clients" && !!query.data);
  const requestedClient=params.get('cliente'),openedClient=useRef('');
  useEffect(()=>{const client=data.clients.find(item=>item.id===requestedClient);if(!client||openedClient.current===requestedClient)return;const timer=setTimeout(()=>{openedClient.current=requestedClient;setDetail(client)},0);return()=>clearTimeout(timer)},[data.clients,requestedClient]);
  const filtered = useMemo(
    () =>
      data.clients
        .filter(
          (c) =>
            (!stage || c.stage === stage) &&
            (!owner || c.owner_id === owner) &&
            matchesQuery(search, c.name, c.company, c.email, c.tags),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "pt-BR")
            : sort === "value"
              ? b.estimated_cents - a.estimated_cents
              : Date.parse(b.updated_at) - Date.parse(a.updated_at),
        ),
    [data.clients, stage, owner, search, sort],
  );
  const saved = async () => {
    await query.reload();
    notify("Registro salvo.");
  };
  const moveLock = useRef(false);
  const move = async (id, next) => {
    const item = data.clients.find((c) => c.id === id);
    if (!item || item.stage === next || moveLock.current) return;
    moveLock.current = true;
    setMoving(id);
    query.updateData((current) => ({
      ...current,
      clients: current.clients.map((client) =>
        client.id === id
          ? { ...client, stage: next, updated_at: new Date().toISOString() }
          : client,
      ),
    }));
    try {
      const saved = await movePipeline(item, next);
      query.updateData((current) => ({
        ...current,
        clients: current.clients.map((client) =>
          client.id === id ? saved : client,
        ),
      }));
      notify(`Cliente movido para ${stageLabel(next)}.`);
    } catch (cause) {
      query.updateData((current) => ({
        ...current,
        clients: current.clients.map((client) =>
          client.id === id ? item : client,
        ),
      }));
      notify(cause.message, true);
      await query.reload();
    } finally {
      moveLock.current = false;
      setMoving("");
    }
  };
  const [clock] = useState(() => new Date());
  const today = localDay(clock),
    tomorrow = localDay(clock.getTime() + 86400000);
  const clientName = (id) => data.clients.find((c) => c.id === id)?.name;
  const inPeriod = (f, key) =>
    key === "done"
      ? !!f.completed_at
      : !f.completed_at &&
        (key === "pending" ||
          (key === "overdue" && localDay(f.due_at) < today) ||
          (key === "today" && localDay(f.due_at) === today) ||
          (key === "tomorrow" && localDay(f.due_at) === tomorrow) ||
          (key === "upcoming" && localDay(f.due_at) > tomorrow));
  const followupBase = data.followups.filter(
    (f) =>
      (!owner || f.owner_id === owner) &&
      (!search || matchesQuery(search, clientName(f.client_id), f.notes)),
  );
  const followups = followupBase.filter((f) => inPeriod(f, period));
  const activities = data.activities.filter(
    (a) =>
      (!owner || a.user_id === owner) &&
      (!channel || a.channel === channel) &&
      (!search ||
        matchesQuery(search, clientName(a.client_id), a.notes, a.result, a.next_step)),
  );
  const clearFilters = () => {
    setSearch("");
    setOwner("");
    setStage("");
    setChannel("");
  };
  const ownerSelect = (
    <FilterSelect label="Filtrar responsável" value={owner} onChange={setOwner}>
      <option value="">Toda a equipe</option>
      {data.people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </FilterSelect>
  );
  const toolbar = ["clients", "pipeline"].includes(mode) ? (
    <FilterBar
      search={search}
      onSearch={setSearch}
      placeholder={phone ? "Buscar clientes…" : "Buscar cliente, empresa, e-mail ou tag…"}
      active={(owner ? 1 : 0) + (stage ? 1 : 0)}
      onClear={clearFilters}
    >
      {ownerSelect}
      <FilterSelect label="Filtrar etapa" value={stage} onChange={setStage}>
        <option value="">Todas as etapas</option>
        {stages.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="Ordenar clientes" value={sort} onChange={setSort}>
        <option value="recent">Mais recentes</option>
        <option value="name">Nome</option>
        <option value="value">Maior valor</option>
      </FilterSelect>
    </FilterBar>
  ) : mode === "activities" ? (
    <FilterBar
      search={search}
      onSearch={setSearch}
      placeholder={phone ? "Buscar contatos…" : "Buscar cliente ou anotação…"}
      active={(owner ? 1 : 0) + (channel ? 1 : 0)}
      onClear={clearFilters}
    >
      {ownerSelect}
      <FilterSelect label="Filtrar canal" value={channel} onChange={setChannel}>
        <option value="">Todos os canais</option>
        {channels.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </FilterSelect>
    </FilterBar>
  ) : mode === "followups" ? (
    <FilterBar
      search={search}
      onSearch={setSearch}
      placeholder={phone ? "Buscar follow-ups…" : "Buscar cliente ou observação…"}
      active={owner ? 1 : 0}
      onClear={clearFilters}
    >
      {ownerSelect}
    </FilterBar>
  ) : null;
  const openWhatsApp = (client) => client && setWhatsApp(client);
  return (
    <div className={`crm-page crm-page--${mode}`}>
      <PageTitle
        eyebrow="DUUK / COMERCIAL"
        title={titles[mode][0]}
        description={titles[mode][1]}
      >
        <RefreshButton onRefresh={query.reload} disabled={!!moving} compact={phone} />
        {["clients", "pipeline"].includes(mode) ? (
          auth.hasPermission("crm.clients") && (
            <button className="admin-button" onClick={() => setEditing("new")}>
              <Icon name="plus" />
              Novo lead
            </button>
          )
        ) : mode === "activities" ? (
          <button
            className="admin-button"
            disabled={!data.clients.length}
            onClick={() => setActivity({})}
          >
            <Icon name="plus" />
            Registrar contato
          </button>
        ) : mode === "followups" ? (
          <button
            className="admin-button"
            disabled={!data.clients.length}
            onClick={() => setFollowup({})}
          >
            <Icon name="plus" />
            Agendar follow-up
          </button>
        ) : (
          auth.hasPermission("crm.clients") && (
            <Link
              to="/admin/comercial/clientes"
              className="admin-button admin-button--secondary"
            >
              Ver clientes
              <Icon name="arrow" />
            </Link>
          )
        )}
      </PageTitle>
      {query.loading && !query.data ? (
        <PageSkeleton mode={mode} />
      ) : query.error && !query.data ? (
        <ErrorState onRetry={query.reload}>
          Não foi possível carregar o Comercial. {query.error}
        </ErrorState>
      ) : (
        <>
          {query.error && (
            <ErrorState onRetry={query.reload}>
              Não foi possível atualizar os dados. {query.error}
            </ErrorState>
          )}
          {(mode === "dashboard" || mode === "reports") && (
            <>
              <ReportFilters
                data={data}
                filters={reportFilters}
                onChange={setReportFilters}
                withSource={mode === "reports"}
              />
              <CommercialOverview
                data={data}
                report={mode === "reports"}
                filters={reportFilters}
              />
            </>
          )}
          {toolbar}
          {mode === "clients" && (
            <ClientList
              clients={filtered}
              people={data.people}
              resetKey={[search, stage, owner, sort].join("|")}
              filtered={!!(search || stage || owner)}
              canCreate={auth.hasPermission("crm.clients")}
              onCreate={() => setEditing("new")}
              onClear={clearFilters}
              onOpen={setDetail}
              onWhatsApp={openWhatsApp}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          )}
          {mode === "pipeline" &&
            (!data.clients.length ? (
              <section className="admin-panel">
                <EmptyState
                  icon="pipeline"
                  title="O pipeline começa com o primeiro lead"
                  action={
                    auth.hasPermission("crm.clients") && (
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => setEditing("new")}
                      >
                        <Icon name="plus" />
                        Novo lead
                      </button>
                    )
                  }
                >
                  Cadastre um cliente ou lead para acompanhar cada etapa da
                  negociação aqui.
                </EmptyState>
              </section>
            ) : filtered.length || !(search || stage || owner) ? (
              <PipelineBoard
                clients={filtered}
                people={data.people}
                stage={stage}
                pendingId={moving}
                onMove={move}
                onOpen={setDetail}
              />
            ) : (
              <section className="admin-panel">
                <EmptyState
                  icon="search"
                  title="Nenhuma oportunidade encontrada"
                  action={
                    <button
                      type="button"
                      className="admin-button admin-button--secondary"
                      onClick={clearFilters}
                    >
                      Limpar filtros
                    </button>
                  }
                >
                  Ajuste a busca ou os filtros para ver o pipeline completo.
                </EmptyState>
              </section>
            ))}
          {mode === "activities" && (
            <ActivityList
              activities={activities}
              clients={data.clients}
              people={data.people}
              resetKey={[search, owner, channel].join("|")}
              filtered={!!(search || owner || channel)}
              canCreate={data.clients.length > 0}
              onCreate={() => setActivity({})}
              onClear={clearFilters}
              onOpenClient={setDetail}
            />
          )}
          {mode === "followups" && (
            <>
              <div
                className="ds-segmented crm-periods"
                role="group"
                aria-label="Período dos follow-ups"
              >
                {periods.map(([k, l]) => {
                  const count = followupBase.filter((f) => inPeriod(f, k)).length;
                  return (
                    <button
                      type="button"
                      key={k}
                      className={period === k ? "is-active" : ""}
                      aria-pressed={period === k}
                      onClick={() => setPeriod(k)}
                    >
                      {l}
                      <span className="crm-periods__count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <FollowupList
                followups={followups}
                clients={data.clients}
                people={data.people}
                today={today}
                period={period}
                resetKey={[search, owner, period].join("|")}
                filtered={!!(search || owner)}
                onClear={clearFilters}
                onOpenClient={setDetail}
                onWhatsApp={openWhatsApp}
                onReschedule={(f) => setFollowup({ reschedule: f })}
                onComplete={(f) => setFollowup({ complete: f })}
              />
            </>
          )}
        </>
      )}
      {editing && (
        <ClientEditor
          record={editing === "new" ? null : editing}
          people={data.people}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {detail && (
        <ClientDetail
          onEmail={auth.hasPermission("mail")}
          onWhatsApp={() => { setWhatsApp(detail); setDetail(null); }}

          canProposals={auth.hasPermission("crm.clients")}
          notify={notify}
          client={detail}
          people={data.people}
          onClose={() => setDetail(null)}
          onEdit={
            auth.hasPermission("crm.clients")
              ? () => {
                  setEditing(detail);
                  setDetail(null);
                }
              : null
          }
          onActivity={
            auth.hasPermission("crm.activities")
              ? () => {
                  setActivity({ clientId: detail.id });
                  setDetail(null);
                }
              : null
          }
          onFollowup={
            auth.hasPermission("crm.followups")
              ? () => {
                  setFollowup({ clientId: detail.id });
                  setDetail(null);
                }
              : null
          }
        />
      )}
      {activity && (
        <ActivityEditor
          clients={data.clients}
          clientId={activity.clientId}
          onClose={() => setActivity(null)}
          onSaved={saved}
        />
      )}
      {whatsapp && <WhatsAppComposer client={whatsapp} onClose={() => setWhatsApp(null)} onRecord={auth.hasPermission('crm.activities') ? () => { setActivity({ clientId: whatsapp.id }); setWhatsApp(null); } : null} />}
      {followup && (
        <FollowupEditor
          clients={data.clients}
          people={data.people}
          {...followup}
          onClose={() => setFollowup(null)}
          onSaved={saved}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Excluir cliente?"
          message={`O cadastro de ${deleting.name}, contatos e follow-ups serão excluídos. A ação fica registrada no histórico administrativo.`}
          action="Excluir cliente"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteClient(deleting);
            await saved();
          }}
        />
      )}
    </div>
  );
}
