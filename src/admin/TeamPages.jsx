import { useUnsavedChanges } from "./unsavedChanges";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase, verifyCurrentPassword } from "../content/supabase";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { teamRequest, rows } from "./api";
import { ConfirmModal, Icon, Modal, RefreshButton } from "./components";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Field,
  FieldError,
  PageTitle,
  Pagination,
  QueryState,
  SearchField,
} from "./forms";
import { matchesQuery, usePagination } from "./ds/list";
import AvatarCropper from "./AvatarCropper";
import { AVATAR_SOURCE_LIMIT } from "./avatarCrop.mjs";

const zone = "America/Sao_Paulo";
const date = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: zone,
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Ainda não entrou";

// Client checks mirror what duuk-team already validates (lengths, e-mail shape, password size).
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function requiredText(value, max, missing) {
  const text = String(value || "").trim();
  if (!text) return missing;
  return text.length > max ? `Use até ${max} caracteres.` : "";
}
const optionalText = (value, max) =>
  String(value || "").trim().length > max ? `Use até ${max} caracteres.` : "";
function emailError(value) {
  const text = String(value || "").trim();
  if (!text) return "Informe o e-mail.";
  return text.length > 254 || !emailPattern.test(text)
    ? "Confira o e-mail. Exemplo: nome@empresa.com.br"
    : "";
}
const passwordError = (value) =>
  value.length < 12 || value.length > 128
    ? "Use uma senha entre 12 e 128 caracteres."
    : "";
const onlyErrors = (errors) =>
  Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
const focusFirstInvalid = (form) =>
  requestAnimationFrame(() =>
    form?.querySelector('[aria-invalid="true"]')?.focus(),
  );

