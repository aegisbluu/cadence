import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";

const ProjectList = ({ selectedProjectId, onSelectProject }: {
  selectedProjectId?: string;
  onSelectProject: (id: string | undefined) => void;
}) => {
  const { user } = useAuth();
  const { isAdmin } = useRole();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Folder className="h-4 w-4 text-primary" /> Projects
        </h3>
        {!isAdmin && <span className="text-xs text-muted-foreground">View only</span>}
      </div>

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
          <button
            key={p.id}
            onClick={() => onSelectProject(p.id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
              selectedProjectId === p.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            {p.name}
          </button>
        ))}
        {projects.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No projects yet</p>}
      </div>
    </div>
  );
};

export default ProjectList;
