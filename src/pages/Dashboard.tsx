import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useQueryClient } from "@tanstack/react-query";
import Timer from "@/components/Timer";
import ProjectList from "@/components/ProjectList";
import Reports from "@/components/Reports";
import AdminPanel from "@/components/AdminPanel";
import { Button } from "@/components/ui/button";
import { Clock, BarChart3, LogOut, LayoutDashboard, Shield } from "lucide-react";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [view, setView] = useState<"timer" | "reports" | "admin">("timer");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">Cadence</span>
          </div>
          <nav className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <Button variant="ghost" size="sm" onClick={() => setView("timer")} className={view === "timer" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
              <LayoutDashboard className="h-4 w-4 mr-1" /> Track
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView("reports")} className={view === "reports" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
              <BarChart3 className="h-4 w-4 mr-1" /> Reports
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setView("admin")} className={view === "admin" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}>
                <Shield className="h-4 w-4 mr-1" /> Admin
              </Button>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        {view === "timer" ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <ProjectList selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
            </div>
            <div className="lg:col-span-3">
              <Timer projectId={selectedProjectId} onEntryCreated={() => queryClient.invalidateQueries({ queryKey: ["time_entries_report"] })} />
            </div>
          </div>
        ) : view === "reports" ? (
          <Reports />
        ) : (
          <AdminPanel />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
