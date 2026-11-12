"use client";
import Image from "next/image";
import {
  Check,
  FileDown,
  Folder,
  Globe,
  Grid2x2,
  History,
  ListTodo,
  NotebookPen,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useTheme } from "@/lib/theme-provider";
import { BrandLogo } from "./brand";
import { ThemeControl } from "./theme";
import { shots, type ShotName } from "./landing-shots";

type Access = (mode: "login" | "signup") => void;

const features: {
  icon: typeof Folder;
  shot: ShotName;
  title: string;
  body: string;
  alt: string;
  points: string[];
}[] = [
  {
    icon: ListTodo,
    shot: "task",
    title: "Cada tarefa com começo, pausa e conclusão.",
    body: "Registre Check In, pausas e Check Out. O status acompanha o que você faz, e a linha do tempo guarda o porquê.",
    alt: "Linha do tempo de uma tarefa com Check In, pausa e observações",
    points: [
      "Filtros por status, busca e ordenação",
      "Observações editáveis em cada tarefa",
      "Arquive o que terminou sem perder o registro",
    ],
  },
  {
    icon: Folder,
    shot: "workspaces",
    title: "Um workspace para cada frente.",
    body: "Separe trabalho, faculdade, estudos, esporte e vida pessoal. Cada workspace tem suas tarefas, notas, observações e histórico.",
    alt: "Lista de workspaces por categoria",
    points: [
      "Categorias com campos próprios para Trabalho e Faculdade",
      "Arquive ou exclua quando quiser",
    ],
  },
  {
    icon: Grid2x2,
    shot: "matrix",
    title: "Saiba o que fazer primeiro.",
    body: "Nos workspaces de Trabalho, a Matriz de Eisenhower distribui as tarefas por urgência e importância. Arraste entre quadrantes ou use o teclado.",
    alt: "Matriz de Eisenhower com quatro quadrantes",
    points: [
      "Quatro quadrantes identificados por texto e cor",
      "Datas programadas e alerta de atraso",
      "Histórico de mudanças de prioridade",
    ],
  },
  {
    icon: NotebookPen,
    shot: "notes",
    title: "Ideias guardadas ao lado do trabalho.",
    body: "Escreva em blocos que salvam sozinhos. Anexe arquivos e encontre tudo depois pela busca.",
    alt: "Nota com blocos de texto e arquivos anexados",
    points: [
      "Salvamento automático com aviso de conflito",
      "Arquivos privados de até 20 MB",
    ],
  },
  {
    icon: History,
    shot: "history",
    title: "Retome de onde parou.",
    body: "O histórico operacional mostra o que mudou em cada workspace: tarefas criadas, status, prioridades e observações.",
    alt: "Histórico operacional de um workspace",
    points: [
      "Eventos de execução permanentes",
      "Busca global em tarefas, notas e arquivos",
    ],
  },
];

const privacy = [
  {
    icon: ShieldCheck,
    title: "Dados isolados por conta",
    body: "Cada registro pertence à sua conta e só ela pode lê-lo.",
  },
  {
    icon: FileDown,
    title: "Exportação em JSON",
    body: "Leve seus registros com você quando quiser.",
  },
  {
    icon: UserX,
    title: "Exclusão sob seu controle",
    body: "Exclua workspaces ou a conta inteira pelas configurações.",
  },
];

function Shot({
  name,
  alt,
  eager = false,
  sizes,
}: {
  name: ShotName;
  alt: string;
  eager?: boolean;
  sizes: string;
}) {
  const { locale } = useI18n();
  const { resolved } = useTheme();
  const image = shots[name][resolved][locale];
  return (
    <figure className="shot">
      <Image
        src={image}
        alt={alt}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
      />
    </figure>
  );
}

