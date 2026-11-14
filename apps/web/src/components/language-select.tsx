"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setLocale } from "@/app/(app)/settings/actions";
import { setGuestLocale } from "@/app/login/actions";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Settings → Language: saved on the account (every device) and in this browser (login page). */
export function LanguageSettings({ chosen }: { chosen: boolean }) {
  const t = useT();
  const current = useLocale();
  const router = useRouter();
  const [value, setValue] = useState<Locale>(current);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground">{t("settings.language.label")}</span>
        <Segmented
          label={t("settings.language.label")}
          value={value}
          disabled={pending}
          options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={(next) => {
            if (next === value) return;
            const prev = value;
            setValue(next);
            start(async () => {
              const r = await setLocale(next);
              if (r.ok) router.refresh();
              else {
                setValue(prev);
                toast({ tone: "error", message: t("settings.language.failed") });
              }
            });
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {chosen ? t("settings.language.help") : t("settings.language.helpBrowser")}
      </p>
    </div>
  );
}

/** Signed-out pages: a quiet language switch under the form (this browser only). */
export function GuestLanguage() {
  const t = useT();
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <p
      className={cn("text-muted-foreground mt-6 flex gap-3 text-xs", pending && "opacity-60")}
      aria-label={t("login.language")}
    >
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={l.code === current}
          disabled={pending}
          onClick={() =>
            l.code !== current &&
            start(async () => {
              await setGuestLocale(l.code);
              router.refresh();
            })
          }
          className={cn(
            "hover:text-foreground",
            l.code === current && "text-foreground font-medium",
          )}
        >
          {l.label}
        </button>
      ))}
    </p>
  );
}
