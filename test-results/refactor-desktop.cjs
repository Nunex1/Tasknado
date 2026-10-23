const fs=require('fs');
const file='src/components/app.tsx'; let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
function replace(a,b){if(!s.includes(a))throw Error('Missing anchor '+a.slice(0,100));s=s.replace(a,b);}
replace('usePathname, useRouter','usePathname, useRouter, useSearchParams');
replace('type View = "dashboard" | "activities" | "notes" | "search" | "settings";',`import {routeState,workspacePath,View} from '@/lib/navigation';
import {DesktopShell,workspaceTabs} from './desktop-shell';
import {WorkspaceObservations,WorkspaceHistory} from './workspace-records';
import {WorkspaceDirectory,RecentObservations} from './workspace-overview';
import {quadrant,quadrants} from '@/lib/domain';`);
replace('const isProfile = pathname === "/perfil";',`const isProfile = pathname === "/perfil";
  const {workspaceId,view,activityId,noteId}=routeState(pathname);
  const focusId=useSearchParams().get('focus');
  const [editorWorkspaceId,setEditorWorkspaceId]=useState('');
  const [observationCounts,setObservationCounts]=useState<Record<string,number>>({});
  const [loadError,setLoadError]=useState('');`);
for(const line of ['    [workspaceId, setWorkspaceId] = useState<string | null>(null),\n','    [view, setView] = useState<View>("dashboard"),\n','    [activityId, setActivityId] = useState<string | null>(null),\n','    [noteId, setNoteId] = useState<string | null>(null),\n','    [menu, setMenu] = useState(false),\n'])replace(line,'');
replace('if (ready) setAccount(user?.id ?? null);','if (ready) setAccount(user?.id ?? null,user?.user_metadata?.preferred_language);');
replace('[ready, user?.id, setAccount]','[ready, user?.id, user?.user_metadata?.preferred_language, setAccount]');
replace('"Há uma nota ainda não salva. Aguarde a confirmação ou resolva o erro antes de sair."','"Há alterações não salvas. Salve ou cancele antes de sair."');
const auto=s.indexOf('    setWorkspaceId((id) =>');const autoEnd=s.indexOf('\n  async function allActivities',auto);
s=s.slice(0,auto)+'  }'+s.slice(autoEnd);
replace('async function allActivities(id: string)','async function allActivities(id: string | null)');
replace(`      const rows = check(
        await client()
          .from("activities")
          .select("*")
          .eq("workspace_id", id)
          .order("id")
          .range(offset, offset + 499),
      );`,`      let q=client().from('activities').select('*').order('id').range(offset,offset+499);
      if(id)q=q.eq('workspace_id',id);
      const rows=check(await q);`);
replace('    if (!workspaceId) {','    if (!user) {');
replace('    setLoading(true);\n    try {','    setLoading(true); setLoadError(\'\');\n    try {');
replace('      const [a, n] = await Promise.all([',`      let notesQuery=client().from('notes').select('*').order('updated_at',{ascending:false}).limit(limit);
      if(workspaceId)notesQuery=notesQuery.eq('workspace_id',workspaceId);
      const [a, n, counts] = await Promise.all([`);
replace(`        client()
          .from("notes")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit),`,`        notesQuery,
        client().rpc('observation_counts',{p_workspace:workspaceId}),`);
