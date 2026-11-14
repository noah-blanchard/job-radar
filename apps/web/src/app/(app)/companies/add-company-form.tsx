"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCompany, type AddCompanyState } from "./actions";

export function AddCompanyForm() {
  const [state, action, pending] = useActionState<AddCompanyState, FormData>(addCompany, {});
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start">
      <Input
        name="url"
        type="url"
        required
        placeholder="URL du board carrières (jobs.lever.co/acme, …)"
        className="sm:max-w-md"
        aria-label="URL carrières"
      />
      <Input name="name" placeholder="Nom (optionnel)" className="sm:max-w-48" aria-label="Nom" />
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
      {state.error ? (
        <p className="text-destructive text-sm sm:self-center">{state.error}</p>
      ) : state.ok ? (
        <p className="text-success text-sm sm:self-center">{state.ok}</p>
      ) : null}
    </form>
  );
}
