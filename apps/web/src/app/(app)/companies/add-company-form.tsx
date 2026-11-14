"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { addCompany, type AddCompanyState } from "./actions";

/** One row: board URL, optional name, add. The result lands as a toast; the form clears on success. */
export function AddCompanyForm() {
  const [state, action, pending] = useActionState<AddCompanyState, FormData>(addCompany, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast({ message: state.ok });
      form.current?.reset();
    }
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        name="url"
        type="url"
        required
        placeholder="URL du board carrières (jobs.lever.co/acme…)"
        className="sm:w-80"
        aria-label="URL carrières"
        aria-invalid={state.error ? true : undefined}
      />
      <Input name="name" placeholder="Nom (optionnel)" className="sm:w-40" aria-label="Nom" />
      <Button type="submit" disabled={pending} variant="outline">
        <Plus aria-hidden /> {pending ? "Ajout…" : "Ajouter"}
      </Button>
      {state.error ? (
        <p className="text-destructive text-xs sm:max-w-sm" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
