// Demonstration content for the landing page screenshots. It is written
// through the public API as an ordinary signed-in user, so every row passes
// the same RLS policies and functions as real usage.
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const day = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const work = (isUrgent, isImportant, offset = null, time = null) => ({
  work: {
    hasScheduledDate: offset !== null,
    scheduledDate: offset === null ? null : day(offset),
    scheduledTime: time,
    isUrgent,
    isImportant,
  },
});

const copy = {
  "pt-BR": {
    name: "Marina Costa",
    workspaces: [
      {
        key: "work",
        name: "Lançamento do app",
        category: "work",
        icon: "briefcase",
        description: "Entregas do produto até o lançamento de dezembro.",
      },
      {
        key: "university",
        name: "Faculdade",
        category: "university",
        icon: "book",
        description: "Disciplinas e entregas do semestre.",
      },
      {
        key: "study",
        name: "Estudos de design",
        category: "self_study",
        icon: "code",
        description: "Tipografia, cor e sistemas de interface.",
      },
      {
        key: "personal",
        name: "Vida pessoal",
        category: "personal_life",
        icon: "folder",
        description: "Casa, saúde e compromissos.",
      },
    ],
    activities: [
      {
        key: "signup",
        workspace: "work",
        title: "Revisar fluxo de cadastro",
        description: "Validar formulário, e-mail de confirmação e erros.",
        attributes: work(true, true, -1, "18:00"),
        events: [
          [
            "check_in",
            "Comecei pelo formulário: validações de e-mail revisadas.",
          ],
          ["observation", "A máscara do telefone quebra em telas pequenas."],
          ["pause", "Parei na confirmação. Falta testar o link expirado."],
          ["resume", "Retomando pelos testes do link de confirmação."],
        ],
      },
      {
        workspace: "work",
        title: "Preparar roteiro da demonstração",
        description: "Sequência de telas para a apresentação de quinta.",
        attributes: work(true, true, 2, "14:00"),
      },
      {
        workspace: "work",
        title: "Definir métricas do trimestre",
        description: "Ativação, retenção e tempo até a primeira tarefa.",
        attributes: work(false, true, 7),
        events: [
          ["check_in", "Levantei as métricas usadas no trimestre passado."],
          ["pause", "Aguardando os números de retenção."],
        ],
      },
      {
        workspace: "work",
        title: "Planejar pesquisa com usuários",
        description: "Cinco entrevistas com quem usa listas de tarefas.",
        attributes: work(false, true, 12),
      },
      {
        workspace: "work",
        title: "Responder fornecedores",
        description: "Propostas de hospedagem e e-mail transacional.",
        attributes: work(true, false),
      },
      {
        workspace: "work",
        title: "Organizar referências antigas",
        description: "",
        attributes: work(false, false),
      },
      {
        workspace: "work",
        title: "Publicar notas da versão 1.2",
        description: "Resumo das mudanças para quem já usa o app.",
        attributes: work(false, true),
        events: [
          ["check_in", "Rascunho escrito a partir do histórico."],
          ["check_out", "Publicado e enviado para a lista."],
        ],
      },
      {
        workspace: "work",
        title: "Mapear riscos do lançamento",
        description: "",
        attributes: {},
      },
      {
        workspace: "university",
        title: "Entregar resenha de Metodologia",
        description: "Capítulos 3 e 4, até duas páginas.",
        attributes: { university: { openedInCanvas: true } },
        events: [["check_in", "Leitura do capítulo 3 concluída."]],
      },
      {
        workspace: "university",
        title: "Estudar para a prova de Estatística",
        description: "Distribuições e testes de hipótese.",
        attributes: { university: { openedInCanvas: false } },
      },
      {
        workspace: "personal",
        title: "Renovar passaporte",
        description: "Separar documentos e agendar atendimento.",
        attributes: {},
      },
    ],
    observations: [
      "Decisão: lançar primeiro para a lista de espera.",
      "Reunião de alinhamento movida para quinta-feira, 10h.",
    ],
    note: {
      title: "Ideias para o onboarding",
      entries: [
        "Primeira tela: pedir só o nome do workspace e a categoria.\nMostrar um exemplo de tarefa já com Check In, para ensinar o gesto principal.",
        "Mensagem de boas-vindas curta. Nada de tour com cinco passos.\nReferência: https://example.com/onboarding",
      ],
    },
  },
  "en-US": {
    name: "Marina Costa",
    workspaces: [
      {
        key: "work",
        name: "App launch",
        category: "work",
        icon: "briefcase",
        description: "Product deliveries until the December launch.",
      },
      {
        key: "university",
        name: "University",
        category: "university",
        icon: "book",
        description: "Courses and assignments this semester.",
      },
      {
        key: "study",
        name: "Design studies",
        category: "self_study",
        icon: "code",
        description: "Typography, color, and interface systems.",
      },
      {
        key: "personal",
        name: "Personal life",
        category: "personal_life",
        icon: "folder",
        description: "Home, health, and appointments.",
      },
    ],
    activities: [
      {
        key: "signup",
        workspace: "work",
        title: "Review the sign-up flow",
        description: "Validate the form, confirmation email, and errors.",
        attributes: work(true, true, -1, "18:00"),
        events: [
          ["check_in", "Started with the form: email validation reviewed."],
          ["observation", "The phone mask breaks on small screens."],
          ["pause", "Stopped at confirmation. Expired link still untested."],
          ["resume", "Resuming with the confirmation link tests."],
        ],
      },
      {
        workspace: "work",
        title: "Prepare the demo script",
        description: "Screen sequence for Thursday's presentation.",
        attributes: work(true, true, 2, "14:00"),
      },
      {
        workspace: "work",
        title: "Define quarterly metrics",
        description: "Activation, retention, and time to first task.",
        attributes: work(false, true, 7),
        events: [
          ["check_in", "Collected the metrics used last quarter."],
          ["pause", "Waiting for the retention numbers."],
        ],
      },
      {
        workspace: "work",
        title: "Plan user research",
        description: "Five interviews with people who use task lists.",
        attributes: work(false, true, 12),
      },
      {
        workspace: "work",
        title: "Reply to vendors",
        description: "Hosting and transactional email proposals.",
        attributes: work(true, false),
      },
      {
        workspace: "work",
        title: "Tidy up old references",
        description: "",
        attributes: work(false, false),
      },
      {
        workspace: "work",
        title: "Publish the 1.2 release notes",
        description: "Summary of changes for existing users.",
        attributes: work(false, true),
        events: [
          ["check_in", "Draft written from the history."],
          ["check_out", "Published and sent to the list."],
        ],
      },
      {
        workspace: "work",
        title: "Map launch risks",
        description: "",
        attributes: {},
      },
      {
        workspace: "university",
        title: "Submit the Methodology review",
        description: "Chapters 3 and 4, up to two pages.",
        attributes: { university: { openedInCanvas: true } },
        events: [["check_in", "Finished reading chapter 3."]],
      },
      {
        workspace: "university",
        title: "Study for the Statistics exam",
        description: "Distributions and hypothesis tests.",
        attributes: { university: { openedInCanvas: false } },
      },
      {
        workspace: "personal",
        title: "Renew passport",
        description: "Gather documents and book an appointment.",
        attributes: {},
      },
    ],
    observations: [
      "Decision: launch to the waiting list first.",
      "Alignment meeting moved to Thursday, 10 am.",
    ],
    note: {
      title: "Onboarding ideas",
      entries: [
        "First screen: ask only for the workspace name and category.\nShow a sample task that already has a Check In, to teach the main gesture.",
        "Keep the welcome message short. No five-step tour.\nReference: https://example.com/onboarding",
      ],
    },
  },
};

