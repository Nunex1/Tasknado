const fs=require('fs');
const translations={
 'Editar perfil':'Edit Profile','Personalize como você aparece no seu espaço.':'Personalize how you appear in your space.',
 'Apelido':'Nickname','Inicial do avatar':'Avatar Initial','Cor do avatar':'Avatar Color','Prévia do avatar':'Avatar preview','Prévia. As alterações são aplicadas ao salvar.':'Preview. Changes take effect when you save.',
 'Uma letra. Deixe vazio para usar a inicial do apelido ou nome.':'One letter. Leave blank to use your nickname or name initial.',
 'Escolha uma única letra para o avatar.':'Choose a single letter for your avatar.','Usar cor {{color}}':'Use color {{color}}','Cor personalizada':'Custom color','Salvar alterações':'Save changes',
 'Preferência sincronizada com sua conta.':'Preference synced with your account.',
 'Não foi possível sincronizar o idioma. Tente novamente nas configurações.':'Could not sync the language. Try again in settings.',
 'Ir para o conteúdo':'Skip to content','Navegação principal':'Main navigation','Início':'Home','Workspaces':'Workspaces','Pesquisar':'Search','Mais':'More',
 'Expandir painel':'Expand panel','Recolher painel':'Collapse panel','Contexto do Workspace':'Workspace context','Navegação do Workspace':'Workspace navigation','Abas do Workspace':'Workspace tabs','Conteúdos recentes':'Recent content',
 'Observações':'Observations','Histórico':'History','Classificação':'Classification','Atividades em aberto':'Open Activities','Todos os workspaces':'All workspaces','Arquivado':'Archived',
 'Observações gerais':'Workspace observations','Observações e acontecimentos':'Observations and events','Limpar pesquisa':'Clear search','Resultados':'Results','Resultados da pesquisa':'Search results',
 'Registros do Workspace, independentes das atividades.':'Workspace records, separate from activities.',
 'Nova observação':'New observation','Registrar observação':'Add observation','Pesquisar observações':'Search observations','Nenhuma observação encontrada.':'No observations found.','Carregando…':'Loading…',
 'Histórico operacional':'Operational history','Eventos persistidos, do mais recente ao mais antigo.':'Saved events, from newest to oldest.','Nenhum evento registrado.':'No events recorded.',
 'Atividade criada':'Activity created','Status alterado':'Status changed','Observação criada':'Observation created','Observação editada':'Observation edited','Observação excluída':'Observation deleted','Agendamento alterado':'Schedule changed','Prioridade alterada':'Priority changed',
 'Um lugar para cada parte da sua vida.':'A place for every part of your life.','Pesquisar workspaces':'Search workspaces','Nenhum workspace encontrado.':'No workspaces found.','Crie um workspace para organizar suas atividades.':'Create a workspace to organize your activities.',
 'Últimas observações gerais':'Latest workspace observations','As observações dos seus Workspaces aparecerão aqui.':'Your workspace observations will appear here.',
 'Há alterações não salvas. Salve ou cancele antes de sair.':'There are unsaved changes. Save or cancel before leaving.',
 'A matriz está disponível na categoria Trabalho.':'The matrix is available in Work workspaces.',
 'Atualizações recentes':'Recent updates',
 'Ctrl / ⌘ K':'Ctrl / ⌘ K',
 'Conflito ao salvar. Recarregue o registro e tente novamente.':'Save conflict. Reload the record and try again.'
};
for(const locale of ['pt-BR','en-US']){const f='src/i18n/'+locale+'.json',obj=JSON.parse(fs.readFileSync(f));for(const [key,value] of Object.entries(translations))obj[key]=locale==='pt-BR'?key:value;fs.writeFileSync(f,JSON.stringify(obj,null,2)+'\n');}
// Remove the old phone-specific layouts; desktop zoom has its own bounded rules.
for(const f of ['src/app/globals.css','src/app/ocean.css']){let css=fs.readFileSync(f,'utf8');let index=0;while((index=css.indexOf('@media (max-width:',index))!==-1){let start=css.indexOf('{',index),depth=1,end=start+1;while(depth&&end<css.length){if(css[end]==='{')depth++;if(css[end]==='}')depth--;end++;}css=css.slice(0,index)+css.slice(end);}css=css.replace(/\.mobile-menu\s*\{[^}]*\}/g,'');fs.writeFileSync(f,css);}
let app=fs.readFileSync('src/components/app.tsx','utf8');
app=app.replace('<span className="count">{number(shown.length)}</span>','{view!=="dashboard"&&<span className="count">{number(shown.length)}</span>}');
const first=app.indexOf('                <div className="list-toolbar">');const last=app.indexOf('                <div className="activity-table">',first);app=app.slice(0,first)+'                {view!=="dashboard"&&<>\n'+app.slice(first,last)+'                </>}\n'+app.slice(last);
app=app.replace(': t("taskCount", {',': view==="dashboard"?t("Atualizações recentes"): t("taskCount", {');
fs.writeFileSync('src/components/app.tsx',app);
let search=fs.readFileSync('src/components/header-search.tsx','utf8').replace('<kbd>Ctrl / ⌘ K</kbd>',"<kbd>{t('Ctrl / ⌘ K')}</kbd>");fs.writeFileSync('src/components/header-search.tsx',search);
let records=fs.readFileSync('src/components/workspace-records.tsx','utf8').replaceAll("throw Error('Conflict')","throw Error('Conflito ao salvar. Recarregue o registro e tente novamente.')");fs.writeFileSync('src/components/workspace-records.tsx',records);
let tests=fs.readFileSync('src/lib/user-profile.test.ts','utf8').replaceAll(').toEqual({',').toMatchObject({');fs.writeFileSync('src/lib/user-profile.test.ts',tests);
let i18n=fs.readFileSync('src/i18n/i18n.test.ts','utf8').replace('      "⌘ K",','      "⌘ K",\n      "PT",\n      "EN",');fs.writeFileSync('src/i18n/i18n.test.ts',i18n);
