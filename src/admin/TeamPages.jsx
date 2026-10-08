import { useUnsavedChanges } from "./unsavedChanges";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../content/supabase";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { teamRequest, rows } from "./api";
import { ConfirmModal, Icon, Modal, RefreshButton } from "./components";
import { Avatar, Field, PageTitle, QueryState } from "./forms";

const date = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Ainda não entrou";
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
    [show, setShow] = useState(false);
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  useUnsavedChanges(true);
  const submit = async (e) => {
    e.preventDefault();
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
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit}>
        <div className="admin-modal__body admin-form-grid">
          <Field
            label="Nome"
            value={form.name}
            onChange={(v) => update("name", v)}
            required
            maxLength={120}
          />
          <Field
            label="E-mail"
            value={form.email}
            onChange={(v) => update("email", v)}
            type="email"
            required
          />
          <Field
            label="Telefone"
            value={form.phone}
            onChange={(v) => update("phone", v)}
            maxLength={40}
          />
          <Field
            label="Cargo"
            value={form.job_title}
            onChange={(v) => update("job_title", v)}
            maxLength={100}
          />
          <Field label="Grupo">
            <select
              value={form.role_id}
              onChange={(e) => update("role_id", e.target.value)}
              required
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {!user && (
            <Field label="Senha inicial">
              <div className="admin-password">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                />
                <button
                  className="admin-icon-button"
                  type="button"
                  aria-label="Mostrar ou ocultar senha"
                  onClick={() => setShow(!show)}
                >
                  <Icon name={show ? "eyeOff" : "eye"} />
                </button>
              </div>
            </Field>
          )}
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update("active", e.target.checked)}
            />
            Usuário ativo
          </label>
          {auth.profile.is_super_admin && (
            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.is_super_admin}
                onChange={(e) => update("is_super_admin", e.target.checked)}
              />
              Super administrador
            </label>
          )}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
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
          <button className="admin-button" disabled={busy}>
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
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
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
      <form onSubmit={submit}>
        <div className="admin-modal__body">
          <Field
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={value}
            onChange={setValue}
          />
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="admin-modal__foot">
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function UsersPage({ notify }) {
  const query = useQuery(
      useCallback(() => teamRequest({ action: "list" }), []),
    ),
    [editing, setEditing] = useState(null),
    [reset, setReset] = useState(null),
    [search, setSearch] = useState("");
  const auth = useAuth();
  return (
    <>
      <PageTitle
        title="Nossa equipe"
        description="Pessoas, funções e acesso ao estúdio."
      >
        <RefreshButton onRefresh={query.reload} />
        <button
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
          <section className="admin-panel">
            <div className="admin-list-toolbar">
              <label className="admin-search">
                <Icon name="search" />
                <input
                  placeholder="Buscar pessoa…"
                  aria-label="Buscar pessoa"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="platform-list">
              {query.data.users
                .filter((u) =>
                  `${u.name} ${u.email}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((u) => (
                  <article key={u.id} className="platform-row">
                    <Avatar profile={u} online={auth.presenceReady && auth.isOnline(u.id)} />
                    <div className="platform-row__main">
                      <h2>{u.name}</h2>
                      <p>{u.email}</p>
                      <small>
                        {u.is_super_admin
                          ? "Super administrador"
                          : u.duuk_roles?.name}{" "}
                        · {u.job_title || "Equipe"}
                        <br />
                        Último acesso: {date(u.last_sign_in_at)}
                      </small>
                    </div>
                    <div className="platform-user-status">
                      {u.active && (
                        <span className={`admin-status admin-status--presence${auth.presenceReady && auth.isOnline(u.id) ? " is-online" : ""}`}>
                          <i />
                          {auth.presenceReady ? (auth.isOnline(u.id) ? "Online agora" : "Offline") : "Verificando…"}
                        </span>
                      )}
                      <span
                        className={`admin-status admin-status--${u.active ? "published" : "archived"}`}
                      >
                        {u.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        className="admin-icon-button"
                        aria-label={`Editar ${u.name}`}
                        disabled={
                          u.is_super_admin && !auth.profile.is_super_admin
                        }
                        onClick={() => setEditing(u)}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        className="admin-icon-button"
                        aria-label={`Redefinir senha de ${u.name}`}
                        disabled={
                          u.is_super_admin && !auth.profile.is_super_admin
                        }
                        onClick={() => setReset(u)}
                      >
                        <Icon name="lock" />
                      </button>
                    </div>
                  </article>
                ))}
            </div>
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
    [error, setError] = useState("");
  return (
    <Modal title={role ? "Editar grupo" : "Novo grupo"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
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
        }}
      >
        <div className="admin-modal__body admin-form-grid">
          <Field
            label="Nome do grupo"
            value={name}
            onChange={setName}
            required
            maxLength={60}
          />
          <Field
            label="Descrição"
            value={description}
            onChange={setDescription}
            maxLength={300}
          />
          {error && <p className="admin-error">{error}</p>}
        </div>
        <div className="admin-modal__foot">
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar grupo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PermissionsPage({ notify, mode = "roles" }) {
  const auth = useAuth(),
    query = useQuery(useCallback(() => teamRequest({ action: "access" }), []));
  const [roleId, setRoleId] = useState(""),
    [userId, setUserId] = useState(""),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState("");
  const role = query.data?.roles.find(
      (r) => r.id === (roleId || query.data.roles[0]?.id),
    ),
    user = query.data?.users.find(
      (u) => u.id === (userId || query.data.users[0]?.id),
    );
  const change = async (permission, allowed) => {
    setBusy(permission);
    try {
      await teamRequest({
        action: "permission",
        permission,
        allowed,
        ...(mode === "roles" ? { role_id: role.id } : { user_id: user.id }),
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
  return (
    <>
      <PageTitle
        title={mode === "roles" ? "Grupos de acesso" : "Permissões individuais"}
        description={
          mode === "roles"
            ? "Defina os módulos de cada função."
            : "Ajustes individuais têm prioridade sobre o grupo."
        }
      >
        {mode === "roles" && (
          <button className="admin-button" onClick={() => setEditing("new")}>
            <Icon name="plus" />
            Novo grupo
          </button>
        )}
      </PageTitle>
      <QueryState query={query}>
        {query.data && (
          <div className="platform-settings-grid">
            <section className="admin-panel platform-selection">
              <h2>{mode === "roles" ? "Grupos" : "Pessoas"}</h2>
              {(mode === "roles" ? query.data.roles : query.data.users).map(
                (item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      mode === "roles" ? setRoleId(item.id) : setUserId(item.id)
                    }
                    className={
                      (mode === "roles" ? role?.id : user?.id) === item.id
                        ? "is-active"
                        : ""
                    }
                  >
                    <Icon name={mode === "roles" ? "shield" : "user"} />
                    <span>{item.name}</span>
                  </button>
                ),
              )}
            </section>
            <section className="admin-panel platform-permissions">
              <div className="admin-section-head">
                <div>
                  <h2>{mode === "roles" ? role?.name : user?.name}</h2>
                  <p>
                    {mode === "roles"
                      ? role?.description
                      : user?.is_super_admin
                        ? "Acesso completo de super administrador."
                        : `Grupo: ${query.data.roles.find((r) => r.id === user?.role_id)?.name}`}
                  </p>
                </div>
                {mode === "roles" && (
                  <div className="admin-row-actions">
                    <button
                      className="admin-icon-button"
                      aria-label="Editar grupo"
                      onClick={() => setEditing(role)}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      className="admin-icon-button"
                      aria-label="Excluir grupo"
                      onClick={() => setDeleting(role)}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                )}
              </div>
              {query.data.keys.map((key) => {
                const inherited =
                  query.data.role_permissions.find(
                    (p) =>
                      p.role_id ===
                        (mode === "roles" ? role?.id : user?.role_id) &&
                      p.permission === key.key,
                  )?.allowed === true;
                const override = query.data.user_permissions.find(
                  (p) => p.user_id === user?.id && p.permission === key.key,
                );
                return (
                  <div key={key.key} className="platform-permission">
                    <span>
                      {key.label}
                      <small>
                        {mode === "users" &&
                          `Grupo: ${inherited ? "permitido" : "bloqueado"}`}
                      </small>
                    </span>
                    {mode === "roles" ? (
                      <button
                        className={`platform-switch${inherited ? " is-on" : ""}`}
                        role="switch"
                        aria-checked={inherited}
                        aria-label={`Acesso a ${key.label}`}
                        disabled={!!busy}
                        onClick={() => change(key.key, !inherited)}
                      >
                        <span />
                      </button>
                    ) : (
                      <select
                        aria-label={`Permissão para ${key.label}`}
                        value={
                          user?.is_super_admin
                            ? "allow"
                            : override
                              ? override.allowed
                                ? "allow"
                                : "deny"
                              : "inherit"
                        }
                        disabled={!!busy || user?.is_super_admin}
                        onChange={(e) =>
                          change(
                            key.key,
                            e.target.value === "inherit"
                              ? null
                              : e.target.value === "allow",
                          )
                        }
                      >
                        <option value="inherit">Herdar do grupo</option>
                        <option value="allow">Permitir</option>
                        <option value="deny">Bloquear</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </QueryState>
      {editing && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={query.reload}
        />
      )}{" "}
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
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(""),
    [file, setFile] = useState(null);
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
  const select = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size > 2097152
    ) {
      notify("Use JPG, PNG ou WebP de até 2 MB.", true);
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
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
      setBusy(false);
    }
  };
  const security = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const verify = await supabase.auth.signInWithPassword({
        email: auth.user.email,
        password: currentPassword,
      });
      if (verify.error) throw new Error("A senha atual não confere.");
      const result = await supabase.auth.updateUser({
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
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Meu perfil"
        description="Seu nome e sua presença na equipe."
      ><Link className="admin-button admin-button--secondary" to="/admin/configuracoes/integracoes"><Icon name="link"/>Integrações</Link></PageTitle>
      <div className="platform-profile-grid">
        <form className="admin-panel platform-form" onSubmit={save}>
          <div className="platform-profile-photo">
            <Avatar
              profile={{ ...p, avatar_url: preview || p.avatar_url }}
              size={88}
            />
            <div>
              <label className="admin-button admin-button--secondary">
                <Icon name="upload" />
                Trocar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={select}
                  disabled={busy}
                />
              </label>
              <small>JPG, PNG ou WebP · até 2 MB</small>
              {(p.avatar_url || preview) && (
                <button
                  type="button"
                  className="admin-text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await teamRequest({ action: "remove-avatar" });
                      setFile(null);
                      setPreview("");
                      await auth.refreshAccess();
                      notify("Foto removida.");
                    } catch (cause) {
                      notify(cause.message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remover foto
                </button>
              )}
            </div>
          </div>
          {[
            ["name", "Nome"],
            ["phone", "Telefone"],
            ["job_title", "Cargo"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              required={key === "name"}
              maxLength={key === "name" ? 120 : key === "phone" ? 40 : 100}
              value={form[key]}
              onChange={(v) => setForm((old) => ({ ...old, [key]: v }))}
            />
          ))}
          <p className="platform-muted">
            {p.is_super_admin ? "Super administrador" : p.role_name}
            <br />
            Último acesso: {date(auth.user.last_sign_in_at)}
          </p>
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar perfil"}
          </button>
        </form>
        <form className="admin-panel platform-form" onSubmit={security}>
          <h2>Acesso e segurança</h2>
          <Field
            label="E-mail"
            type="email"
            required
            value={email}
            onChange={setEmail}
          />
          <Field
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <Field
            label="Nova senha (opcional)"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={setPassword}
          />
          <button
            className="admin-button admin-button--secondary"
            disabled={busy || (!password && email === auth.user.email)}
          >
            Atualizar acesso
          </button>
        </form>
      </div>
    </>
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
  return (
    <>
      <PageTitle
        title="Histórico de alterações"
        description="Últimos 200 registros de atividade da plataforma."
      >
        <RefreshButton onRefresh={query.reload} />
      </PageTitle>
      <QueryState query={query}>
        <section className="admin-panel platform-list">
          {query.data?.map((item) => (
            <article className="platform-row" key={item.id}>
              <Icon name="activity" />
              <div className="platform-row__main">
                <h2>{item.summary}</h2>
                <p>
                  {item.actor_name} · {item.entity.replace("duuk_", "")}
                </p>
                <small>{date(item.created_at)}</small>
              </div>
            </article>
          ))}
          {query.data?.length === 0 && (
            <div className="admin-empty">
              <p>Nenhuma alteração registrada.</p>
            </div>
          )}
        </section>
      </QueryState>
    </>
  );
}
