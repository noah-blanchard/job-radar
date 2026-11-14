"use client";

import { Copy, Trash2 } from "lucide-react";
import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { changePassword, inviteUser, removeUser, type FormState } from "./actions";

function Message({ state }: { state: FormState }) {
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
                .then(() => toast({ message: "Lien copié" }));
            }}
          >
            <Copy className="size-3.5" />
            Copier
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Admin: invitation (new e-mail) or password-reset link (existing e-mail). */
export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteUser, {});
  return (
    <form action={action} className="mt-4 grid gap-2">
      <label htmlFor="invite-email" className="text-muted-foreground text-xs">
        Inviter quelqu&apos;un (ou réinitialiser le mot de passe d&apos;un compte existant)
      </label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="prenom@exemple.com"
          required
          className="h-8 max-w-72"
        />
        <Button type="submit" size="default" variant="secondary" disabled={pending}>
          {pending ? "…" : "Créer le lien"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function DeleteUserButton({ id, email }: { id: number; email: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Supprimer ${email}`}
      title="Supprimer le compte (ses scores, statuts et notes)"
      onClick={() => {
        if (!window.confirm(`Supprimer le compte ${email} et toutes ses données ?`)) return;
        start(async () => {
          const r = await removeUser(id);
          toast(
            r.ok ? { message: "Compte supprimé" } : { message: r.error ?? "échec", tone: "error" },
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
  return (
    <form action={action} className="grid max-w-72 gap-2">
      <Input
        name="current"
        type="password"
        autoComplete="current-password"
        placeholder="Mot de passe actuel"
        aria-label="Mot de passe actuel"
        required
        className="h-8"
      />
      <Input
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Nouveau (8 caractères min.)"
        aria-label="Nouveau mot de passe"
        minLength={8}
        required
        className="h-8"
      />
      <Input
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="Confirmation"
        aria-label="Confirmation"
        minLength={8}
        required
        className="h-8"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-fit">
        {pending ? "…" : "Changer le mot de passe"}
      </Button>
      <Message state={state} />
    </form>
  );
}
