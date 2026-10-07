import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { brl, cents } from "../office/model";
import { ConfirmModal, Icon, Modal, RefreshButton } from "../admin/components";
import { Avatar, Field, PageTitle, QueryState } from "../admin/forms";
import {
  addActivity,
  addFollowup,
  clientHistory,
  commercialData,
  completeFollowup,
  deleteClient,
  movePipeline,
  saveClient,
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
};
function ClientEditor({ record, people, onClose, onSaved }) {
  const auth = useAuth(),
    [form, setForm] = useState(() =>
      record
        ? {
            ...record,
            owner_id: record.owner_id || "",
            first_contact: record.first_contact || "",
            next_follow_up: record.next_follow_up
              ? localInput(record.next_follow_up)
              : "",
            estimated: String(record.estimated_cents / 100).replace(".", ","),
            tags: record.tags.join(", "),
          }
        : { ...initialClient, owner_id: auth.user.id },
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useUnsavedChanges(true);
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.keys(initialClient)
          .filter((k) => !["estimated", "tags"].includes(k))
          .map((k) => [k, form[k]]),
      );
      payload.owner_id = payload.owner_id || null;
      payload.first_contact = payload.first_contact || null;
      payload.next_follow_up = timestamp(payload.next_follow_up);
      payload.estimated_cents = form.estimated ? cents(form.estimated) : 0;
      payload.tags = form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
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
      <form onSubmit={submit}>
        <div className="admin-modal__body admin-form-grid">
          {[
            ["name", "Nome", 160],
            ["company", "Empresa", 160],
            ["phone", "Telefone", 40],
            ["whatsapp", "WhatsApp", 40],
            ["email", "E-mail", 254],
            ["instagram", "Instagram", 160],
            ["website", "Site", 500],
            ["city", "Cidade", 120],
            ["segment", "Segmento", 120],
            ["source", "Origem do lead", 120],
          ].map(([key, label, max]) => (
            <Field
              key={key}
              label={label}
              value={form[key]}
              onChange={(v) => update(key, v)}
              maxLength={max}
              type={
                key === "email" ? "email" : key === "website" ? "url" : "text"
              }
              required={key === "name"}
            />
          ))}
          <Field label="Responsável">
            <select
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
          </Field>
          <Field label="Etapa">
            <select
              value={form.stage}
              onChange={(e) => update("stage", e.target.value)}
            >
              {stages.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Primeiro contato"
            type="date"
            value={form.first_contact}
            onChange={(v) => update("first_contact", v)}
          />
          <Field
            label="Próximo follow-up"
            type="datetime-local"
            value={form.next_follow_up}
            onChange={(v) => update("next_follow_up", v)}
          />
          <Field
            label="Valor estimado (R$)"
            inputMode="decimal"
            value={form.estimated}
            onChange={(v) => update("estimated", v)}
          />
          <Field
            label="Tags (separadas por vírgula)"
            value={form.tags}
            onChange={(v) => update("tags", v)}
          />
          <Field label="Observações">
            <textarea
              rows={4}
              maxLength={5000}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
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
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ActivityEditor({ clients, clientId, onClose, onSaved }) {
  const [form, setForm] = useState({
      client_id: clientId || clients[0]?.id || "",
      occurred_at: localInput(),
      channel: "whatsapp",
      notes: "",
      result: "",
      next_step: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useUnsavedChanges(true);
  const update = (k, v) => setForm((old) => ({ ...old, [k]: v }));
  return (
    <Modal title="Registrar contato" onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await addActivity({
              ...form,
              occurred_at: timestamp(form.occurred_at),
            });
            await onSaved();
            onClose();
          } catch (cause) {
            setError(cause.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="admin-modal__body admin-form-grid">
          <Field label="Cliente">
            <select
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
          </Field>
          <Field
            label="Data e horário · Brasília"
            type="datetime-local"
            required
            value={form.occurred_at}
            onChange={(v) => update("occurred_at", v)}
          />
          <Field label="Canal">
            <select
              value={form.channel}
              onChange={(e) => update("channel", e.target.value)}
            >
              {channels.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="O que foi conversado?">
            <textarea
              required
              maxLength={3000}
              rows={4}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
          <Field
            label="Resultado"
            maxLength={500}
            value={form.result}
            onChange={(v) => update("result", v)}
          />
          <Field
            label="Próximo passo"
            maxLength={500}
            value={form.next_step}
            onChange={(v) => update("next_step", v)}
          />
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="admin-modal__foot">
          <button className="admin-button" disabled={busy || !clients.length}>
            {busy ? "Salvando…" : "Registrar contato"}
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
}) {
  const auth = useAuth(),
    [form, setForm] = useState({
      client_id: clientId || clients[0]?.id || "",
      owner_id: auth.user.id,
      due_at: localInput(),
      notes: "",
      result: "",
      next_due: "",
      new_stage: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useUnsavedChanges(true);
  const update = (k, v) => setForm((old) => ({ ...old, [k]: v }));
  return (
    <Modal
      title={complete ? "Concluir follow-up" : "Agendar follow-up"}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (complete)
              await completeFollowup({
                target: complete.id,
                revision: complete.version,
                outcome: form.result,
                next_due: timestamp(form.next_due),
                new_stage: form.new_stage || null,
              });
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
        }}
      >
        <div className="admin-modal__body admin-form-grid">
          {complete ? (
            <>
              <p>{clients.find((c) => c.id === complete.client_id)?.name}</p>
              <Field label="Resultado do contato">
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={form.result}
                  onChange={(e) => update("result", e.target.value)}
                />
              </Field>
              <Field
                label="Próximo follow-up (opcional)"
                type="datetime-local"
                value={form.next_due}
                onChange={(v) => update("next_due", v)}
              />
              <Field label="Atualizar etapa">
                <select
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
              </Field>
            </>
          ) : (
            <>
              <Field label="Cliente">
                <select
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
              </Field>
              <Field label="Responsável">
                <select
                  required
                  value={form.owner_id}
                  onChange={(e) => update("owner_id", e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Data e horário · Brasília"
                required
                type="datetime-local"
                value={form.due_at}
                onChange={(v) => update("due_at", v)}
              />
              <Field label="Observações">
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Field>
            </>
          )}
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="admin-modal__foot">
          <button className="admin-button" disabled={busy || !clients.length}>
            {busy
              ? "Salvando…"
              : complete
                ? "Concluir contato"
                : "Agendar follow-up"}
          </button>
        </div>
      </form>
    </Modal>
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
}) {
  const query = useQuery(
    useCallback(() => clientHistory(client.id), [client.id]),
  );
  return (
    <Modal
      title={client.name}
      subtitle={client.company || stageLabel(client.stage)}
      onClose={onClose}
      wide
    >
      <div className="admin-modal__body">
        <div className="platform-detail-grid">
          {[
            ["Etapa", stageLabel(client.stage)],
            [
              "Responsável",
              people.find((p) => p.id === client.owner_id)?.name ||
                "Sem responsável",
            ],
            ["E-mail", client.email],
            ["Telefone", client.phone],
            ["WhatsApp", client.whatsapp],
            ["Instagram", client.instagram],
            ["Site", client.website],
            ["Cidade", client.city],
            ["Segmento", client.segment],
            ["Origem", client.source],
            ["Valor estimado", brl(client.estimated_cents)],
            ["Último contato", fmtTime(client.last_contact)],
            ["Próximo follow-up", fmtTime(client.next_follow_up)],
            ["Tags", client.tags.join(", ")],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <p>{v || "—"}</p>
            </div>
          ))}
        </div>
        {client.notes && <p className="crm-notes">{client.notes}</p>}
        <h3 className="platform-subheading">Histórico do cliente</h3>
        <QueryState query={query}>
          <div className="platform-timeline">
            {query.data?.map((h) => (
              <article key={h.id}>
                <span />
                <div>
                  <h4>{h.action}</h4>
                  <small>
                    {h.actor_name} · {fmtTime(h.created_at)}
                  </small>
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
              </article>
            ))}
          </div>
        </QueryState>
      </div>
      <div className="admin-modal__foot">
        {onEmail && (
          <Link
            className="admin-button admin-button--secondary"
            to={`/admin/comercial/emails?cliente=${client.id}&compor=1`}
          >
            <Icon name="mail" />
            Enviar e-mail
          </Link>
        )}
        {onEdit && (
          <button
            className="admin-button admin-button--secondary"
            onClick={onEdit}
          >
            <Icon name="edit" />
            Editar
          </button>
        )}
        {onFollowup && (
          <button
            className="admin-button admin-button--secondary"
            onClick={onFollowup}
          >
            <Icon name="clock" />
            Follow-up
          </button>
        )}
        {onActivity && (
          <button className="admin-button" onClick={onActivity}>
            <Icon name="plus" />
            Registrar contato
          </button>
        )}
      </div>
    </Modal>
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
    data.followups.filter((f) => clientIds.has(f.client_id)),
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
  return (
    <>
      <div className="crm-stats">
        {[
          ["Total de leads", stats.total],
          ["Contatos realizados", stats.contacts],
          ["Contatos hoje", stats.today],
          ["Esta semana", stats.week],
          ["Este mês", stats.month],
          ["Em negociação", stats.negotiating],
          ["Propostas enviadas", stats.proposals],
          ["Fechados", stats.won],
          ["Perdidos", stats.lost],
          ["Follow-ups pendentes", stats.pending],
          ["Conversão de oportunidades concluídas", `${stats.conversion}%`],
        ].map(([label, value]) => (
          <article className="admin-panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="platform-two-columns">
        <section className="admin-panel platform-form">
          <h2>Contatos por pessoa</h2>
          {data.people.map((p) => {
            const count = activities.filter((a) => a.user_id === p.id).length;
            return (
              <div className="crm-bar" key={p.id}>
                <div>
                  <span className="crm-person">
                    <Avatar profile={p} size={24} />
                    {p.name}
                  </span>
                  <strong>{count}</strong>
                </div>
                <span>
                  <i
                    style={{
                      width: `${activities.length ? (count / activities.length) * 100 : 0}%`,
                    }}
                  />
                </span>
              </div>
            );
          })}
          {!data.people.length && (
            <p className="platform-muted">
              A equipe aparece após o primeiro cadastro.
            </p>
          )}
        </section>
        <section className="admin-panel platform-form">
          <h2>Origem dos leads</h2>
          {origin.map(([name, count]) => (
            <div className="crm-bar" key={name}>
              <div>
                <span>{name}</span>
                <strong>{count}</strong>
              </div>
              <span>
                <i
                  style={{
                    width: `${clients.length ? (count / clients.length) * 100 : 0}%`,
                  }}
                />
              </span>
            </div>
          ))}
          {!origin.length && (
            <p className="platform-muted">
              Adicione leads para acompanhar as origens.
            </p>
          )}
        </section>
      </div>
      {report && (
        <div className="platform-two-columns">
          <section className="admin-panel platform-form">
            <h2>Contatos por dia</h2>
            {days.map(([day, count]) => (
              <div className="crm-bar" key={day}>
                <div>
                  <span>{day.split("-").reverse().join("/")}</span>
                  <strong>{count}</strong>
                </div>
                <span>
                  <i
                    style={{
                      width: `${(count / Math.max(...days.map((d) => d[1]), 1)) * 100}%`,
                    }}
                  />
                </span>
              </div>
            ))}
            {!days.length && (
              <p className="platform-muted">Nenhum contato no período.</p>
            )}
          </section>
          <section className="admin-panel platform-form">
            <h2>Oportunidades por etapa</h2>
            {stages.map(([key, label]) => (
              <div className="crm-stage-summary" key={key}>
                <span>{label}</span>
                <strong>{clients.filter((c) => c.stage === key).length}</strong>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
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
    [params] = useSearchParams();
  const query = useQuery(useCallback(() => commercialData(), [])),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState(""),
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
  const filtered = useMemo(
    () =>
      data.clients
        .filter(
          (c) =>
            (!stage || c.stage === stage) &&
            (!owner || c.owner_id === owner) &&
            `${c.name} ${c.company} ${c.email} ${c.tags.join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
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
  const move = async (id, next) => {
    const item = data.clients.find((c) => c.id === id);
    if (!item || item.stage === next) return;
    setMoving(id);
    try {
      await movePipeline(item, next);
      await query.reload();
      notify(`Cliente movido para ${stageLabel(next)}.`);
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setMoving("");
    }
  };
  const [clock] = useState(() => new Date());
  const today = localDay(clock),
    tomorrow = localDay(clock.getTime() + 86400000);
  const followups = data.followups.filter(
    (f) =>
      (!owner || f.owner_id === owner) &&
      (!search ||
        data.clients
          .find((c) => c.id === f.client_id)
          ?.name.toLowerCase()
          .includes(search.toLowerCase())) &&
      (period === "done"
        ? !!f.completed_at
        : !f.completed_at &&
          (period === "pending" ||
            (period === "overdue" && localDay(f.due_at) < today) ||
            (period === "today" && localDay(f.due_at) === today) ||
            (period === "tomorrow" && localDay(f.due_at) === tomorrow) ||
            (period === "upcoming" && localDay(f.due_at) > tomorrow))),
  );
  const toolbar = (
    <div className="crm-toolbar">
      <label className="admin-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Buscar no Comercial"
          placeholder="Buscar cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <select
        aria-label="Filtrar responsável"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      >
        <option value="">Toda a equipe</option>
        {data.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {["clients", "pipeline"].includes(mode) && (
        <>
          <select
            aria-label="Filtrar etapa"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">Todas as etapas</option>
            {stages.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Ordenar clientes"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="value">Maior valor</option>
          </select>
        </>
      )}
    </div>
  );
  return (
    <>
      <PageTitle
        eyebrow="DUUK / COMERCIAL"
        title={titles[mode][0]}
        description={titles[mode][1]}
      >
        <RefreshButton onRefresh={query.reload} />
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
            <Link to="/admin/comercial/clientes" className="admin-button">
              Ver clientes
              <Icon name="arrow" />
            </Link>
          )
        )}
      </PageTitle>
      <QueryState query={query}>
        {mode === "dashboard" && <CommercialOverview data={data} />}{" "}
        {["clients", "pipeline", "activities", "followups"].includes(mode) &&
          toolbar}
        {mode === "clients" && (
          <section className="admin-panel platform-list">
            {filtered.map((c) => (
              <article className="platform-row" key={c.id}>
                <button
                  className="crm-client-button platform-row__main"
                  onClick={() => setDetail(c)}
                >
                  <h2>{c.name}</h2>
                  <p>
                    {c.company || c.email || "Novo contato"} ·{" "}
                    {data.people.find((p) => p.id === c.owner_id)?.name ||
                      "Sem responsável"}
                  </p>
                  <small>{c.tags.join(" · ")}</small>
                </button>
                <span className="crm-stage">{stageLabel(c.stage)}</span>
                <strong className="crm-money">{brl(c.estimated_cents)}</strong>
                <div className="admin-row-actions">
                  <button
                    className="admin-icon-button"
                    aria-label={`Editar ${c.name}`}
                    onClick={() => setEditing(c)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    className="admin-icon-button"
                    aria-label={`Excluir ${c.name}`}
                    onClick={() => setDeleting(c)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </article>
            ))}
            {!filtered.length && (
              <div className="admin-empty">
                <Icon name="users" size={32} />
                <h2>Nenhum cliente encontrado</h2>
                <p>Adicione seu primeiro lead ou ajuste os filtros.</p>
              </div>
            )}
          </section>
        )}
        {mode === "pipeline" && (
          <div className="crm-kanban" aria-label="Pipeline de oportunidades">
            {stages
              .filter(([k]) => !stage || k === stage)
              .map(([key, label]) => (
                <section
                  className="crm-kanban-column"
                  key={key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    move(e.dataTransfer.getData("text/duuk-client"), key);
                  }}
                >
                  <header>
                    <h2>{label}</h2>
                    <span>
                      {filtered.filter((c) => c.stage === key).length}
                    </span>
                  </header>
                  <div>
                    {filtered
                      .filter((c) => c.stage === key)
                      .map((c) => (
                        <article
                          className="crm-kanban-card"
                          key={c.id}
                          draggable={!moving}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/duuk-client", c.id)
                          }
                        >
                          <button
                            className="crm-client-button"
                            onClick={() => setDetail(c)}
                          >
                            <h3>{c.name}</h3>
                            <p>{c.company || "Oportunidade"}</p>
                            <strong>{brl(c.estimated_cents)}</strong>
                          </button>
                          <small className="crm-person">
                            <Avatar
                              profile={data.people.find(
                                (p) => p.id === c.owner_id,
                              )}
                              size={22}
                            />
                            {data.people.find((p) => p.id === c.owner_id)
                              ?.name || "Sem responsável"}
                          </small>
                          <select
                            aria-label={`Etapa de ${c.name}`}
                            value={c.stage}
                            disabled={!!moving}
                            onChange={(e) => move(c.id, e.target.value)}
                          >
                            {stages.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
          </div>
        )}
        {mode === "activities" && (
          <section className="admin-panel platform-list">
            {data.activities
              .filter(
                (a) =>
                  (!owner || a.user_id === owner) &&
                  (!search ||
                    data.clients
                      .find((c) => c.id === a.client_id)
                      ?.name.toLowerCase()
                      .includes(search.toLowerCase())),
              )
              .map((a) => (
                <article className="platform-row" key={a.id}>
                  <Avatar
                    profile={data.people.find((p) => p.id === a.user_id)}
                  />
                  <div className="platform-row__main">
                    <h2>
                      {data.clients.find((c) => c.id === a.client_id)?.name ||
                        "Cliente"}
                    </h2>
                    <p>{a.notes}</p>
                    <small>
                      {channels.find((c) => c[0] === a.channel)?.[1]} ·{" "}
                      {data.people.find((p) => p.id === a.user_id)?.name} ·{" "}
                      {fmtTime(a.occurred_at)}
                    </small>
                    {a.result && <p>Resultado: {a.result}</p>}
                    {a.next_step && <small>Próximo passo: {a.next_step}</small>}
                  </div>
                </article>
              ))}
            {!data.activities.length && (
              <div className="admin-empty">
                <p>Registre o primeiro contato da equipe.</p>
              </div>
            )}
          </section>
        )}
        {mode === "followups" && (
          <>
            <div className="admin-filter-tabs crm-followup-tabs">
              {[
                ["pending", "Pendentes"],
                ["overdue", "Atrasados"],
                ["today", "Hoje"],
                ["tomorrow", "Amanhã"],
                ["upcoming", "Próximos"],
                ["done", "Concluídos"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={period === k ? "is-active" : ""}
                  aria-pressed={period === k}
                  onClick={() => setPeriod(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <section className="admin-panel platform-list">
              {followups.map((f) => (
                <article className="platform-row" key={f.id}>
                  <Avatar
                    profile={data.people.find((p) => p.id === f.owner_id)}
                  />
                  <div className="platform-row__main">
                    <h2>
                      {data.clients.find((c) => c.id === f.client_id)?.name}
                    </h2>
                    <p>{f.notes || "Retomar contato"}</p>
                    <small
                      className={
                        !f.completed_at && localDay(f.due_at) < today
                          ? "crm-overdue"
                          : ""
                      }
                    >
                      {fmtTime(f.due_at)} ·{" "}
                      {data.people.find((p) => p.id === f.owner_id)?.name}
                    </small>
                    {f.result && <p>{f.result}</p>}
                  </div>
                  {!f.completed_at && (
                    <button
                      className="admin-button admin-button--secondary"
                      onClick={() => setFollowup({ complete: f })}
                    >
                      <Icon name="check" />
                      Concluir
                    </button>
                  )}
                </article>
              ))}
              {!followups.length && (
                <div className="admin-empty">
                  <p>Nenhum follow-up neste filtro.</p>
                </div>
              )}
            </section>
          </>
        )}
        {mode === "reports" && (
          <>
            <section className="admin-panel crm-report-filters">
              <Field label="Responsável">
                <select
                  value={reportFilters.owner}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, owner: e.target.value }))
                  }
                >
                  <option value="">Toda a equipe</option>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Origem">
                <select
                  value={reportFilters.source}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, source: e.target.value }))
                  }
                >
                  <option value="">Todas</option>
                  {[
                    ...new Set(
                      data.clients.map((c) => c.source).filter(Boolean),
                    ),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Contatos a partir de"
                type="date"
                value={reportFilters.from}
                onChange={(v) => setReportFilters((f) => ({ ...f, from: v }))}
              />
              <Field
                label="Até"
                type="date"
                min={reportFilters.from}
                value={reportFilters.to}
                onChange={(v) => setReportFilters((f) => ({ ...f, to: v }))}
              />
            </section>
            <CommercialOverview data={data} report filters={reportFilters} />
          </>
        )}
      </QueryState>
      {editing && (
        <ClientEditor
          record={editing === "new" ? null : editing}
          people={data.people}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}{" "}
      {detail && (
        <ClientDetail
          onEmail={auth.hasPermission("mail")}
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
      )}{" "}
      {activity && (
        <ActivityEditor
          clients={data.clients}
          clientId={activity.clientId}
          onClose={() => setActivity(null)}
          onSaved={saved}
        />
      )}{" "}
      {followup && (
        <FollowupEditor
          clients={data.clients}
          people={data.people}
          {...followup}
          onClose={() => setFollowup(null)}
          onSaved={saved}
        />
      )}{" "}
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
    </>
  );
}