export function demoName(locale) {
  return copy[locale].name;
}

/** Creates the demonstration records for the signed-in `api` client. */
export async function seedDemo(api, locale) {
  const data = copy[locale];
  const workspaces = {};
  for (const { key, ...values } of data.workspaces)
    workspaces[key] = ok(
      await api.from("workspaces").insert(values).select().single(),
    );
  const activities = {};
  for (const item of data.activities) {
    const row = ok(
      await api
        .from("activities")
        .insert({
          title: item.title,
          description: item.description,
          workspace_id: workspaces[item.workspace].id,
          category_attributes: item.attributes,
        })
        .select()
        .single(),
    );
    if (item.key) activities[item.key] = row;
    for (const [type, content] of item.events || [])
      ok(
        await api.rpc("add_event", {
          p_activity: row.id,
          p_type: type,
          p_content: content,
          p_request: crypto.randomUUID(),
        }),
      );
  }
  for (const content of data.observations)
    ok(
      await api
        .from("workspace_observations")
        .insert({ workspace_id: workspaces.work.id, content }),
    );
  const note = ok(
    await api
      .from("notes")
      .insert({ title: data.note.title, workspace_id: workspaces.work.id })
      .select()
      .single(),
  );
  for (const content of data.note.entries) {
    const entry = ok(
      await api
        .from("note_entries")
        .insert({ note_id: note.id })
        .select()
        .single(),
    );
    ok(
      await api.rpc("save_entry", {
        p_id: entry.id,
        p_content: content,
        p_revision: entry.revision,
      }),
    );
  }
  return { workspaces, activities, note };
}
