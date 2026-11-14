import { findInvite } from "@jobradar/core/users";
import type { Metadata } from "next";
import Link from "next/link";
import { GuestLanguage } from "@/components/language-select";
import { RadarMark } from "@/components/nav";
import { getT } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { InviteForm } from "./invite-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("invite.title") };
}
export const dynamic = "force-dynamic";

/** Invitation (new account) or password reset link, created from /settings or `cli user`. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvite(getDb(), token);
  const t = await getT();
  return (
    <main className="flex min-h-dvh">
      <div
        className="bg-rail hidden w-[208px] shrink-0 border-r border-rail-border md:block"
        aria-hidden
      />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[320px]">
          <p className="mb-6 flex items-center gap-2 text-sm font-semibold">
            <RadarMark /> JobRadar
          </p>
          {invite ? (
            <>
              <h1 className="mb-1 text-[15px] font-semibold">
                {invite.userId ? t("invite.newPassword") : t("invite.createAccount")}
              </h1>
              <p className="text-muted-foreground mb-5 text-[13px]">{invite.email}</p>
              <InviteForm token={token} reset={invite.userId !== null} />
            </>
          ) : (
            <>
              <p className="mb-3 text-[13px]">{t("invite.invalid")}</p>
              <p className="text-muted-foreground text-[13px]">
                {t("invite.askNew")}{" "}
                <Link href="/login" className="text-foreground underline underline-offset-2">
                  {t("invite.signIn")}
                </Link>
                .
              </p>
            </>
          )}
          <GuestLanguage />
        </div>
      </div>
    </main>
  );
}
