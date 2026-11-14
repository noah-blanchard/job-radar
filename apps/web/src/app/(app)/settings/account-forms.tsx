"use client";

import { Copy, Trash2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { changePassword, inviteUser, removeUser, type FormState } from "./actions";

function Message({ state }: { state: FormState }) {
  const t = useT();
  if (state.error)
    return (
      <p role="alert" className="text-destructive text-[13px]">
        {state.error}
      </p>
    );
  if (!state.ok) return null;
  return (
    <div className="grid gap-1.5 text-[13px]">
      <p className="text-success">{state.ok}</p>
      {state.link ? (
        <div className="flex items-center gap-2">
          <code className="bg-code min-w-0 flex-1 truncate rounded-md border px-2 py-1 text-xs">
            {state.link}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(state.link!)
                .then(() => toast({ message: t("settings.accounts.linkCopied") }));
            }}
          >
            <Copy className="size-3.5" />
            {t("common.copy")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Admin: invitation (new e-mail) or password-reset link (existing e-mail). */
export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteUser, {});
  const t = useT();
  return (
    <form action={action} className="mt-4 grid gap-2">
      <label htmlFor="invite-email" className="text-muted-foreground text-xs">
        {t("settings.accounts.inviteLabel")}
      </label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder={t("settings.accounts.emailPlaceholder")}
          required
          className="h-8 max-w-72"
        />
        <Button type="submit" size="default" variant="secondary" disabled={pending}>
          {pending ? "…" : t("settings.accounts.createLink")}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function DeleteUserButton({ id, email }: { id: number; email: string }) {
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={t("settings.accounts.deleteLabel", { email })}
      title={t("settings.accounts.deleteTitle")}
      onClick={() => {
        if (!window.confirm(t("settings.accounts.deleteConfirm", { email }))) return;
        start(async () => {
          const r = await removeUser(id);
          toast(
            r.ok
              ? { message: t("settings.accounts.deleted") }
              : { message: r.error ?? t("common.failed"), tone: "error" },
          );
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const t = useT();
  return (
    <form action={action} className="grid max-w-72 gap-2">
      <Input
        name="current"
        type="password"
        autoComplete="current-password"
        placeholder={t("settings.password.current")}
        aria-label={t("settings.password.current")}
        required
        className="h-8"
      />
      <Input
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={t("settings.password.newPlaceholder", { min: 8 })}
        aria-label={t("settings.password.newLabel")}
        minLength={8}
        required
        className="h-8"
      />
      <Input
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder={t("settings.password.confirm")}
        aria-label={t("settings.password.confirm")}
        minLength={8}
        required
        className="h-8"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-fit">
        {pending ? "…" : t("settings.password.submit")}
      </Button>
      <Message state={state} />
    </form>
  );
}
