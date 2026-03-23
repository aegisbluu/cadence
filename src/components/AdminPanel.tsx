import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Folder, ListTodo, Users, Trash2, Pencil, Plus, Camera } from "lucide-react";

const PROJECT_COLORS = ["#A855F7", "#3B82F6", "#10B981", "#F97316", "#EF4444", "#EC4899", "#06B6D4", "#F59E0B"];
const CATEGORIES = ["Development", "Design", "Research", "Meeting", "Admin", "Other"];

const AdminPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Project form
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");

  // Task form
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("Other");
  const [newTaskProjectId, setNewTaskProjectId] = useState<string>("none");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState("");

  // Screenshot interval per user
  const [selectedUserId, setSelectedUserId] = useState<string>("none");
  const [screenshotVal, setScreenshotVal] = useState("600");

  // Queries
  const { data: allProjects = [] } = useQuery({
    queryKey: ["admin_projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["admin_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, projects(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Project mutations
  const createProject = useMutation({
    mutationFn: async () => {
      const targetUserId = allProfiles[0]?.user_id || user!.id;
      const { error } = await supabase.from("projects").insert({ user_id: targetUserId, name: newProjectName, color: newProjectColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewProjectName("");
      toast({ title: "Project created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("projects").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingProjectId(null);
      toast({ title: "Project updated" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
    },
  });

  // Task mutations
  const createTask = useMutation({
    mutationFn: async () => {
      const targetUserId = allProfiles[0]?.user_id || user!.id;
      const { error } = await supabase.from("tasks").insert({
        user_id: targetUserId,
        name: newTaskName,
        category: newTaskCategory,
        project_id: newTaskProjectId === "none" ? null : newTaskProjectId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewTaskName("");
      toast({ title: "Task created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("tasks").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setEditingTaskId(null);
      toast({ title: "Task updated" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task deleted" });
    },
  });

  // Screenshot interval update
  const updateScreenshotInterval = useMutation({
    mutationFn: async ({ userId, interval }: { userId: string; interval: number }) => {
      const { error } = await supabase.from("profiles").update({ screenshot_interval: interval }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
      toast({ title: "Screenshot interval updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" /> Admin Panel
      </h2>

      <Tabs defaultValue="projects">
        <TabsList className="bg-secondary">
          <TabsTrigger value="projects" className="gap-1"><Folder className="h-3 w-3" /> Projects</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1"><ListTodo className="h-3 w-3" /> Tasks</TabsTrigger>
          <TabsTrigger value="screenshots" className="gap-1"><Camera className="h-3 w-3" /> Screenshots</TabsTrigger>
          <TabsTrigger value="users" className="gap-1"><Users className="h-3 w-3" /> Users</TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Project</h3>
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="bg-secondary border-border text-sm"
            />
            <div className="flex gap-1">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewProjectColor(c)}
                  className={`h-5 w-5 rounded-full transition-transform ${newProjectColor === c ? "scale-125 ring-2 ring-foreground" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button size="sm" onClick={() => createProject.mutate()} disabled={!newProjectName.trim()} className="gradient-primary text-sm">
              <Plus className="h-3 w-3 mr-1" /> Add Project
            </Button>
          </div>

          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Projects</h3>
            {allProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 group">
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                {editingProjectId === p.id ? (
                  <div className="flex-1 flex gap-2">
                    <Input value={editProjectName} onChange={(e) => setEditProjectName(e.target.value)} className="bg-card border-border text-sm h-8" />
                    <Button size="sm" onClick={() => updateProject.mutate({ id: p.id, name: editProjectName })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingProjectId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">{p.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteProject.mutate(p.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {allProjects.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No projects</p>}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add Task</h3>
            <Input
              placeholder="Task name"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              className="bg-secondary border-border text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newTaskProjectId} onValueChange={setNewTaskProjectId}>
                <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {allProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => createTask.mutate()} disabled={!newTaskName.trim()} className="gradient-primary text-sm">
              <Plus className="h-3 w-3 mr-1" /> Add Task
            </Button>
          </div>

          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Tasks</h3>
            {allTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 group">
                {editingTaskId === t.id ? (
                  <div className="flex-1 flex gap-2">
                    <Input value={editTaskName} onChange={(e) => setEditTaskName(e.target.value)} className="bg-card border-border text-sm h-8" />
                    <Button size="sm" onClick={() => updateTask.mutate({ id: t.id, name: editTaskName })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTaskId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.category} {(t.projects as any)?.name ? `• ${(t.projects as any).name}` : ""}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setEditingTaskId(t.id); setEditTaskName(t.name); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteTask.mutate(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {allTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>}
          </div>
        </TabsContent>

        {/* Screenshots Tab */}
        <TabsContent value="screenshots" className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Screenshot Interval Settings
            </h3>
            <p className="text-xs text-muted-foreground">Configure how often screenshots are taken for each user during work sessions.</p>

            <div className="space-y-3">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="bg-secondary border-border text-sm">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a user</SelectItem>
                  {allProfiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.display_name || "Unnamed"} ({p.user_id.slice(0, 8)}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={screenshotVal} onValueChange={setScreenshotVal}>
                <SelectTrigger className="bg-secondary border-border text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No screenshots</SelectItem>
                  <SelectItem value="60">Every 1 min</SelectItem>
                  <SelectItem value="300">Every 5 min</SelectItem>
                  <SelectItem value="600">Every 10 min</SelectItem>
                  <SelectItem value="900">Every 15 min</SelectItem>
                  <SelectItem value="1800">Every 30 min</SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="sm"
                className="gradient-primary text-sm"
                disabled={selectedUserId === "none"}
                onClick={() =>
                  updateScreenshotInterval.mutate({
                    userId: selectedUserId,
                    interval: parseInt(screenshotVal),
                  })
                }
              >
                Save Interval
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">All Users</h3>
            {allProfiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm text-foreground">{p.display_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">{p.job_title || "No title"} • Screenshot every {(p as any).screenshot_interval ? `${(p as any).screenshot_interval / 60} min` : "10 min"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{p.user_id.slice(0, 8)}...</span>
              </div>
            ))}
            {allProfiles.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No users</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
