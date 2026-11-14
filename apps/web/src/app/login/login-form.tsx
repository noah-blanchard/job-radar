"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-muted-foreground text-xs">
        E-mail
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        autoFocus
        required
        className="h-9"
      />
      <label htmlFor="password" className="text-muted-foreground text-xs">
        Mot de passe
      </label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="h-9"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "login-error" : undefined}
      />
      {state.error ? (
        <p id="login-error" role="alert" className="text-destructive text-[13px]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Connexion…" : "Entrer"}
      </Button>
    </form>
  );
}