replace('.eq("workspace_id", workspaceId)\n            .maybeSingle()', '.eq("workspace_id", workspaceId!)\n            .maybeSingle()');
replace('.eq("workspace_id", workspaceId)\n            .maybeSingle()', '.eq("workspace_id", workspaceId!)\n            .maybeSingle()');
replace('        setActivities(aa);',"        setObservationCounts(Object.fromEntries(check(counts).map(r=>[r.activity_id,r.total])));\n        setActivities(aa);");
replace('    } finally {\n      if (seq === loadSeq.current)',"    } catch(e) { if(seq===loadSeq.current)setLoadError(errorMessage(e)); throw e; } finally {\n      if (seq === loadSeq.current)");
replace('        setWorkspaceId(null);\n','');
replace('[workspaceId, limit, activityId, noteId]','[user?.id, workspaceId, limit, activityId, noteId]');
const key=s.indexOf('    const key = (e: KeyboardEvent) =>');const ke=s.indexOf('    window.addEventListener("beforeunload", unload);',key);
s=s.slice(0,key)+s.slice(ke);replace('    window.addEventListener("keydown", key);\n','');replace('      window.removeEventListener("keydown", key);\n','');
const navStart=s.indexOf('  function navigate(next: View)');const navEnd=s.indexOf('  async function save(form:',navStart);
s=s.slice(0,navStart)+`  function go(path:string){if(canLeave())router.push(path);}
  function navigate(next:View){go(workspaceId?workspacePath(workspaceId,next):next==='dashboard'?'/':'/'+next);}
  const setView=navigate;
  function setActivityId(id:string|null){const a=activities.find(a=>a.id===id);go(id?workspacePath(a?.workspace_id||workspaceId!,'activities',id):workspaceId?workspacePath(workspaceId,'activities'):'/activities');}
  function setNoteId(id:string|null){const n=notes.find(n=>n.id===id);go(id?workspacePath(n?.workspace_id||workspaceId!,'notes',id):workspaceId?workspacePath(workspaceId,'notes'):'/notes');}
  function switchWorkspace(id:string){go(workspacePath(id));}
  useEffect(()=>{setLimit(50);setFilter('');setQuery('');setArchived(false);setCanvasFilter('');setScheduleFilter('');setDateFrom('');setDateTo('');setSort('updated_at');},[workspaceId]);
  const editorWorkspace=workspace||workspaces.find(w=>w.id===editorWorkspaceId)||workspaces.find(w=>!w.archived);
`+s.slice(navEnd);
replace('          setWorkspaceId(row.id);','          router.push(workspacePath(row.id));');
replace('      } else if (editor.kind === "activity") {\n        if (!workspaceId)', '      } else if (editor.kind === "activity") {\n        const workspaceId=editorWorkspace?.id;\n        if (!workspaceId)');
replace('          workspace!.category,','          editorWorkspace!.category,');
replace('          setActivityId(row.id);\n          setView("activities");',"          router.push(workspacePath(workspaceId,'activities',row.id));");
replace('      } else {\n        if (!workspaceId)', '      } else {\n        const workspaceId=editorWorkspace?.id;\n        if (!workspaceId)');
replace('          setNoteId(row.id);\n          setView("notes");',"          router.push(workspacePath(workspaceId,'notes',row.id));");
replace('      check(await client().rpc("delete_workspace", { p_workspace: w.id }));','      check(await client().rpc("delete_workspace", { p_workspace: w.id }));\n      if(workspaceId===w.id)router.push(\'/workspaces\');');
replace('        "priority_history",','        "priority_history",\n        "workspace_observations",\n        "workspace_events",');
const resultStart=s.indexOf('  async function openResult(');const resultEnd=s.indexOf('  const shown =',resultStart);
s=s.slice(0,resultStart)+`  function openResult(r: SearchResult) {
    let path=workspacePath(r.workspace_id);
    if(r.kind==='workspace_observation')path=workspacePath(r.workspace_id,'observations')+'?focus='+r.id;
    else if(['activity','event'].includes(r.kind)||(r.kind==='file'&&r.excerpt==='activity'))path=workspacePath(r.workspace_id,'activities',r.parent_id)+(r.kind==='event'?'?focus='+r.id:'');
    else if(r.kind!=='workspace')path=workspacePath(r.workspace_id,'notes',r.parent_id)+(r.kind==='entry'?'?focus='+r.id:'');
    go(path);
  }
`+s.slice(resultEnd);
replace('  const counts = (Object.keys(statuses) as Status[]).map((status) => ({',`  const counts = (['not_started','in_progress'] as Status[]).map((status) => ({`);
const shellStart=s.indexOf('    <div className="app-shell">');const mainStart=s.indexOf('        <main className="main-content" id="main">',shellStart);
s=s.slice(0,shellStart)+`    <DesktopShell user={user} workspaces={workspaces} workspace={workspace} activities={activities} view={view} canLeave={canLeave} go={go} onCreate={()=>setEditor({kind:'workspace'})} onResult={openResult} onSignOut={async()=>{if(!canLeave())return;try{check(await client().auth.signOut());}catch(e){report(errorMessage(e));}}}>
        <main className="main-content" id="main" tabIndex={-1}>
          {workspace && <><div key={workspace.id} className="ocean-transition" aria-hidden="true"><svg viewBox="0 0 1200 80" preserveAspectRatio="none"><path d="M0 40 Q150 0 300 40 T600 40 T900 40 T1200 40 V80 H0Z"/></svg></div><div className="workspace-heading"><div><span className="eyebrow">{t(workspaceCategories[workspace.category])}</span><h1>{workspace.name}</h1>{workspace.description&&<p>{workspace.description}</p>}<small>{t('Última atualização')} · {date(workspace.updated_at)}</small></div><Button variant="ghost" onClick={()=>setEditor({kind:'workspace',item:workspace})}>{t('Editar workspace')}</Button></div><nav className="workspace-tabs" aria-label={t('Abas do Workspace')}>{workspaceTabs.filter(tab=>tab.view!=='matrix'||workspace.category==='work').map(tab=><Link key={tab.view} href={workspacePath(workspace.id,tab.view)} onNavigate={e=>{if(!canLeave())e.preventDefault();}} aria-current={view===tab.view?'page':undefined}>{t(tab.label)}</Link>)}</nav></>}
          {loadError&&<p role="alert" className="error">{t(loadError)} <Button variant="ghost" onClick={()=>void loadContent().catch(e=>report(errorMessage(e)))}>{t('Tentar novamente')}</Button></p>}
`+s.slice(mainStart+'        <main className="main-content" id="main">'.length);
replace('<Profile user={user} />','<Profile key={user.id} user={user} onSaved={setUser} report={report} onDirty={onDirty} />');
replace('                          navigate("dashboard");\n','');
replace('{w.archived ? "· Arquivado" : ""}','{w.archived ? `· ${t("Arquivado")}` : ""}');
replace('          ) : !workspace ? (',`          ) : view==='workspaces' ? (
            <WorkspaceDirectory workspaces={workspaces} onOpen={switchWorkspace} onCreate={()=>setEditor({kind:'workspace'})}/>
          ) : workspaceId && !workspace ? (<p role="status">{t(loading?'Carregando…':'Workspace indisponível.')}</p>
          ) : view==='observations' && workspace ? (<WorkspaceObservations key={workspace.id} workspaceId={workspace.id} focusId={focusId} report={report}/>
          ) : view==='history' && workspace ? (<WorkspaceHistory key={workspace.id} workspaceId={workspace.id} onOpen={setActivityId}/>
          ) : view==='matrix' && workspace ? (workspace.category==='work'?<PriorityMatrix activities={activities} onOpen={setActivityId} onChange={loadContent} report={report}/>:<p>{t('A matriz está disponível na categoria Trabalho.')}</p>
          ) : !workspaces.length ? (`);
