"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { acceptInviteAction, type InviteState } from "../../login/actions";

export function InviteForm({ token, reset }: { token: string; reset: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInviteAction, {});
  const t = useT();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {reset ? null : (
        <>
          <label htmlFor="name" className="text-muted-foreground text-xs">
            {t("invite.firstName")}
          </label>
          <Input id="name" name="name" autoComplete="given-name" autoFocus className="h-9" />
        </>
      )}
      <label htmlFor="password" className="text-muted-foreground text-xs">
        {t("invite.password", { min: 8 })}
      </label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        autoFocus={reset}
        className="h-9"
      />
      <label htmlFor="confirm" className="text-muted-foreground text-xs">
        {t("invite.confirm")}
      </label>
      <Input
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        className="h-9"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "invite-error" : undefined}
      />
      {state.error ? (
        <p id="invite-error" role="alert" className="text-destructive text-[13px]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? t("invite.wait") : reset ? t("invite.save") : t("invite.create")}
      </Button>
    </form>
  );
}
