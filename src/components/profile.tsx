"use client";
import { useI18n } from "@/i18n/provider";

import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import { userProfile } from "@/lib/user-profile";

export function Profile({ user }: { user: User }) {
  const { t } = useI18n();
  const { name, email, initial } = userProfile(user);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("MINHA CONTA")}</span>
          <h1 ref={heading} tabIndex={-1}>
            {t("Perfil")}
          </h1>
          <p>{t("As informações pessoais associadas à sua conta.")}</p>
        </div>
      </div>
      <section
        className="panel profile-panel"
        aria-labelledby="personal-info-heading"
      >
        <div className="profile-summary">
          <span className="avatar profile-avatar" aria-hidden="true">
            {initial || <UserRound size={28} />}
          </span>
          <div>
            <h2>{name || t("Nome não informado")}</h2>
            <p className="muted">{email || t("E-mail não informado")}</p>
          </div>
        </div>
        <h2 id="personal-info-heading">{t("Informações pessoais")}</h2>
        <dl className="profile-details">
          <div>
            <dt>{t("Nome")}</dt>
            <dd>{name || t("Não informado")}</dd>
          </div>
          <div>
            <dt>{t("E-mail")}</dt>
            <dd>{email || t("Não informado")}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
