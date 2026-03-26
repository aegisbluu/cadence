import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CheckCircle2, Circle, Trash2, ListTodo, Pencil, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import CategorySelect from "@/components/CategorySelect";

const TaskList = ({ selectedProjectId, selectedTaskId, onSelectTask }: {
  selectedProjectId?: string;
  selectedTaskId?: string;
  onSelectTask: (id: string | undefined) => void;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [category, setCategory] = useState("Other");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskName, setNewSubtaskName] = useState("");

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", selectedProjectId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (selectedProjectId) q = q.eq("project_id", selectedProjectId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subtasks = [] } = useQuery({
    queryKey: ["subtasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subtasks").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("tasks").insert({
        user_id: user.id, name: newName, category, project_id: selectedProjectId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks_all"] }); setNewName(""); setShowForm(false); toast({ title: "Task created!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, cat }: { id: string; name: string; cat: string }) => {
      const { error } = await supabase.from("tasks").update({ name, category: cat }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks_all"] }); setEditingId(null); toast({ title: "Task updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from("tasks").update({ is_completed: completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tasks"] }); queryClient.invalidateQueries({ queryKey: ["tasks_all"] }); },
  });

  // Subtask mutations
  const addSubtask = useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      const { error } = await supabase.from("subtasks").insert({ task_id: taskId, user_id: user!.id, name });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["subtasks"] }); setNewSubtaskName(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from("subtasks").update({ is_completed: completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subtasks"] }),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subtasks"] }),
  });

  const categories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean) as string[]));

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" /> Tasks
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setShowForm(!showForm)} className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showForm && (
        <div className="space-y-2">
          <Input placeholder="Task name" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-secondary border-border text-sm" />
          <CategorySelect value={category} onChange={setCategory} categories={categories} triggerClassName="bg-secondary border-border text-sm" />
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newName.trim()} className="w-full gradient-primary text-sm">Add Task</Button>
        </div>
      )}

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {tasks.map((t) => {
          const isEditing = editingId === t.id;
          const isExpanded = expandedTaskId === t.id;
          const taskSubtasks = (subtasks as any[]).filter(s => s.task_id === t.id);

          return (
            <div key={t.id} className="space-y-0.5">
              <div className="flex items-center group gap-1">
                <button onClick={() => toggleMutation.mutate({ id: t.id, completed: !t.is_completed })} className="flex-shrink-0">
                  {t.is_completed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isEditing ? (
                  <div className="flex-1 space-y-1.5 px-2 py-1">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-card border-border text-xs h-7" placeholder="Task name" />
                    <CategorySelect value={editCategory} onChange={setEditCategory} categories={categories} triggerClassName="bg-card border-border text-xs h-7" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-xs gradient-primary px-2 gap-1" onClick={() => updateMutation.mutate({ id: t.id, name: editName, cat: editCategory })}><Save className="h-3 w-3" /> Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectTask(selectedTaskId === t.id ? undefined : t.id)}
                    className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                      selectedTaskId === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
                    } ${t.is_completed ? "line-through opacity-50" : ""}`}
                  >
                    <div>{t.name}</div>
                    {t.category && <span className="text-xs text-muted-foreground">{t.category}</span>}
                    {taskSubtasks.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({taskSubtasks.filter(s => s.is_completed).length}/{taskSubtasks.length})
                      </span>
                    )}
                  </button>
                )}

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => setExpandedTaskId(isExpanded ? null : t.id)} className="h-6 w-6 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </Button>
                  {!isEditing && (
                    <Button variant="ghost" size="icon" onClick={() => { setEditingId(t.id); setEditName(t.name); setEditCategory(t.category || "Other"); }} className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground">
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(t.id)} className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Subtasks */}
              {isExpanded && (
                <div className="ml-7 pl-2 border-l-2 border-primary/20 space-y-1">
                  {taskSubtasks.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-1.5 group/sub">
                      <button onClick={() => toggleSubtask.mutate({ id: s.id, completed: !s.is_completed })} className="flex-shrink-0">
                        {s.is_completed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      <span className={`text-xs flex-1 ${s.is_completed ? "line-through text-muted-foreground/50" : "text-foreground"}`}>{s.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => deleteSubtask.mutate(s.id)} className="h-5 w-5 opacity-0 group-hover/sub:opacity-100 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-1.5 mt-1">
                    <Input
                      value={newSubtaskName}
                      onChange={e => setNewSubtaskName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newSubtaskName.trim()) addSubtask.mutate({ taskId: t.id, name: newSubtaskName.trim() }); }}
                      placeholder="Add subtask…"
                      className="bg-card border-border text-xs h-6 flex-1"
                    />
                    <Button size="sm" className="h-6 text-xs px-2 gradient-primary" onClick={() => { if (newSubtaskName.trim()) addSubtask.mutate({ taskId: t.id, name: newSubtaskName.trim() }); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>}
      </div>
    </div>
  );
};

export default TaskList;