function TextField({
  label,
  error,
  hint,
  optional = false,
  multiline = false,
  className = "",
  value,
  onChange,
  ...props
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined,
    errorId = error ? `${id}-error` : undefined;
  const Control = multiline ? "textarea" : "input";
  return (
    <div className={`admin-field ${className}`.trim()}>
      <label className="admin-label" htmlFor={id}>
        {label}
        {optional && <span className="ds-optional"> (opcional)</span>}
      </label>
      <Control
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {hint && <small id={hintId}>{hint}</small>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
function PasswordField({ label, error, hint, optional = false, value, onChange, ...props }) {
  const id = useId(),
    [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined,
    errorId = error ? `${id}-error` : undefined;
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>
        {label}
        {optional && <span className="ds-optional"> (opcional)</span>}
      </label>
      <div className="admin-password">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
          {...props}
        />
        <button
          className="admin-icon-button"
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? "eyeOff" : "eye"} />
        </button>
      </div>
      {hint && <small id={hintId}>{hint}</small>}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

function UserEditor({ user, roles, onClose, onSaved }) {
  const auth = useAuth();
  const [form, setForm] = useState(() =>
    user
      ? { ...user, password: "" }
      : {
          name: "",
          email: "",
          phone: "",
          job_title: "",
          role_id:
            roles.find((r) => r.name === "Comercial")?.id || roles[0]?.id,
          active: true,
          is_super_admin: false,
          password: "",
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  const groupId = useId();
  const update = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  };
  useUnsavedChanges(true);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = onlyErrors({
      name: requiredText(form.name, 120, "Informe o nome."),
      email: emailError(form.email),
      phone: optionalText(form.phone, 40),
      job_title: optionalText(form.job_title, 100),
      role_id: form.role_id ? "" : "Escolha um grupo.",
      password: user ? "" : passwordError(form.password),
    });
    setErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await teamRequest({ ...form, action: user ? "update" : "create" });
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
      title={user ? "Editar usuário" : "Novo usuário"}
      subtitle={
        user
          ? user.email
          : "A pessoa entra no painel com este e-mail e a senha inicial."
      }
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="admin-modal__body admin-form-grid">
          <TextField
            label="Nome"
            value={form.name}
            onChange={(v) => update("name", v)}
            error={errors.name}
            required
            maxLength={120}
            autoComplete="off"
          />
          <TextField
            label="E-mail"
            value={form.email}
            onChange={(v) => update("email", v)}
            error={errors.email}
            type="email"
            inputMode="email"
            required
            maxLength={254}
            autoComplete="off"
          />
          <TextField
            label="Telefone"
            optional
            value={form.phone}
            onChange={(v) => update("phone", v)}
            error={errors.phone}
            type="tel"
            maxLength={40}
          />
          <TextField
            label="Cargo"
            optional
            value={form.job_title}
            onChange={(v) => update("job_title", v)}
            error={errors.job_title}
            maxLength={100}
          />
          <div className="admin-field">
            <label className="admin-label" htmlFor={groupId}>
              Grupo
            </label>
            <select
              id={groupId}
              value={form.role_id || ""}
              onChange={(e) => update("role_id", e.target.value)}
              required
              aria-invalid={errors.role_id ? "true" : undefined}
              aria-describedby={errors.role_id ? `${groupId}-error` : undefined}
            >
              {!form.role_id && <option value="">Escolha um grupo</option>}
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <FieldError id={`${groupId}-error`}>{errors.role_id}</FieldError>
          </div>
          {!user && (
            <PasswordField
              label="Senha inicial"
              value={form.password}
              onChange={(v) => update("password", v)}
              error={errors.password}
              hint="Entre 12 e 128 caracteres."
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          )}
          <fieldset className="settings-fieldset ds-span-2">
            <legend>Acesso</legend>
            <label className="admin-check settings-check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update("active", e.target.checked)}
              />
              <span>
                Usuário ativo
                <small>Contas inativas não entram no painel.</small>
              </span>
            </label>
            {auth.profile.is_super_admin && (
              <label className="admin-check settings-check">
                <input
                  type="checkbox"
                  checked={form.is_super_admin}
                  onChange={(e) => update("is_super_admin", e.target.checked)}
                />
                <span>
                  Super administrador
                  <small>Acesso completo a todos os módulos e configurações.</small>
                </span>
              </label>
            )}
          </fieldset>
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
            type="submit"
            className="admin-button"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Salvando…" : "Salvar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PasswordReset({ user, onClose, notify }) {
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fieldError, setFieldError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = passwordError(value);
    setFieldError(problem);
    if (problem) return focusFirstInvalid(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await teamRequest({
        action: "reset-password",
        id: user.id,
        password: value,
      });
      setValue("");
      notify("Senha redefinida.");
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Redefinir senha"
      subtitle={user.name}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="admin-modal__body settings-modal-stack">
          <PasswordField
            label="Nova senha"
            value={value}
            onChange={(v) => {
              setValue(v);
              setFieldError("");
            }}
            error={fieldError}
            hint="Entre 12 e 128 caracteres."
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
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
            type="submit"
            className="admin-button"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Salvando…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const statusFilters = [
  ["all", "Todos"],
  ["active", "Ativos"],
  ["inactive", "Inativos"],
];
export function UsersPage({ notify }) {
  const query = useQuery(
      useCallback(() => teamRequest({ action: "list" }), []),
    ),
    [editing, setEditing] = useState(null),
    [reset, setReset] = useState(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const auth = useAuth();
  const users = query.data?.users || [],
    roles = query.data?.roles || [];
  const roleName = (u) =>
    u.is_super_admin
      ? "Super administrador"
      : u.duuk_roles?.name || roles.find((r) => r.id === u.role_id)?.name || "";
  const counts = {
    all: users.length,
    active: users.filter((u) => u.active).length,
    inactive: users.filter((u) => !u.active).length,
  };
  const filtered = users.filter(
    (u) =>
      (status === "all" || (status === "active") === !!u.active) &&
      matchesQuery(search, u.name, u.email, u.job_title, roleName(u)),
  );
  const pager = usePagination(filtered, { resetKey: `${search}|${status}` });
  const locked = (u) => u.is_super_admin && !auth.profile.is_super_admin;
  const online = (u) => auth.presenceReady && auth.isOnline(u.id);
  return (
    <>
      <PageTitle
        title="Nossa equipe"
        description="Pessoas, funções e acesso ao estúdio."
      >
        <RefreshButton onRefresh={query.reload} />
        <button
          type="button"
          className="admin-button"
          onClick={() => setEditing("new")}
          disabled={!query.data}
        >
          <Icon name="plus" />
          Novo usuário
        </button>
      </PageTitle>
      <QueryState query={query}>
        {query.data && (
          <section className="admin-panel settings-people" aria-label="Pessoas da equipe">
            <div className="ds-toolbar settings-toolbar">
              <SearchField
                value={search}
                onChange={setSearch}
                label="Buscar pessoa"
                placeholder="Buscar por nome, e-mail ou cargo…"
              />
              <div className="ds-segmented" role="group" aria-label="Filtrar por situação">
                {statusFilters.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={status === key}
                    onClick={() => setStatus(key)}
                  >
                    {label}
                    <span className="settings-count">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </div>
            {pager.total ? (
              <>
                <div className="settings-people__head" aria-hidden="true">
                  <span>Pessoa</span>
                  <span>Grupo e cargo</span>
                  <span>Último acesso</span>
                  <span>Situação</span>
                  <span />
                </div>
                <ul className="settings-people__list">
                  {pager.items.map((u) => (
                    <li key={u.id} className="settings-person">
                      <div className="settings-person__identity">
                        <Avatar profile={u} online={online(u)} />
                        <div>
                          <h2>{u.name}</h2>
                          <p>{u.email}</p>
                        </div>
                      </div>
                      <p className="settings-person__cell">
                        <span className="settings-person__label">Grupo e cargo</span>
                        <span>
                          {roleName(u) || "—"}
                          <small>{u.job_title || "Equipe"}</small>
                        </span>
                      </p>
                      <p className="settings-person__cell">
                        <span className="settings-person__label">Último acesso</span>
                        <span>{date(u.last_sign_in_at)}</span>
                      </p>
                      <div className="settings-person__status">
                        <span
                          className={`admin-status admin-status--${u.active ? "published" : "archived"}`}
                        >
                          <Icon name={u.active ? "check" : "close"} size={13} />
                          {u.active ? "Ativo" : "Inativo"}
                        </span>
                        {u.active && (
                          <span
                            className={`settings-presence${online(u) ? " is-online" : ""}${auth.presenceReady ? "" : " is-checking"}`}
                          >
                            <i aria-hidden="true" />
                            {auth.presenceReady
                              ? online(u)
                                ? "Online agora"
                                : "Offline"
                              : "Verificando…"}
                          </span>
                        )}
                      </div>
                      <div className="admin-row-actions settings-person__actions">
                        <button
                          type="button"
                          className="admin-icon-button"
                          aria-label={`Editar ${u.name}`}
                          title={
                            locked(u)
                              ? "Somente um super administrador pode alterar esta conta."
                              : "Editar"
                          }
                          disabled={locked(u)}
                          onClick={() => setEditing(u)}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button"
                          aria-label={`Redefinir senha de ${u.name}`}
                          title={
                            locked(u)
                              ? "Somente um super administrador pode alterar esta conta."
                              : "Redefinir senha"
                          }
                          disabled={locked(u)}
                          onClick={() => setReset(u)}
                        >
                          <Icon name="key" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : users.length ? (
              <EmptyState
                icon="search"
                title="Nenhuma pessoa encontrada"
                action={
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                    }}
                  >
                    Limpar filtros
                  </button>
                }
              >
                Ajuste a busca ou o filtro de situação.
              </EmptyState>
            ) : (
              <EmptyState icon="users" title="Ninguém por aqui ainda">
                Cadastre a primeira pessoa da equipe em Novo usuário.
              </EmptyState>
            )}
            <Pagination pager={pager} noun="pessoas" />
          </section>
        )}
      </QueryState>
      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          roles={query.data.roles}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await query.reload();
            await auth.refreshAccess();
            notify("Usuário salvo.");
          }}
        />
      )}
      {reset && (
        <PasswordReset
          user={reset}
          onClose={() => setReset(null)}
          notify={notify}
        />
      )}
    </>
  );
}
function RoleEditor({ role, onClose, onSaved }) {
  const [name, setName] = useState(role?.name || ""),
    [description, setDescription] = useState(role?.description || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = onlyErrors({
      name: requiredText(name, 60, "Informe o nome do grupo."),
      description: optionalText(description, 300),
    });
    setErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await teamRequest({
        action: "save-role",
        id: role?.id,
        name,
        description,
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
      title={role ? "Editar grupo" : "Novo grupo"}
      subtitle="Os módulos liberados são escolhidos na lista do grupo."
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="admin-modal__body settings-modal-stack">
          <TextField
            label="Nome do grupo"
            value={name}
            onChange={(v) => {
              setName(v);
              setErrors((old) => ({ ...old, name: "" }));
            }}
            error={errors.name}
            required
            maxLength={60}
          />
          <TextField
            label="Descrição"
            optional
            multiline
            rows={3}
            value={description}
            onChange={(v) => {
              setDescription(v);
              setErrors((old) => ({ ...old, description: "" }));
            }}
            error={errors.description}
            hint={`${description.length}/300 caracteres`}
            maxLength={300}
          />
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
            type="submit"
            className="admin-button"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Salvando…" : "Salvar grupo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Modules are grouped like the menu. Keys the server adds later still appear, under "Outros módulos".
const permissionSections = [
  ["Dia a dia", ["agenda", "ai", "spotify"]],
  ["Comercial", ["crm", "crm.dashboard", "crm.clients", "crm.pipeline", "crm.activities", "crm.followups", "crm.reports", "mail", "whatsapp"]],
  ["Gestão", ["contracts", "finance", "billing"]],
  ["Conteúdo", ["social", "site", "insights"]],
  ["Arquivos", ["drive"]],
  ["Administração", ["team", "permissions", "audit"]],
];
const permissionIcons = {
  agenda: "calendar",
  ai: "spark",
  crm: "chart",
  "crm.dashboard": "chart",
  "crm.clients": "users",
  "crm.pipeline": "pipeline",
  "crm.activities": "activity",
  "crm.followups": "clock",
  "crm.reports": "report",
  mail: "mail",
  contracts: "document",
  finance: "wallet",
  whatsapp: "message",
  billing: "incoming",
  spotify: "music",
  social: "instagram",
  site: "globe",
  insights: "trend",
  drive: "drive",
  team: "users",
  permissions: "shield",
  audit: "history",
};
function permissionGroups(keys) {
  const used = new Set();
  const sections = permissionSections.map(([label, list]) => {
    const items = list
      .map((key) => keys.find((item) => item.key === key))
      .filter(Boolean);
    items.forEach((item) => used.add(item.key));
    return { label, items };
  });
  const rest = keys.filter((item) => !used.has(item.key));
  if (rest.length) sections.push({ label: "Outros módulos", items: rest });
  return sections.filter((section) => section.items.length);
}
const choices = [
  ["inherit", "Herdar", "Herdar do grupo"],
  ["allow", "Permitir", "Permitir para esta pessoa"],
  ["deny", "Bloquear", "Bloquear para esta pessoa"],
];
export function PermissionsPage({ notify, mode = "roles" }) {
  const auth = useAuth(),
    query = useQuery(useCallback(() => teamRequest({ action: "access" }), []));
  const [roleId, setRoleId] = useState(""),
    [userId, setUserId] = useState(""),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(""),
    [search, setSearch] = useState("");
  const headingId = useId();
  const roleMode = mode === "roles";
  const roles = query.data?.roles || [],
    users = query.data?.users || [],
    keys = query.data?.keys || [];
  const role = roles.find((r) => r.id === roleId) || roles[0],
    user = users.find((u) => u.id === userId) || users[0];
  const subject = roleMode ? role : user;
  const groupId = roleMode ? role?.id : user?.role_id;
  const groupAllowed = (key) =>
    query.data?.role_permissions.find(
      (p) => p.role_id === groupId && p.permission === key,
    )?.allowed === true;
  const override = (key) =>
    query.data?.user_permissions.find(
      (p) => p.user_id === user?.id && p.permission === key,
    );
  // Same resolution as the server: individual choice first, then the group; commercial areas also need "crm".
  const own = (key) => {
    if (roleMode) return groupAllowed(key);
    if (user?.is_super_admin) return true;
    const item = override(key);
    return item ? item.allowed === true : groupAllowed(key);
  };
  const effective = (key) => own(key) && (!key.startsWith("crm.") || own("crm"));
  const change = async (permission, allowed) => {
    if (busy) return;
    setBusy(permission);
    try {
      await teamRequest({
        action: "permission",
        permission,
        allowed,
        ...(roleMode ? { role_id: role.id } : { user_id: user.id }),
      });
      await query.reload();
      await auth.refreshAccess();
      notify("Permissão atualizada.");
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy("");
    }
  };
  const select = (id) => (roleMode ? setRoleId(id) : setUserId(id));
  const overrides = (id) =>
    query.data?.user_permissions.filter((p) => p.user_id === id).length || 0;
  const describe = (item) =>
    roleMode
      ? item.description || "Sem descrição"
      : [
          item.is_super_admin
            ? "Super administrador"
            : roles.find((r) => r.id === item.role_id)?.name,
          !item.is_super_admin && overrides(item.id)
            ? `${overrides(item.id)} ${overrides(item.id) === 1 ? "ajuste" : "ajustes"}`
            : "",
          item.active === false ? "Inativo" : "",
        ]
          .filter(Boolean)
          .join(" · ");
  const items = roleMode ? roles : users;
  const listed = items.filter((item) => matchesQuery(search, item.name, describe(item)));
  const allowedCount = keys.filter((key) => effective(key.key)).length;
  const groupName = roles.find((r) => r.id === user?.role_id)?.name;
  const locked = !roleMode && user?.is_super_admin;
  const renderRow = (key) => {
    const allowed = effective(key.key),
      saving = busy === key.key,
      dependent = key.key.startsWith("crm.") && !own("crm");
    const item = roleMode ? null : override(key.key);
    const value = locked ? "allow" : item ? (item.allowed ? "allow" : "deny") : "inherit";
    const meta = roleMode
      ? [
          key.key === "crm" ? "Libera as áreas comerciais desta lista" : "",
          dependent ? "Só vale com Comercial liberado" : "",
        ]
      : locked
        ? ["Acesso completo"]
        : [
            `Grupo: ${groupAllowed(key.key) ? "permitido" : "bloqueado"}`,
            item ? "Ajuste individual" : "",
            dependent ? "Depende de Comercial" : "",
          ];
    const scope = key.key === "whatsapp" ? "Caixa e contatos compartilhados da DUUK; conexão somente pelo super administrador" : key.key === "billing" ? "Conta Asaas da DUUK, cobranças, taxas e consultas; sem saques" : key.key === "spotify" ? "Conexão e player da própria conta Spotify" : "";
    const text = [...meta, scope].filter(Boolean).join(" · ");
    return (
      <li
        key={key.key}
        className={`settings-permission${roleMode ? " is-switch" : ""}`}
        aria-busy={saving || undefined}
      >
        <span className="settings-permission__icon" aria-hidden="true">
          <Icon name={permissionIcons[key.key] || "shield"} size={16} />
        </span>
        <div className="settings-permission__text">
          <p className="settings-permission__name">{key.label}</p>
          {text && <p className="settings-permission__meta">{text}</p>}
        </div>
        {roleMode ? (
          <>
            <span className="settings-permission__state">
              {saving ? "Salvando…" : groupAllowed(key.key) ? "Permitido" : "Bloqueado"}
            </span>
            <button
              type="button"
              className="settings-switch"
              role="switch"
              aria-checked={groupAllowed(key.key)}
              aria-label={`Acesso a ${key.label}`}
              aria-disabled={busy ? "true" : undefined}
              onClick={() => change(key.key, !groupAllowed(key.key))}
            >
              <span aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <span
              className={`ds-badge settings-permission__result ${allowed ? "ds-badge--success" : "ds-badge--neutral"}`}
            >
              <Icon name={saving ? "refresh" : allowed ? "check" : "lock"} size={12} className={saving ? "is-spinning" : undefined} />
              {saving ? "Salvando…" : allowed ? "Liberado" : "Bloqueado"}
            </span>
            {!locked && (
              <div
                className="ds-segmented settings-permission__choice"
                role="group"
                aria-label={`Permissão para ${key.label}`}
              >
                {choices.map(([option, label, full]) => (
                  <button
                    key={option}
                    type="button"
                    title={full}
                    aria-pressed={value === option}
                    aria-disabled={busy ? "true" : undefined}
                    onClick={() => {
                      if (value !== option)
                        change(
                          key.key,
                          option === "inherit" ? null : option === "allow",
                        );
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </li>
    );
  };
  return (
    <>
      <PageTitle
        title={roleMode ? "Grupos de acesso" : "Permissões individuais"}
        description={
          roleMode
            ? "Defina os módulos de cada função."
            : "Ajustes individuais têm prioridade sobre o grupo."
        }
      >
        {roleMode && (
          <button
            type="button"
            className="admin-button"
            onClick={() => setEditing("new")}
          >
            <Icon name="plus" />
            Novo grupo
          </button>
        )}
      </PageTitle>
      <QueryState query={query}>
        {query.data &&
          (subject ? (
            <div className="settings-access">
              <div className="settings-access__layout">
                <section
                  className="admin-panel settings-access__list"
                  aria-label={roleMode ? "Grupos" : "Pessoas"}
                >
                  <h2 className="settings-access__list-title">
                    {roleMode ? "Grupos" : "Pessoas"}
                    <span>{items.length}</span>
                  </h2>
                  {items.length > 8 && (
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      label={roleMode ? "Buscar grupo" : "Buscar pessoa"}
                    />
                  )}
                  <ul>
                    {listed.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="settings-access__item"
                          aria-current={item.id === subject.id ? "true" : undefined}
                          onClick={() => select(item.id)}
                        >
                          {roleMode ? (
                            <span className="settings-access__glyph" aria-hidden="true">
                              <Icon name="shield" size={15} />
                            </span>
                          ) : (
                            <Avatar profile={item} size={28} />
                          )}
                          <span>
                            <strong>{item.name}</strong>
                            <small>{describe(item)}</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!listed.length && (
                    <p className="settings-access__none">Nada encontrado para essa busca.</p>
                  )}
                </section>
                <div className="settings-access__picker">
                  <Field label={roleMode ? "Grupo" : "Pessoa"}>
                    <select value={subject.id} onChange={(e) => select(e.target.value)}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <section
                  className="admin-panel settings-access__editor"
                  aria-labelledby={headingId}
                >
                  <header className="settings-access__head">
                    {roleMode ? (
                      <span className="settings-card__icon" aria-hidden="true">
                        <Icon name="shield" />
                      </span>
                    ) : (
                      <Avatar profile={user} size={40} />
                    )}
                    <div>
                      <h2 id={headingId}>{subject.name}</h2>
                      <p>
                        {roleMode
                          ? role.description || "Sem descrição."
                          : user.is_super_admin
                            ? "Acesso completo de super administrador."
                            : `Grupo: ${groupName || "—"}`}
                      </p>
                    </div>
                    {roleMode && (
                      <div className="settings-access__actions">
                        <button
                          type="button"
                          className="admin-button admin-button--secondary admin-button--sm"
                          aria-label="Editar grupo"
                          onClick={() => setEditing(role)}
                        >
                          <Icon name="edit" />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button admin-icon-button--danger"
                          aria-label="Excluir grupo"
                          title="Excluir grupo"
                          onClick={() => setDeleting(role)}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    )}
                  </header>
                  <div className="settings-access__summary">
                    <p>
                      <strong>{allowedCount}</strong> de {keys.length} módulos liberados
                    </p>
                    <div className="ds-progress" aria-hidden="true">
                      <span
                        style={{
                          width: `${keys.length ? (allowedCount / keys.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  {locked ? (
                    <div className="ds-alert ds-alert--info settings-access__note">
                      <Icon name="shield" />
                      <p>
                        Super administradores mantêm acesso completo. Ajustes
                        individuais não se aplicam a esta conta.
                      </p>
                    </div>
                  ) : (
                    !roleMode && (
                      <p className="settings-access__legend">
                        <Icon name="info" size={16} />
                        <span>
                          <strong>Herdar</strong> segue o grupo{groupName ? ` ${groupName}` : ""}.{" "}
                          <strong>Permitir</strong> e <strong>Bloquear</strong> valem só
                          para esta pessoa.
                        </span>
                      </p>
                    )
                  )}
                  {!roleMode && user.active === false && (
                    <div className="ds-alert ds-alert--warning settings-access__note">
                      <Icon name="warning" />
                      <p>
                        Conta inativa. Nenhum módulo fica acessível enquanto ela
                        estiver inativa.
                      </p>
                    </div>
                  )}
                  {permissionGroups(keys).map((section) => (
                    <section className="settings-access__group" key={section.label}>
                      <div className="settings-access__group-head">
                        <h3>{section.label}</h3>
                        <span>
                          {section.items.filter((key) => effective(key.key)).length} de{" "}
                          {section.items.length}
                        </span>
                      </div>
                      <ul>{section.items.map(renderRow)}</ul>
                    </section>
                  ))}
                </section>
              </div>
            </div>
          ) : (
            <div className="admin-panel">
              <EmptyState
                icon={roleMode ? "shield" : "users"}
                title={roleMode ? "Nenhum grupo ainda" : "Nenhuma pessoa cadastrada"}
                action={
                  roleMode && (
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => setEditing("new")}
                    >
                      <Icon name="plus" />
                      Novo grupo
                    </button>
                  )
                }
              >
                {roleMode
                  ? "Crie um grupo para definir os módulos de cada função."
                  : "As pessoas cadastradas em Usuários aparecem aqui."}
              </EmptyState>
            </div>
          ))}
      </QueryState>
      {editing && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={query.reload}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Excluir grupo?"
          message={`O grupo ${deleting.name} só pode ser excluído quando não tiver usuários vinculados.`}
          action="Excluir grupo"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await teamRequest({ action: "delete-role", id: deleting.id });
            await query.reload();
            notify("Grupo excluído.");
          }}
        />
      )}
    </>
  );
}
export function ProfilePage({ notify }) {
  const auth = useAuth(),
    p = auth.profile;
  const [form, setForm] = useState({
      name: p.name,
      phone: p.phone,
      job_title: p.job_title,
    }),
    [email, setEmail] = useState(auth.user.email),
    [password, setPassword] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [busy, setBusy] = useState(""),
    [preview, setPreview] = useState(""),
    [file, setFile] = useState(null),
    [errors, setErrors] = useState({}),
    [securityErrors, setSecurityErrors] = useState({}),
    [photoError, setPhotoError] = useState(""),
    [cropFile, setCropFile] = useState(null),
    [removing, setRemoving] = useState(false);
  const fileInput = useRef(null),
    photoId = useId();
  useUnsavedChanges(
    JSON.stringify(form) !==
      JSON.stringify({
        name: p.name,
        phone: p.phone,
        job_title: p.job_title,
      }) ||
      !!file ||
      !!password ||
      email !== auth.user.email,
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const edit = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  };
  const select = (e) => {
    const selected = e.target.files[0];
    e.target.value = "";
    if (!selected) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      !selected.size || selected.size > AVATAR_SOURCE_LIMIT
    ) {
      setPhotoError("Use JPG, PNG ou WebP de até 20 MB.");
      return;
    }
    setPhotoError("");
    setCropFile(selected);
  };
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = onlyErrors({
      name: requiredText(form.name, 120, "Informe seu nome."),
      phone: optionalText(form.phone, 40),
      job_title: optionalText(form.job_title, 100),
    });
    setErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(e.currentTarget);
    setBusy("profile");
    try {
      await teamRequest({ action: "profile", ...form });
      if (file) {
        const body = new FormData();
        body.set("file", file);
        await teamRequest(body);
        setFile(null);
        setPreview("");
      }
      await auth.refreshAccess();
      notify("Perfil atualizado.");
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy("");
    }
  };
  const security = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = onlyErrors({
      email: emailError(email),
      currentPassword: currentPassword
        ? ""
        : "Informe a senha atual para confirmar a alteração.",
      password: password ? passwordError(password) : "",
    });
    setSecurityErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(e.currentTarget);
    setBusy("security");
    try {
      await verifyCurrentPassword(auth.user.email, currentPassword);
      const result = await supabase.auth.updateUser({
        current_password: currentPassword,
        ...(email !== auth.user.email ? { email } : {}),
        ...(password ? { password } : {}),
      });
      if (result.error) throw new Error(result.error.message);
      setPassword("");
      setCurrentPassword("");
      await auth.refreshAccess();
      notify(
        email !== auth.user.email
          ? "Confira a confirmação enviada aos endereços de e-mail."
          : "Senha alterada.",
      );
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy("");
    }
  };
  const editSecurity = (key, setter) => (value) => {
    setter(value);
    setSecurityErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  };
  return (
    <>
      <PageTitle
        title="Meu perfil"
        description="Seu nome e sua presença na equipe."
      >
        <Link
          className="admin-button admin-button--secondary"
          to="/admin/configuracoes/integracoes"
        >
          <Icon name="link" />
          Integrações
        </Link>
      </PageTitle>
      <div className="settings-profile">
        <div className="settings-profile__grid">
          <form
            className="ds-card settings-form"
            onSubmit={save}
            noValidate
            aria-labelledby="settings-profile-title"
            aria-busy={busy === "profile"}
          >
            <div className="settings-card__head">
              <div>
                <h2 id="settings-profile-title">Perfil</h2>
                <p>Como você aparece para a equipe.</p>
              </div>
            </div>
            <div className="settings-profile__identity">
              <Avatar
                profile={{ ...p, avatar_url: preview || p.avatar_url }}
                size={72}
              />
              <div className="settings-profile__photo">
                <div className="settings-profile__photo-actions">
                  <button
                    type="button"
                    className="admin-button admin-button--secondary admin-button--sm"
                    onClick={() => fileInput.current?.click()}
                    disabled={!!busy}
                    aria-describedby={`${photoId}-hint${photoError ? ` ${photoId}-error` : ""}`}
                  >
                    <Icon name="upload" />
                    Trocar foto
                  </button>
                  {(p.avatar_url || preview) && (
                    <button
                      type="button"
                      className="admin-text-button admin-text-button--danger"
                      disabled={!!busy}
                      onClick={() => setRemoving(true)}
                    >
                      Remover foto
                    </button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={select}
                  disabled={!!busy}
                  aria-label="Escolher foto de perfil"
                />
                <small id={`${photoId}-hint`}>
                  {file
                    ? `${file.name} · enviada ao salvar o perfil`
                    : "JPG, PNG ou WebP · até 20 MB · otimização automática"}
                </small>
                <FieldError id={`${photoId}-error`}>{photoError}</FieldError>
              </div>
            </div>
            <div className="admin-form-grid">
              <TextField
                className="ds-span-2"
                label="Nome"
                required
                maxLength={120}
                autoComplete="name"
                value={form.name}
                onChange={(v) => edit("name", v)}
                error={errors.name}
              />
              <TextField
                label="Telefone"
                optional
                type="tel"
                maxLength={40}
                autoComplete="tel"
                value={form.phone}
                onChange={(v) => edit("phone", v)}
                error={errors.phone}
              />
              <TextField
                label="Cargo"
                optional
                maxLength={100}
                autoComplete="organization-title"
                value={form.job_title}
                onChange={(v) => edit("job_title", v)}
                error={errors.job_title}
              />
            </div>
            <dl className="settings-profile__meta">
              <div>
                <dt>Função</dt>
                <dd>{p.is_super_admin ? "Super administrador" : p.role_name}</dd>
              </div>
              <div>
                <dt>Último acesso</dt>
                <dd>{date(auth.user.last_sign_in_at)}</dd>
              </div>
            </dl>
            <div className="settings-form__foot">
              <button
                type="submit"
                className="admin-button"
                disabled={!!busy}
                aria-busy={busy === "profile"}
              >
                {busy === "profile" ? "Salvando…" : "Salvar perfil"}
              </button>
            </div>
          </form>
          <form
            className="ds-card settings-form"
            onSubmit={security}
            noValidate
            aria-labelledby="settings-security-title"
            aria-busy={busy === "security"}
          >
            <div className="settings-card__head">
              <div>
                <h2 id="settings-security-title">Acesso e segurança</h2>
                <p>Para mudar o e-mail ou a senha, confirme com a senha atual.</p>
              </div>
            </div>
            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={editSecurity("email", setEmail)}
              error={securityErrors.email}
            />
            <PasswordField
              label="Senha atual"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={editSecurity("currentPassword", setCurrentPassword)}
              error={securityErrors.currentPassword}
            />
            <PasswordField
              label="Nova senha"
              optional
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              hint="Entre 12 e 128 caracteres. Deixe em branco para manter a atual."
              value={password}
              onChange={editSecurity("password", setPassword)}
              error={securityErrors.password}
            />
            <div className="settings-form__foot">
              <button
                type="submit"
                className="admin-button admin-button--secondary"
                disabled={!!busy || (!password && email === auth.user.email)}
                aria-busy={busy === "security"}
              >
                {busy === "security" ? "Atualizando…" : "Atualizar acesso"}
              </button>
            </div>
          </form>
        </div>
      </div>
      {cropFile && <AvatarCropper file={cropFile} onClose={() => setCropFile(null)} onApply={cropped => { setFile(cropped); setPreview(URL.createObjectURL(cropped)); setCropFile(null); }} />}
      {removing && (
        <ConfirmModal
          title="Remover foto?"
          message="Sua foto deixa de aparecer no perfil e para a equipe. Você pode enviar outra quando quiser."
          action="Remover foto"
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            setBusy("avatar");
            try {
              await teamRequest({ action: "remove-avatar" });
              setFile(null);
              setPreview("");
              await auth.refreshAccess();
              notify("Foto removida.");
            } finally {
              setBusy("");
            }
          }}
        />
      )}
    </>
  );
}

// Day groups follow Brasília time, like the rest of the admin.
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: zone,
  hour: "2-digit",
  minute: "2-digit",
});
const longDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const longDayYear = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
function dayKey(value) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return "";
  const parts = Object.fromEntries(
    dayParts.formatToParts(moment).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dayLabel(key) {
  const now = Date.now(),
    today = dayKey(now);
  if (!key) return "Sem data";
  if (key === today) return "Hoje";
  if (key === dayKey(now - 86400000)) return "Ontem";
  const text = (key.slice(0, 4) === today.slice(0, 4) ? longDay : longDayYear).format(
    new Date(`${key}T12:00:00Z`),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function byDay(items) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.created_at);
    if (groups.at(-1)?.key === key) groups.at(-1).items.push(item);
    else groups.push({ key, label: dayLabel(key), items: [item] });
  }
  return groups;
}
const timeOf = (value) => {
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? "" : clock.format(moment);
};

// Friendly names for the areas and actions recorded by the database and the Edge Functions.
const auditAreas = {
  duuk_clients: ["Clientes", "users"],
  duuk_activities: ["Contatos e atividades", "activity"],
  duuk_follow_ups: ["Follow-ups", "clock"],
  duuk_client_history: ["Histórico comercial", "history"],
  duuk_contracts: ["Contratos", "document"],
  duuk_contract_signatures: ["Assinaturas", "badgeCheck"],
  duuk_expenses: ["Despesas", "wallet"],
  duuk_income: ["Receitas", "wallet"],
  duuk_finance_goals: ["Metas", "wallet"],
  duuk_events: ["Agenda", "calendar"],
  duuk_content: ["Site", "globe"],
  duuk_media: ["Mídias do site", "media"],
  duuk_profiles: ["Equipe", "user"],
  duuk_roles: ["Grupos", "shield"],
  duuk_role_permissions: ["Permissões de grupo", "lock"],
  duuk_user_permissions: ["Permissões individuais", "lock"],
  duuk_permissions: ["Permissões", "lock"],
  duuk_drive_documents: ["Google Drive", "drive"],
  google_drive: ["Google Drive", "drive"],
  mailbox: ["E-mail", "mail"],
};
const auditActions = {
  insert: "Criação",
  create: "Criação",
  "create-user": "Criação",
  update: "Alteração",
  "update-user": "Alteração",
  profile: "Alteração",
  avatar: "Alteração",
  "save-role": "Alteração",
  permission: "Alteração",
  delete: "Exclusão",
  "delete-role": "Exclusão",
  sign: "Assinatura",
  "reset-password": "Senha redefinida",
  "drive.connect": "Conexão",
  "mail.connect": "Conexão",
  "drive.disconnect": "Desconexão",
  "drive.upload": "Envio de arquivo",
  "drive.proposal": "Envio de arquivo",
  "drive.document": "Envio de arquivo",
};
const areaOf = (entity) =>
  auditAreas[entity]?.[0] || String(entity || "").replace("duuk_", "");
const actionOf = (action) => auditActions[action] || String(action || "");
const distinct = (values) =>
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
function FilterSelect({ label, value, onChange, all, options }) {
  return (
    <label className="settings-select">
      <span className="ds-visually-hidden">{label}</span>
      <select
        className="ds-input ds-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
export function AuditPage() {
  const query = useQuery(
    useCallback(
      () =>
        rows("duuk_audit", (q) =>
          q.order("created_at", { ascending: false }).limit(200),
        ),
      [],
    ),
  );
  const [search, setSearch] = useState(""),
    [area, setArea] = useState(""),
    [action, setAction] = useState(""),
    [actor, setActor] = useState("");
  const items = query.data || [];
  const filtered = items.filter(
    (item) =>
      (!area || areaOf(item.entity) === area) &&
      (!action || actionOf(item.action) === action) &&
      (!actor || item.actor_name === actor) &&
      matchesQuery(search, item.summary, item.actor_name, areaOf(item.entity)),
  );
  const pager = usePagination(filtered, {
    resetKey: [search, area, action, actor].join("|"),
  });
  const filtering = Boolean(search || area || action || actor);
  const clear = () => {
    setSearch("");
    setArea("");
    setAction("");
    setActor("");
  };
  return (
    <>
      <PageTitle
        title="Histórico de alterações"
        description="Últimos 200 registros de atividade da plataforma."
      >
        <RefreshButton onRefresh={query.reload} />
      </PageTitle>
      <QueryState query={query}>
        {query.data && (
          <section className="admin-panel settings-audit" aria-label="Registros de atividade">
            <div className="ds-toolbar settings-toolbar">
              <SearchField
                value={search}
                onChange={setSearch}
                label="Buscar no histórico"
                placeholder="Buscar por resumo, pessoa ou área…"
              />
              <div className="ds-toolbar__filters settings-filters">
                <FilterSelect
                  label="Área"
                  value={area}
                  onChange={setArea}
                  all="Todas as áreas"
                  options={distinct(items.map((item) => areaOf(item.entity)))}
                />
                <FilterSelect
                  label="Ação"
                  value={action}
                  onChange={setAction}
                  all="Todas as ações"
                  options={distinct(items.map((item) => actionOf(item.action)))}
                />
                <FilterSelect
                  label="Pessoa"
                  value={actor}
                  onChange={setActor}
                  all="Todas as pessoas"
                  options={distinct(items.map((item) => item.actor_name))}
                />
              </div>
            </div>
            {filtering && pager.total > 0 && (
              <p className="settings-results" role="status">
                {pager.total} {pager.total === 1 ? "registro encontrado" : "registros encontrados"}
                <button type="button" className="admin-text-button" onClick={clear}>
                  Limpar filtros
                </button>
              </p>
            )}
            {pager.total ? (
              byDay(pager.items).map((day) => (
                <section className="settings-day" key={day.key || "sem-data"}>
                  <h2 className="settings-day__label">{day.label}</h2>
                  <ol className="settings-events">
                    {day.items.map((item) => (
                      <li className="settings-event" key={item.id}>
                        <span className="settings-event__icon" aria-hidden="true">
                          <Icon name={auditAreas[item.entity]?.[1] || "activity"} size={16} />
                        </span>
                        <div className="settings-event__main">
                          <h3>{item.summary}</h3>
                          <p>
                            {[item.actor_name, areaOf(item.entity)]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <time dateTime={item.created_at} title={date(item.created_at)}>
                          {timeOf(item.created_at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            ) : items.length ? (
              <EmptyState
                icon="search"
                title="Nenhum registro encontrado"
                action={
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={clear}
                  >
                    Limpar filtros
                  </button>
                }
              >
                Ajuste a busca ou os filtros de área, ação e pessoa.
              </EmptyState>
            ) : (
              <EmptyState icon="history" title="Nenhuma alteração registrada">
                As próximas ações da equipe aparecem aqui.
              </EmptyState>
            )}
            <Pagination pager={pager} noun="registros" />
          </section>
        )}
      </QueryState>
    </>
  );
}