/** Public page shown to signed-out visitors; `children` is the access card. */
export function Landing({
  onAccess,
  children,
}: {
  onAccess: Access;
  children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="public">
      <a href="#main" className="skip-link">
        {t("Ir para o conteúdo")}
      </a>
      <header className="public-header">
        <div className="public-container">
          <BrandLogo size="sm" tone="blue" />
          <nav className="public-nav" aria-label={t("Seções da página")}>
            <a href="#funcionalidades">{t("Funcionalidades")}</a>
            <a href="#privacidade">{t("Privacidade")}</a>
          </nav>
          <div className="public-actions">
            <label className="header-language">
              <Globe size={16} aria-hidden="true" />
              <select
                aria-label={t("Idioma da interface")}
                value={locale}
                onChange={(e) => setLocale(e.target.value as "pt-BR" | "en-US")}
              >
                <option value="pt-BR">PT</option>
                <option value="en-US">EN</option>
              </select>
            </label>
            <a
              href="#acesso"
              className="public-link"
              onClick={() => onAccess("login")}
            >
              {t("Entrar")}
            </a>
            <a
              href="#acesso"
              className="button primary"
              onClick={() => onAccess("signup")}
            >
              {t("Criar conta")}
            </a>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="hero">
          <div className="public-container">
            <div className="hero-copy">
              <span className="hero-kicker">
                {t("Clareza. Precisão. Produtividade.")}
              </span>
              <h1>
                {t("Menos caos.")}
                <br />
                <em>{t("Mais execução.")}</em>
              </h1>
              <p className="hero-lead">
                {t(
                  "Organize suas tarefas, estabeleça prioridades e transforme planejamento em resultados.",
                )}
              </p>
              <ul className="hero-points">
                {[
                  "Workspaces privados para cada área da sua vida",
                  "Prioridades claras com a Matriz de Eisenhower",
                  "Histórico completo de cada tarefa",
                ].map((point) => (
                  <li key={point}>
                    <Check size={20} aria-hidden="true" />
                    {t(point)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hero-access" id="acesso">
              {children}
            </div>
          </div>
        </section>
        <section
          className="showcase"
          aria-label={t("Demonstração do aplicativo")}
        >
          <div className="public-container">
            <Shot
              name="overview"
              eager
              sizes="(max-width: 1240px) 94vw, 1160px"
              alt={t(
                "Visão geral do Tasknado: indicadores, prioridades e atividades recentes",
              )}
            />
            <p className="showcase-note">
              {t("Capturas reais do aplicativo, com dados de demonstração.")}
            </p>
          </div>
        </section>
        <section
          className="features"
          id="funcionalidades"
          aria-labelledby="features-title"
        >
          <div className="public-container">
            <div className="section-intro">
              <h2 id="features-title">
                {t("Do planejamento ao resultado, sem perder o contexto.")}
              </h2>
              <p>
                {t(
                  "Cada parte do Tasknado existe para responder a uma pergunta: o que fazer agora?",
                )}
              </p>
            </div>
            {features.map(({ icon: Icon, ...feature }) => (
              <article className="feature" key={feature.shot}>
                <div className="feature-copy">
                  <span className="feature-icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <h3>{t(feature.title)}</h3>
                  <p>{t(feature.body)}</p>
                  <ul className="feature-list">
                    {feature.points.map((point) => (
                      <li key={point}>
                        <Check size={16} aria-hidden="true" />
                        {t(point)}
                      </li>
                    ))}
                  </ul>
                </div>
                <Shot
                  name={feature.shot}
                  alt={t(feature.alt)}
                  sizes="(max-width: 959px) 94vw, 660px"
                />
              </article>
            ))}
          </div>
        </section>
        <section
          className="privacy-band"
          id="privacidade"
          aria-labelledby="privacy-title"
        >
          <div className="public-container">
            <div className="section-intro">
              <h2 id="privacy-title">{t("Seu espaço é só seu.")}</h2>
              <p>
                {t(
                  "O Tasknado é pessoal: não há equipes, feeds nem compartilhamento.",
                )}
              </p>
            </div>
            <ul className="privacy-grid">
              {privacy.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <Icon size={24} aria-hidden="true" />
                  <h3>{t(title)}</h3>
                  <p>{t(body)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="closing" aria-labelledby="closing-title">
          <div className="public-container">
            <h2 id="closing-title">{t("Comece pelo que importa hoje.")}</h2>
            <p>{t("Crie sua conta e monte seu primeiro workspace.")}</p>
            <div className="closing-actions">
              <a
                href="#acesso"
                className="button primary large"
                onClick={() => onAccess("signup")}
              >
                {t("Criar conta")}
              </a>
              <a
                href="#acesso"
                className="button secondary large"
                onClick={() => onAccess("login")}
              >
                {t("Já tenho conta")}
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <div className="public-container">
          <div className="public-footer-brand">
            <BrandLogo size="sm" tone="blue" />
            <p>{t("Clareza. Precisão. Produtividade.")}</p>
          </div>
          <nav aria-label={t("Rodapé")}>
            <a href="#funcionalidades" className="public-link">
              {t("Funcionalidades")}
            </a>
            <a href="#privacidade" className="public-link">
              {t("Privacidade")}
            </a>
            <a
              href="#acesso"
              className="public-link"
              onClick={() => onAccess("login")}
            >
              {t("Entrar")}
            </a>
          </nav>
          <ThemeControl name="theme-landing" />
        </div>
      </footer>
    </div>
  );
}
