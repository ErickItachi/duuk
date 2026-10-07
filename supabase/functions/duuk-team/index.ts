import {
  checked,
  database,
  handler,
  HttpError,
  json,
  member,
  readBody,
  readJson,
  text,
  uuid,
} from "../_shared/http.ts";

const emailOf = (v: unknown) => {
  const e = text(v, "o e-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new HttpError("Confira o e-mail.");
  return e;
};
const passwordOf = (v: unknown) => {
  const p = String(v || "");
  if (p.length < 8 || p.length > 128)
    throw new HttpError("Use uma senha entre 8 e 128 caracteres.");
  return p;
};
handler(async (req, headers) => {
  const db = database(),
    user = await member(req, db);
  const own = checked(
    await db.from("duuk_profiles").select("*").eq("id", user.id).single(),
  );
  const allowed = async (key: string) => {
    if (
      !checked(
        await db.rpc("duuk_check_permission", {
          actor: user.id,
          requested: key,
        }),
      )
    )
      throw new HttpError("Sem permissão para esta ação.", 403);
  };
  const audit = async (
    action: string,
    entity: string,
    id: string,
    summary: string,
  ) =>
    checked(
      await db
        .from("duuk_audit")
        .insert({
          actor_id: user.id,
          actor_name: own.name,
          action,
          entity,
          entity_id: id,
          summary,
        }),
    );
  const avatarUrl = async (path: string | null) =>
    path
      ? checked(
          await db.storage.from("duuk-avatars").createSignedUrl(path, 3600),
        )?.signedUrl
      : null;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await new Response(await readBody(req, 2200000), {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 2097152)
      throw new HttpError("Use uma foto de até 2 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime =
      bytes[0] === 0xff && bytes[1] === 0xd8
        ? "image/jpeg"
        : bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          ? "image/png"
          : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
              new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : "";
    if (!mime || file.type !== mime)
      throw new HttpError("Use uma foto JPG, PNG ou WebP válida.");
    const path = `${user.id}/${crypto.randomUUID()}.${mime.split("/")[1]}`;
    checked(
      await db.storage
        .from("duuk-avatars")
        .upload(path, bytes, { contentType: mime }),
    );
    const saved = await db
      .from("duuk_profiles")
      .update({ avatar_path: path })
      .eq("id", user.id);
    if (saved.error) {
      await db.storage.from("duuk-avatars").remove([path]);
      checked(saved);
    }
    if (own.avatar_path)
      await db.storage.from("duuk-avatars").remove([own.avatar_path]);
    await audit(
      "avatar",
      "duuk_profiles",
      user.id,
      "Foto de perfil atualizada",
    );
    return json({ avatar_url: await avatarUrl(path) }, headers);
  }
  const body = await readJson(req, 50000);
  if (
    !["context", "directory", "list", "access"].includes(body.action) &&
    !checked(
      await db.rpc("duuk_action_limit", {
        actor: user.id,
        action_name: "team-write",
        maximum: 100,
        window_seconds: 600,
      }),
    )
  )
    throw new HttpError(
      "Muitas alterações em sequência. Aguarde alguns minutos.",
      429,
    );
  if (body.action === "directory") {
    const people =
      checked(
        await db
          .from("duuk_profiles")
          .select("id,name,job_title,avatar_path")
          .eq("active", true)
          .order("name"),
      ) || [];
    return json(
      await Promise.all(
        people.map(async (p: any) => ({
          id: p.id,
          name: p.name,
          job_title: p.job_title,
          avatar_url: await avatarUrl(p.avatar_path),
        })),
      ),
      headers,
    );
  }
  if (body.action === "context") {
    if (user.email && user.email !== own.email) {
      checked(
        await db
          .from("duuk_profiles")
          .update({ email: user.email })
          .eq("id", user.id),
      );
      own.email = user.email;
    }

    const keys =
      checked(await db.from("duuk_permission_keys").select("*")) || [];
    const group = checked(
      await db.from("duuk_roles").select("name").eq("id", own.role_id).single(),
    );
    const inherited =
      checked(
        await db
          .from("duuk_role_permissions")
          .select("permission,allowed")
          .eq("role_id", own.role_id),
      ) || [];
    const overrides =
      checked(
        await db
          .from("duuk_user_permissions")
          .select("permission,allowed")
          .eq("user_id", user.id),
      ) || [];
    const permissions = Object.fromEntries(
      keys.map((k: any) => [
        k.key,
        own.is_super_admin ||
          (overrides.find((p: any) => p.permission === k.key)?.allowed ??
            inherited.find((p: any) => p.permission === k.key)?.allowed ??
            false),
      ]),
    );
    return json(
      {
        profile: {
          ...own,
          avatar_url: await avatarUrl(own.avatar_path),
          role_name: group?.name,
        },
        permissions,
      },
      headers,
    );
  }
  if (body.action === "profile") {
    const changes = {
      name: text(body.name, "seu nome", 120),
      phone: text(body.phone, "o telefone", 40, false),
      job_title: text(body.job_title, "o cargo", 100, false),
    };
    checked(await db.from("duuk_profiles").update(changes).eq("id", user.id));
    await audit("profile", "duuk_profiles", user.id, "Perfil atualizado");
    return json({ saved: true }, headers);
  }
  if (body.action === "remove-avatar") {
    checked(
      await db
        .from("duuk_profiles")
        .update({ avatar_path: null })
        .eq("id", user.id),
    );
    if (own.avatar_path)
      checked(await db.storage.from("duuk-avatars").remove([own.avatar_path]));
    await audit("avatar", "duuk_profiles", user.id, "Foto removida");
    return json({ saved: true }, headers);
  }
  if (body.action === "list") {
    await allowed("team");
    const profiles =
      checked(
        await db
          .from("duuk_profiles")
          .select("*,duuk_roles(name)")
          .order("name"),
      ) || [];
    const users = await Promise.all(
      profiles.map(async (p: any) => {
        const result = await db.auth.admin.getUserById(p.id);
        if (result.error)
          throw new HttpError("Não foi possível consultar a equipe.", 500);
        return {
          ...p,
          last_sign_in_at: result.data.user.last_sign_in_at,
          avatar_url: await avatarUrl(p.avatar_path),
        };
      }),
    );
    return json(
      {
        users,
        roles: checked(await db.from("duuk_roles").select("*").order("name")),
      },
      headers,
    );
  }
  if (body.action === "access") {
    await allowed("permissions");
    return json(
      {
        roles: checked(await db.from("duuk_roles").select("*").order("name")),
        keys: checked(
          await db.from("duuk_permission_keys").select("*").order("label"),
        ),
        role_permissions: checked(
          await db.from("duuk_role_permissions").select("*"),
        ),
        user_permissions: checked(
          await db.from("duuk_user_permissions").select("*"),
        ),
        users: checked(
          await db
            .from("duuk_profiles")
            .select("id,name,role_id,is_super_admin,active")
            .order("name"),
        ),
      },
      headers,
    );
  }
  if (
    body.action === "create" ||
    body.action === "update" ||
    body.action === "reset-password"
  ) {
    await allowed("team");
    const target =
      body.action === "create"
        ? null
        : checked(
            await db
              .from("duuk_profiles")
              .select("*")
              .eq("id", uuid(body.id))
              .single(),
          );
    if (
      (target?.is_super_admin || body.is_super_admin === true) &&
      !own.is_super_admin
    )
      throw new HttpError(
        "Somente um super administrador pode alterar esta conta.",
        403,
      );
    if (body.action === "reset-password") {
      const result = await db.auth.admin.updateUserById(target.id, {
        password: passwordOf(body.password),
      });
      if (result.error)
        throw new HttpError("Não foi possível redefinir a senha.");
      await audit(
        "reset-password",
        "duuk_profiles",
        target.id,
        "Senha redefinida pelo administrador",
      );
      return json({ saved: true }, headers);
    }
    const changes = {
      name: text(body.name, "o nome", 120),
      email: emailOf(body.email),
      phone: text(body.phone, "o telefone", 40, false),
      job_title: text(body.job_title, "o cargo", 100, false),
      role_id: uuid(body.role_id),
      active: body.active !== false,
      is_super_admin: body.is_super_admin === true,
    };
    const role = checked(
      await db
        .from("duuk_roles")
        .select("id")
        .eq("id", changes.role_id)
        .maybeSingle(),
    );
    if (!role) throw new HttpError("Grupo não encontrado.");
    if (body.action === "create") {
      const created = await db.auth.admin.createUser({
        email: changes.email,
        password: passwordOf(body.password),
        email_confirm: true,
        user_metadata: { name: changes.name },
      });
      if (created.error || !created.data.user)
        throw new HttpError(
          "Não foi possível criar a conta. Confira se o e-mail já existe.",
        );
      const insert = await db
        .from("duuk_profiles")
        .insert({ id: created.data.user.id, ...changes });
      if (insert.error) {
        await db.auth.admin.deleteUser(created.data.user.id);
        checked(insert);
      }
      await audit(
        "create-user",
        "duuk_profiles",
        created.data.user.id,
        "Usuário criado",
      );
      return json({ id: created.data.user.id }, headers);
    }
    if (target.email !== changes.email) {
      const result = await db.auth.admin.updateUserById(target.id, {
        email: changes.email,
        email_confirm: true,
      });
      if (result.error)
        throw new HttpError("Não foi possível alterar o e-mail.");
    }
    checked(await db.from("duuk_profiles").update(changes).eq("id", target.id));
    await audit(
      "update-user",
      "duuk_profiles",
      target.id,
      "Acesso do usuário atualizado",
    );
    return json({ saved: true }, headers);
  }
  if (body.action === "save-role") {
    await allowed("permissions");
    const changes = {
      name: text(body.name, "o nome do grupo", 60),
      description: text(body.description, "a descrição", 300, false),
    };
    const role = body.id
      ? checked(
          await db
            .from("duuk_roles")
            .update(changes)
            .eq("id", uuid(body.id))
            .select()
            .single(),
        )
      : checked(await db.from("duuk_roles").insert(changes).select().single());
    await audit("save-role", "duuk_roles", role.id, "Grupo atualizado");
    return json(role, headers);
  }
  if (body.action === "delete-role") {
    await allowed("permissions");
    checked(await db.from("duuk_roles").delete().eq("id", uuid(body.id)));
    await audit("delete-role", "duuk_roles", body.id, "Grupo excluído");
    return json({ deleted: true }, headers);
  }
  if (body.action === "permission") {
    await allowed("permissions");
    const permission = text(body.permission, "a permissão", 40);
    if (
      !checked(
        await db
          .from("duuk_permission_keys")
          .select("key")
          .eq("key", permission)
          .maybeSingle(),
      )
    )
      throw new HttpError("Permissão inválida.");
    if (body.user_id) {
      const target = checked(
        await db
          .from("duuk_profiles")
          .select("id,is_super_admin")
          .eq("id", uuid(body.user_id))
          .single(),
      );
      if (!target) throw new HttpError("Usuário não encontrado.", 404);
      if (target.is_super_admin)
        throw new HttpError("Super administradores mantêm acesso completo.");
      if (body.allowed === null)
        checked(
          await db
            .from("duuk_user_permissions")
            .delete()
            .eq("user_id", target.id)
            .eq("permission", permission),
        );
      else
        checked(
          await db
            .from("duuk_user_permissions")
            .upsert({
              user_id: target.id,
              permission,
              allowed: body.allowed === true,
            }),
        );
    } else
      checked(
        await db
          .from("duuk_role_permissions")
          .upsert({
            role_id: uuid(body.role_id),
            permission,
            allowed: body.allowed === true,
          }),
      );
    await audit(
      "permission",
      "duuk_permissions",
      body.user_id || body.role_id,
      "Permissão de módulo atualizada",
    );
    return json({ saved: true }, headers);
  }
  throw new HttpError("Ação inválida.");
});
