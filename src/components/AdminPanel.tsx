import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Folder, ListTodo, Users, Trash2, Pencil, Plus, Camera, Activity, Clock, CheckCircle2, Building2, Save, X, Shield, FileText } from "lucide-react";
import { format } from "date-fns";
import CategorySelect from "@/components/CategorySelect";

const PROJECT_COLORS = ["#A855F7","#3B82F6","#10B981","#F97316","#EF4444","#EC4899","#06B6D4","#F59E0B"];
const ROLES = ["admin","user"];
const ROLES = ["admin","user"];

const fmtT = (s:number) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtHM = (s:number) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };

const AdminPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [editingProjectId, setEditingProjectId] = useState<string|null>(null);
  const [editProjectName, setEditProjectName] = useState("");

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("Other");
  const [newTaskProjectId, setNewTaskProjectId] = useState("none");
  const [newTaskScope, setNewTaskScope] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string|null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskCategory, setEditTaskCategory] = useState("Other");
  const [editTaskProject, setEditTaskProject] = useState("none");
  const [editTaskScope, setEditTaskScope] = useState("");

  // Department tab editing
  const [editingDeptUserId, setEditingDeptUserId] = useState<string|null>(null);
  const [editName, setEditName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  const [editingRoleId, setEditingRoleId] = useState<string|null>(null);
  const [editRole, setEditRole] = useState("user");
  const [selectedUserId, setSelectedUserId] = useState("none");
  const [screenshotVal, setScreenshotVal] = useState("600");
  const [now, setNow] = useState(Date.now());
  const [dtrDate, setDtrDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => { const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[]);

  const { data: allProjects=[] } = useQuery({ queryKey:["admin_projects"], queryFn:async()=>{ const {data,error}=await supabase.from("projects").select("*").order("created_at",{ascending:false}); if(error) throw error; return data; }, enabled:!!user });
  const { data: allTasks=[] } = useQuery({ queryKey:["admin_tasks"], queryFn:async()=>{ const {data,error}=await supabase.from("tasks").select("*, projects(name)").order("created_at",{ascending:false}); if(error) throw error; return data; }, enabled:!!user });
  const { data: allProfiles=[] } = useQuery({ queryKey:["admin_profiles"], queryFn:async()=>{ const {data,error}=await supabase.from("profiles").select("*").order("created_at",{ascending:false}); if(error) throw error; return data; }, enabled:!!user });
  const { data: allRoles=[] } = useQuery({ queryKey:["admin_roles"], queryFn:async()=>{ const {data}=await supabase.from("user_roles").select("*"); return data||[]; }, enabled:!!user });
  const { data: memberStats={} } = useQuery({ queryKey:["admin_member_stats"], queryFn:async()=>{ const {data}=await supabase.from("time_entries").select("user_id,duration_seconds,start_time"); const stats:Record<string,any>={}; const tod=new Date().toDateString(); for(const e of data||[]){ if(!stats[e.user_id]) stats[e.user_id]={total:0,today:0,sessions:0}; stats[e.user_id].total+=e.duration_seconds||0; stats[e.user_id].sessions+=1; if(new Date(e.start_time).toDateString()===tod) stats[e.user_id].today+=e.duration_seconds||0; } return stats; }, enabled:!!user, refetchInterval:30000 });
  const { data: activeTimers=[] } = useQuery({ queryKey:["admin_active_timers"], queryFn:async()=>{ const {data}=await supabase.from("active_timers").select("*,tasks(name),projects(name)"); return data||[]; }, enabled:!!user, refetchInterval:5000 });
  const { data: allAttendance=[] } = useQuery({ queryKey:["admin_attendance"], queryFn:async()=>{ const {data}=await supabase.from("attendance").select("*"); return data||[]; }, enabled:!!user, refetchInterval:5000 });
  const { data: dtrLogs=[] } = useQuery({ queryKey:["admin_dtr", dtrDate], queryFn:async()=>{ const {data}=await supabase.from("dtr_log").select("*, profiles!dtr_log_user_id_fkey(display_name)").eq("date",dtrDate).order("time_in",{ascending:true}); return data||[]; }, enabled:!!user });

  useEffect(() => {
    const ch = supabase.channel("admin-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"active_timers"},()=>qc.invalidateQueries({queryKey:["admin_active_timers"]}))
      .on("postgres_changes",{event:"*",schema:"public",table:"attendance"},()=>qc.invalidateQueries({queryKey:["admin_attendance"]}))
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[qc]);

  const timerMap:Record<string,any>={};
  for(const t of activeTimers as any[]) timerMap[t.user_id]=t;
  const attMap:Record<string,any>={};
  for(const a of allAttendance as any[]) attMap[a.user_id]=a;

  const getRoleForUser=(uid:string)=>(allRoles as any[]).find(r=>r.user_id===uid)?.role||"user";
  const departments=Array.from(new Set((allProfiles as any[]).map((p:any)=>p.department||"Unassigned"))).sort() as string[];

  // Mutations
  const createProject = useMutation({ mutationFn:async()=>{ const tid=(allProfiles[0] as any)?.user_id||user!.id; const {error}=await supabase.from("projects").insert({user_id:tid,name:newProjectName,color:newProjectColor}); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_projects"]}); qc.invalidateQueries({queryKey:["projects"]}); setNewProjectName(""); toast({title:"Project created"}); }, onError:(e:any)=>toast({title:"Error",description:e.message,variant:"destructive"}) });
  const updateProject = useMutation({ mutationFn:async({id,name}:{id:string;name:string})=>{ const {error}=await supabase.from("projects").update({name}).eq("id",id); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_projects"]}); qc.invalidateQueries({queryKey:["projects"]}); setEditingProjectId(null); toast({title:"Updated"}); } });
  const deleteProject = useMutation({ mutationFn:async(id:string)=>{ const {error}=await supabase.from("projects").delete().eq("id",id); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_projects"]}); qc.invalidateQueries({queryKey:["projects"]}); toast({title:"Deleted"}); } });

  const createTask = useMutation({ mutationFn:async()=>{ const tid=(allProfiles[0] as any)?.user_id||user!.id; const {error}=await supabase.from("tasks").insert({user_id:tid,name:newTaskName,category:newTaskCategory,project_id:newTaskProjectId==="none"?null:newTaskProjectId,scope:newTaskScope||null}); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_tasks"]}); qc.invalidateQueries({queryKey:["tasks"]}); setNewTaskName(""); setNewTaskScope(""); toast({title:"Task created"}); }, onError:(e:any)=>toast({title:"Error",description:e.message,variant:"destructive"}) });
  const updateTask = useMutation({ mutationFn:async({id,name,category,projectId,scope}:{id:string;name:string;category:string;projectId:string;scope:string})=>{ const {error}=await supabase.from("tasks").update({name,category,project_id:projectId==="none"?null:projectId,scope:scope||null}).eq("id",id); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_tasks"]}); qc.invalidateQueries({queryKey:["tasks"]}); setEditingTaskId(null); toast({title:"Task updated"}); } });
  const deleteTask = useMutation({ mutationFn:async(id:string)=>{ const {error}=await supabase.from("tasks").delete().eq("id",id); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_tasks"]}); qc.invalidateQueries({queryKey:["tasks"]}); toast({title:"Deleted"}); } });

  const updateMemberProfile = useMutation({ mutationFn:async({userId,name,jobTitle,department}:{userId:string;name:string;jobTitle:string;department:string})=>{ const {error}=await supabase.from("profiles").update({display_name:name,job_title:jobTitle,department}).eq("user_id",userId); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_profiles"]}); qc.invalidateQueries({queryKey:["profiles"]}); qc.invalidateQueries({queryKey:["profile"]}); setEditingDeptUserId(null); toast({title:"Profile updated"}); }, onError:(e:any)=>toast({title:"Error",description:e.message,variant:"destructive"}) });
  const updateUserRole = useMutation({ mutationFn:async({userId,role}:{userId:string;role:string})=>{ const {error:delErr}=await supabase.from("user_roles").delete().eq("user_id",userId); if(delErr) throw delErr; const {error:insErr}=await supabase.from("user_roles").insert({user_id:userId,role:role as "admin" | "user"}); if(insErr) throw insErr; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_roles"]}); qc.invalidateQueries({queryKey:["user_role"]}); setEditingRoleId(null); toast({title:"Role updated"}); }, onError:(e:any)=>toast({title:"Error",description:e.message,variant:"destructive"}) });
  const updateScreenshot = useMutation({ mutationFn:async({userId,interval}:{userId:string;interval:number})=>{ const {error}=await supabase.from("profiles").update({screenshot_interval:interval}).eq("user_id",userId); if(error) throw error; }, onSuccess:()=>{ qc.invalidateQueries({queryKey:["admin_profiles"]}); toast({title:"Screenshot interval saved!"}); }, onError:(e:any)=>toast({title:"Error",description:e.message,variant:"destructive"}) });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> Admin Dashboard</h2>

      <Tabs defaultValue="departments">
        <TabsList className="bg-secondary mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="departments" className="gap-1 text-xs"><Building2 className="h-3 w-3" /> Departments</TabsTrigger>
          <TabsTrigger value="live" className="gap-1 text-xs"><Activity className="h-3 w-3" /> Live</TabsTrigger>
          <TabsTrigger value="dtr" className="gap-1 text-xs"><FileText className="h-3 w-3" /> DTR</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1 text-xs"><Shield className="h-3 w-3" /> Roles</TabsTrigger>
          <TabsTrigger value="projects" className="gap-1 text-xs"><Folder className="h-3 w-3" /> Projects</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1 text-xs"><ListTodo className="h-3 w-3" /> Tasks</TabsTrigger>
          <TabsTrigger value="screenshots" className="gap-1 text-xs"><Camera className="h-3 w-3" /> Screenshots</TabsTrigger>
        </TabsList>

        {/* ── DEPARTMENTS TAB ── */}
        <TabsContent value="departments" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[{label:"Total members",value:(allProfiles as any[]).length},{label:"Online now",value:(allAttendance as any[]).length},{label:"Departments",value:departments.filter(d=>d!=="Unassigned").length},{label:"Tracking",value:(activeTimers as any[]).filter((t:any)=>t.mode==="work").length}].map(({label,value})=>(
              <div key={label} className="glass-card p-3 text-center"><p className="text-xs text-muted-foreground mb-1">{label}</p><p className="text-2xl font-bold text-primary">{value}</p></div>
            ))}
          </div>

          {departments.map(dept=>{
            const members=(allProfiles as any[]).filter((p:any)=>(p.department||"Unassigned")===dept);
            return (
              <div key={dept} className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">{dept}</h3><span className="text-xs text-muted-foreground">({members.length})</span></div>
                {members.map((p:any)=>{
                  const stats=(memberStats as any)[p.user_id]||{total:0,today:0,sessions:0};
                  const timer=timerMap[p.user_id];
                  const isEditing=editingDeptUserId===p.user_id;
                  const liveEl=timer?Math.floor((now-new Date(timer.started_at).getTime())/1000):0;
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 ${timer?"border-primary/30 bg-accent/20":"border-border bg-secondary/40"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${!attMap[p.user_id]?"bg-muted-foreground/40":timer?"bg-green-500 animate-pulse":"bg-yellow-400"}`} />
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <Input placeholder="Display name" value={editName} onChange={e=>setEditName(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <Input placeholder="Job title" value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <Input placeholder="Department" value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} className="bg-card border-border text-xs h-7" />
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-xs gradient-primary px-2" onClick={()=>updateMemberProfile.mutate({userId:p.user_id,name:editName,jobTitle:editJobTitle,department:editDepartment})}><Save className="h-3 w-3 mr-1" />Save</Button>
                                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={()=>setEditingDeptUserId(null)}><X className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-medium text-foreground">{p.display_name||"Unnamed"}</p>
                                <p className="text-xs text-muted-foreground">{p.job_title||<span className="italic">No title</span>}</p>
                                <p className="text-xs text-muted-foreground">{p.department||<span className="italic">No dept</span>}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
                          <div className="text-right space-y-0.5">
                            <div className="flex items-center gap-1 justify-end"><Clock className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">Today: <span className="text-foreground font-medium">{fmtHM(stats.today)}</span></span></div>
                            <div className="flex items-center gap-1 justify-end"><Activity className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total: <span className="text-foreground font-medium">{fmtHM(stats.total)}</span></span></div>
                            <div className="flex items-center gap-1 justify-end"><CheckCircle2 className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">Sessions: <span className="text-foreground font-medium">{stats.sessions}</span></span></div>
                            {timer && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">● {fmtT(liveEl)}</span>}
                          </div>
                          {!isEditing && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={()=>{ setEditingDeptUserId(p.user_id); setEditName(p.display_name||""); setEditJobTitle(p.job_title||""); setEditDepartment(p.department||""); }}><Pencil className="h-3 w-3" /></Button>}
                        </div>
                      </div>
                      {timer && <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" /><span className="text-xs text-primary">{(timer.tasks as any)?.name||"Working"}{(timer.projects as any)?.name?` — ${(timer.projects as any).name}`:""}</span></div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </TabsContent>

        {/* ── LIVE TAB ── */}
        <TabsContent value="live" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Live Tracking</h3>
              <span className="text-xs text-muted-foreground">{(activeTimers as any[]).filter((t:any)=>t.mode==="work").length} working · {(activeTimers as any[]).filter((t:any)=>t.mode==="break").length} on break</span>
            </div>
            {(allProfiles as any[]).map((p:any)=>{
              const timer=timerMap[p.user_id]; const onBreak=timer?.mode==="break"; const isOnline=!!attMap[p.user_id];
              const liveEl=timer?Math.floor((now-new Date(timer.started_at).getTime())/1000):0;
              return (
                <div key={p.user_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${timer?onBreak?"border-warning/40 bg-warning/5":"border-primary/30 bg-accent/20":isOnline?"border-yellow-400/30 bg-yellow-400/5":"border-border bg-secondary/30 opacity-60"}`}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${!isOnline?"bg-muted-foreground/30":timer?onBreak?"bg-warning animate-pulse":"bg-green-500 animate-pulse":"bg-yellow-400"}`} />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{p.display_name||"Unnamed"}</p><p className="text-xs text-muted-foreground truncate">{p.job_title||"—"}{p.department?` · ${p.department}`:""}</p></div>
                  {timer?<div className="text-right flex-shrink-0"><p className={`font-mono text-sm font-medium ${onBreak?"text-warning":"text-primary"}`}>{fmtT(liveEl)}</p><p className="text-xs text-muted-foreground">{onBreak?"☕ Break":(timer.tasks as any)?.name||"Working"}</p></div>:<span className={`text-xs ${isOnline?"text-yellow-400":"text-muted-foreground"}`}>{isOnline?"Idle":"Offline"}</span>}
                </div>
              );
            })}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Today's Summary</h3>
            <div className="space-y-2">
              {[...(allProfiles as any[])].sort((a:any,b:any)=>((memberStats as any)[b.user_id]?.today||0)-((memberStats as any)[a.user_id]?.today||0)).map((p:any)=>{
                const s=(memberStats as any)[p.user_id]||{today:0};
                const pct=s.today>0?Math.min(100,Math.round((s.today/28800)*100)):0;
                return <div key={p.user_id}><div className="flex items-center justify-between mb-0.5"><span className="text-xs text-foreground">{p.display_name||"Unnamed"}</span><span className="text-xs font-mono text-muted-foreground">{fmtHM(s.today)}</span></div><div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:"hsl(270,70%,60%)"}} /></div></div>;
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Progress = % of 8h workday</p>
          </div>
        </TabsContent>

        {/* ── DTR TAB ── */}
        <TabsContent value="dtr" className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Daily Time Record</h3>
              <input type="date" value={dtrDate} onChange={e=>setDtrDate(e.target.value)} className="bg-secondary border border-border rounded-md px-2 py-1 text-xs text-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border"><th className="text-left py-2 px-3 text-xs text-muted-foreground">Name</th><th className="text-left py-2 px-3 text-xs text-muted-foreground">Time In</th><th className="text-left py-2 px-3 text-xs text-muted-foreground">Time Out</th><th className="text-right py-2 px-3 text-xs text-muted-foreground">Duration</th></tr></thead>
                <tbody>
                  {(dtrLogs as any[]).map((d:any)=>(
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3 text-foreground font-medium">{d.profiles?.display_name||"Unknown"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{d.time_in?format(new Date(d.time_in),"h:mm a"):"—"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{d.time_out?format(new Date(d.time_out),"h:mm a"):<span className="text-green-500">Active</span>}</td>
                      <td className="py-2 px-3 text-right font-mono text-foreground">{d.duration_seconds?fmtHM(d.duration_seconds):d.time_out?"—":<span className="text-xs text-muted-foreground">ongoing</span>}</td>
                    </tr>
                  ))}
                  {(dtrLogs as any[]).length===0&&<tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No records for {dtrDate}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── ROLES TAB ── */}
        <TabsContent value="roles" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> User Roles</h3>
            {(allProfiles as any[]).map((p:any)=>{
              const cur=getRoleForUser(p.user_id); const isEd=editingRoleId===p.user_id;
              return (
                <div key={p.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2 min-w-0"><div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">{(p.display_name||"?").charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{p.display_name||"Unnamed"}</p><p className="text-xs text-muted-foreground">{p.job_title||"—"}</p></div></div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEd?<><Select value={editRole} onValueChange={setEditRole}><SelectTrigger className="bg-card border-border text-xs h-7 w-24"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-7 text-xs gradient-primary px-2" onClick={()=>updateUserRole.mutate({userId:p.user_id,role:editRole})}><Save className="h-3 w-3 mr-1" />Save</Button><Button size="sm" variant="ghost" className="h-7 px-1" onClick={()=>setEditingRoleId(null)}><X className="h-3 w-3" /></Button></>:<><span className={`text-xs px-2 py-0.5 rounded-full ${cur==="admin"?"bg-primary/20 text-primary":"bg-secondary text-muted-foreground"}`}>{cur}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={()=>{ setEditingRoleId(p.user_id); setEditRole(cur); }}><Pencil className="h-3 w-3" /></Button></>}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── PROJECTS TAB ── */}
        <TabsContent value="projects" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Project</h3>
            <Input placeholder="Project name" value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} className="bg-secondary border-border text-sm" />
            <div className="flex gap-2 flex-wrap">{PROJECT_COLORS.map(c=><button key={c} onClick={()=>setNewProjectColor(c)} className={`h-5 w-5 rounded-full transition-transform ${newProjectColor===c?"scale-125 ring-2 ring-foreground":""}`} style={{backgroundColor:c}} />)}</div>
            <Button size="sm" onClick={()=>createProject.mutate()} disabled={!newProjectName.trim()} className="gradient-primary text-sm"><Plus className="h-3 w-3 mr-1" /> Add Project</Button>
          </div>
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Projects</h3>
            {(allProjects as any[]).map((p:any)=>(
              <div key={p.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 group">
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{backgroundColor:p.color}} />
                {editingProjectId===p.id?<div className="flex-1 flex gap-2"><Input value={editProjectName} onChange={e=>setEditProjectName(e.target.value)} className="bg-card border-border text-sm h-8" /><Button size="sm" onClick={()=>updateProject.mutate({id:p.id,name:editProjectName})}>Save</Button><Button size="sm" variant="ghost" onClick={()=>setEditingProjectId(null)}>Cancel</Button></div>:<><span className="flex-1 text-sm text-foreground">{p.name}</span><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={()=>{ setEditingProjectId(p.id); setEditProjectName(p.name); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={()=>deleteProject.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button></>}
              </div>
            ))}
            {(allProjects as any[]).length===0&&<p className="text-xs text-muted-foreground text-center py-4">No projects</p>}
          </div>
        </TabsContent>

        {/* ── TASKS TAB ── */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Task</h3>
            <Input placeholder="Task name" value={newTaskName} onChange={e=>setNewTaskName(e.target.value)} className="bg-secondary border-border text-sm" />
            <Input placeholder="Scope (optional)" value={newTaskScope} onChange={e=>setNewTaskScope(e.target.value)} className="bg-secondary border-border text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newTaskCategory} onValueChange={setNewTaskCategory}><SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              <Select value={newTaskProjectId} onValueChange={setNewTaskProjectId}><SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="Project" /></SelectTrigger><SelectContent><SelectItem value="none">No Project</SelectItem>{(allProjects as any[]).map((p:any)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <Button size="sm" onClick={()=>createTask.mutate()} disabled={!newTaskName.trim()} className="gradient-primary text-sm"><Plus className="h-3 w-3 mr-1" /> Add Task</Button>
          </div>
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Tasks</h3>
            {(allTasks as any[]).map((t:any)=>(
              <div key={t.id} className="rounded-lg bg-secondary/50 border border-border/50 p-3">
                {editingTaskId===t.id?(
                  <div className="space-y-2">
                    <Input value={editTaskName} onChange={e=>setEditTaskName(e.target.value)} className="bg-card border-border text-sm h-8" placeholder="Task name" />
                    <Input value={editTaskScope} onChange={e=>setEditTaskScope(e.target.value)} className="bg-card border-border text-sm h-8" placeholder="Scope" />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={editTaskCategory} onValueChange={setEditTaskCategory}><SelectTrigger className="bg-card border-border text-xs h-7"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                      <Select value={editTaskProject} onValueChange={setEditTaskProject}><SelectTrigger className="bg-card border-border text-xs h-7"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Project</SelectItem>{(allProjects as any[]).map((p:any)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="flex gap-1"><Button size="sm" className="h-6 text-xs gradient-primary px-2" onClick={()=>updateTask.mutate({id:t.id,name:editTaskName,category:editTaskCategory,projectId:editTaskProject,scope:editTaskScope})}><Save className="h-3 w-3 mr-1" />Save</Button><Button size="sm" variant="ghost" className="h-6 px-2" onClick={()=>setEditingTaskId(null)}><X className="h-3 w-3" /></Button></div>
                  </div>
                ):(
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.category}{t.projects?.name?` · ${t.projects.name}`:""}{t.scope?` · ${t.scope}`:""}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={()=>{ setEditingTaskId(t.id); setEditTaskName(t.name); setEditTaskCategory(t.category||"Other"); setEditTaskProject(t.project_id||"none"); setEditTaskScope(t.scope||""); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={()=>deleteTask.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ))}
            {(allTasks as any[]).length===0&&<p className="text-xs text-muted-foreground text-center py-4">No tasks</p>}
          </div>
        </TabsContent>

        {/* ── SCREENSHOTS TAB ── */}
        <TabsContent value="screenshots" className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> Screenshot Intervals</h3>
            <p className="text-xs text-muted-foreground">Screenshots are stored in Supabase Storage under the <code className="bg-secondary px-1 py-0.5 rounded">screenshots</code> bucket. Go to <strong>Supabase → Storage → screenshots</strong> to view them. Each file is named <code className="bg-secondary px-1 py-0.5 rounded">user_id/timestamp.png</code>.</p>
            <div className="space-y-3">
              {(allProfiles as any[]).map((p:any)=>(
                <ScreenshotRow key={p.user_id} profile={p} onSave={interval=>updateScreenshot.mutate({userId:p.user_id,interval})} />
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ScreenshotRow = ({ profile, onSave }: { profile: any; onSave: (n: number) => void }) => {
  const [val, setVal] = useState(String(profile.screenshot_interval??600));
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50">
      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{profile.display_name||"Unnamed"}</p><p className="text-xs text-muted-foreground">{profile.job_title||"—"}</p></div>
      <Select value={val} onValueChange={setVal}><SelectTrigger className="bg-card border-border text-xs h-7 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">No screenshots</SelectItem><SelectItem value="60">Every 1 min</SelectItem><SelectItem value="300">Every 5 min</SelectItem><SelectItem value="600">Every 10 min</SelectItem><SelectItem value="900">Every 15 min</SelectItem><SelectItem value="1800">Every 30 min</SelectItem></SelectContent></Select>
      <Button size="sm" className={`h-7 text-xs px-3 ${saved?"bg-green-600 hover:bg-green-600":"gradient-primary"}`} onClick={()=>{ onSave(parseInt(val)); setSaved(true); setTimeout(()=>setSaved(false),2000); }}>{saved?"Saved!":"Save"}</Button>
    </div>
  );
};

export default AdminPanel;
