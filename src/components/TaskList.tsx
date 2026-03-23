import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle2, Circle, Trash2, ListTodo } from "lucide-react";

const CATEGORIES = ["Development", "Design", "Research", "Meeting", "Admin", "Other"];

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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        name: newName,
        category,
        project_id: selectedProjectId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewName("");
      setShowForm(false);
      toast({ title: "Task created!" });
    },
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

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
          <Input
            placeholder="Task name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-secondary border-border text-sm"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-secondary border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newName.trim()} className="w-full gradient-primary text-sm">
            Add Task
          </Button>
        </div>
      )}

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center group gap-1">
            <button onClick={() => toggleMutation.mutate({ id: t.id, completed: !t.is_completed })} className="flex-shrink-0">
              {t.is_completed ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => onSelectTask(selectedTaskId === t.id ? undefined : t.id)}
              className={`flex-1 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                selectedTaskId === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
              } ${t.is_completed ? "line-through opacity-50" : ""}`}
            >
              <div>{t.name}</div>
              {t.category && <span className="text-xs text-muted-foreground">{t.category}</span>}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate(t.id)}
              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>}
      </div>
    </div>
  );
};

export default TaskList;
