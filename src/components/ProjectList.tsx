import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Folder, Trash2 } from "lucide-react";

const PROJECT_COLORS = ["#A855F7", "#3B82F6", "#10B981", "#F97316", "#EF4444", "#EC4899", "#06B6D4", "#F59E0B"];

const ProjectList = ({ selectedProjectId, onSelectProject }: {
  selectedProjectId?: string;
  onSelectProject: (id: string | undefined) => void;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [showForm, setShowForm] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("projects").insert({ user_id: user.id, name: newName, color: selectedColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewName("");
      setShowForm(false);
      toast({ title: "Project created!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
    },
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Folder className="h-4 w-4 text-primary" /> Projects
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setShowForm(!showForm)} className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showForm && (
        <div className="space-y-2">
          <Input
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-secondary border-border text-sm"
          />
          <div className="flex gap-1">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`h-5 w-5 rounded-full transition-transform ${selectedColor === c ? "scale-125 ring-2 ring-foreground" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newName.trim()} className="w-full gradient-primary text-sm">
            Add Project
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <button
          onClick={() => onSelectProject(undefined)}
          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
            !selectedProjectId ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          All Projects
        </button>
        {projects.map((p) => (
          <div key={p.id} className="flex items-center group">
            <button
              onClick={() => onSelectProject(p.id)}
              className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                selectedProjectId === p.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteMutation.mutate(p.id)}
              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectList;