replace('              category={workspace.category}','              category={workspace!.category}');
replace('              onBack={() => setActivityId(null)}','              focusId={focusId}\n              onBack={() => setActivityId(null)}');
replace('                      : workspace.name.toUpperCase()', '                      : workspace?.name.toUpperCase() || t("MEU ESPAÇO")');
replace('? t("Seu dia, com mais clareza.")','? workspace ? t("Visão geral") : t("Início")');
replace('<span>{t(statuses[status])}</span>','<span>{t(status===\'not_started\'?\'Atividades em aberto\':\'Em andamento\')}</span>');
replace('                            <Icon size={18} />\n','');
const resumeStart=s.indexOf('                  <section className="resume-banner">');const resumeEnd=s.indexOf('                  </section>',resumeStart);
s=s.slice(0,resumeStart)+s.slice(resumeEnd+'                  </section>'.length);
const matrixStart=s.indexOf('              {workspace.category === "work" && (');const matrixEnd=s.indexOf('              <section className="panel activities-panel">',matrixStart);
s=s.slice(0,matrixStart)+s.slice(matrixEnd);
s=s.replaceAll('workspace.category ===','workspace?.category ===');
replace('                            setActivityId(a.id);\n                            setView("activities");','                            setActivityId(a.id);');
replace('                    <span>{t("STATUS")}</span>','                    <span>{t("STATUS")}</span>\n                    <span>{t("Classificação")}</span>\n                    <span>{t("Criação")}</span>');
replace('                    <span />','                    <span>{t("Observações")}</span>');
replace('                          <time>{date(a.updated_at)}</time>\n                          <ChevronRight size={16} />',`                          <span className="classification">{(workspace||workspaces.find(w=>w.id===a.workspace_id))?.category==='work'?t(quadrants[quadrant(a.category_attributes.work)]).split(' · ').slice(0,2).join(' · '):(workspace||workspaces.find(w=>w.id===a.workspace_id))?.category==='university'?('Canvas: '+t(a.category_attributes.university?.openedInCanvas===true?'Sim':a.category_attributes.university?.openedInCanvas===false?'Não':'Não definida')):'—'}</span>
                          <time title={date(a.created_at)}>{new Intl.DateTimeFormat(locale).format(new Date(a.created_at))}</time>
                          <time title={date(a.updated_at)}>{new Intl.DateTimeFormat(locale).format(new Date(a.updated_at))}</time>
                          <span className="observation-count">{number(observationCounts[a.id]||0)}</span>`);
replace('                          workspace: workspace.name,','                          workspace: workspace?.name || t(\'Todos os workspaces\'),');
const bottomStart=s.indexOf('              <div className="bottom-grid">');const bottomEnd=s.indexOf('            </>\n          )}',bottomStart);
s=s.slice(0,bottomStart)+`              {view==='dashboard'&&<RecentObservations workspaceId={workspaceId} onOpen={openResult}/>}
`+s.slice(bottomEnd);
replace('      </div>\n      {toast && (','      {toast && (');
const end=s.lastIndexOf('    </div>\n  );');s=s.slice(0,end)+s.slice(end).replace('    </div>','    </DesktopShell>');
replace('            {editor.kind !== "note" && (',`            {editor.kind!=='workspace'&&!workspace&&<label>{t('Workspace')}<select value={editorWorkspace?.id||''} required onChange={e=>setEditorWorkspaceId(e.target.value)}>{workspaces.filter(w=>!w.archived).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
            {editor.kind !== "note" && (`);
replace('{editor.kind === "activity" && workspace && (','{editor.kind === "activity" && editorWorkspace && (');
replace('                category={workspace.category}','                category={editorWorkspace.category}');
// Account-wide notebook and search keep the original components and save protocol.
fs.writeFileSync(file,s);
for(const p of ['workspaces/[[...path]]','activities','search','settings','notes']){const dir='src/app/(workspace)/'+p;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/page.tsx','export default function Page() { return null; }\n');}
