import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Save, X, CheckCircle2, XCircle, AlertCircle, CalendarDays } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { label: string; cls: string; icon: any }> = {
    pending:  { label: "Pending",  cls: "bg-yellow-400/10 text-yellow-500 border-yellow-400/30",  icon: AlertCircle },
    approved: { label: "Approved", cls: "bg-green-500/10 text-green-500 border-green-500/30",   icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  };
  const c = cfg[status] || cfg.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.cls}`}>
      <Icon className="h-3 w-3" /> {c.label}
    </span>
  );
};

const Leaves = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTypeId, setFTypeId] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fHalf, setFHalf] = useState(false);
  const [fReason, setFReason] = useState("");

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["leave_types"],
    queryFn: async () => { const { data } = await supabase.from("leave_types").select("*").order("name"); return data || []; },
    enabled: !!user,
  });

  const { data: myLeaves = [] } = useQuery({
    queryKey: ["my_leaves"],
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests").select("*, leave_types(name, color)").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const now = new Date();
  const { data: myAllocations = [] } = useQuery({
    queryKey: ["my_allocations", now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      const { data } = await supabase.from("leave_allocations")
        .select("*, leave_types(name, color)")
        .eq("user_id", user!.id)
        .eq("year", now.getFullYear())
        .eq("month", now.getMonth() + 1);
      return data || [];
    },
    enabled: !!user,
  });

  const calcDays = (start: string, end: string, half: boolean) => {
    if (!start || !end) return 0;
    const d = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
    return half ? 0.5 : d;
  };

  const days = calcDays(fStart, fEnd, fHalf);

  const submitLeave = useMutation({
    mutationFn: async () => {
      if (!fTypeId || !fStart || !fEnd) throw new Error("Please fill all required fields");
      if (days <= 0) throw new Error("End date must be on or after start date");
      const payload = {
        user_id: user!.id, leave_type_id: fTypeId,
        start_date: fStart, end_date: fEnd,
        days_requested: days, reason: fReason || null, status: "pending",
      };
      if (editingId) {
        const { error } = await supabase.from("leave_requests").update(payload).eq("id", editingId).eq("user_id", user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_requests").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_leaves"] });
      resetForm();
      toast({ title: editingId ? "Leave request updated" : "Leave request submitted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLeave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_leaves"] }); toast({ title: "Leave request deleted" }); },
  });

  const resetForm = () => {
    setShowForm(false); setEditingId(null); setFTypeId(""); setFStart(""); setFEnd(""); setFHalf(false); setFReason("");
  };

  const openEdit = (leave: any) => {
    setEditingId(leave.id); setFTypeId(leave.leave_type_id); setFStart(leave.start_date);
    setFEnd(leave.end_date); setFHalf(leave.days_requested === 0.5); setFReason(leave.reason || "");
    setShowForm(true);
  };

  // Group approved leaves used this month by type
  const usedThisMonth: Record<string, number> = {};
  for (const l of myLeaves as any[]) {
    if (l.status === "approved") {
      const d = new Date(l.start_date);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        usedThisMonth[l.leave_type_id] = (usedThisMonth[l.leave_type_id] || 0) + Number(l.days_requested);
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" /> Leave Requests
        </h2>
        <Button size="sm" className="gradient-primary gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Monthly balance */}
      {(myAllocations as any[]).length > 0 && (
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">This Month's Balance ({format(now, "MMMM yyyy")})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(myAllocations as any[]).map((alloc: any) => {
              const used = usedThisMonth[alloc.leave_type_id] || 0;
              const remaining = alloc.days_allocated - used;
              return (
                <div key={alloc.id} className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: alloc.leave_types?.color || "#A855F7" }} />
                    <p className="text-xs font-medium text-foreground truncate">{alloc.leave_types?.name}</p>
                  </div>
                  <p className="text-lg font-bold text-primary">{remaining} <span className="text-xs font-normal text-muted-foreground">/ {alloc.days_allocated} days</span></p>
                  <p className="text-xs text-muted-foreground">{used} used</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="glass-card p-4 space-y-3 border border-primary/30">
          <p className="text-sm font-semibold text-foreground">{editingId ? "Edit Leave Request" : "New Leave Request"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Leave Type</p>
              <Select value={fTypeId} onValueChange={setFTypeId}>
                <SelectTrigger className="bg-secondary border-border text-sm h-8"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {(leaveTypes as any[]).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
              <Input type="date" value={fStart} onChange={e => { setFStart(e.target.value); if (!fEnd) setFEnd(e.target.value); }} className="bg-secondary border-border text-sm h-8" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">End Date</p>
              <Input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)} min={fStart} className="bg-secondary border-border text-sm h-8" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fHalf} onChange={e => setFHalf(e.target.checked)} className="rounded" />
            <span className="text-sm text-foreground">Half day (0.5)</span>
          </label>
          {days > 0 && <p className="text-xs text-primary">Duration: <span className="font-medium">{days} day{days !== 1 ? "s" : ""}</span></p>}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason (optional)</p>
            <Input value={fReason} onChange={e => setFReason(e.target.value)} placeholder="Reason for leave" className="bg-secondary border-border text-sm h-8" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gradient-primary gap-1" onClick={() => submitLeave.mutate()} disabled={submitLeave.isPending}>
              <Save className="h-3 w-3" /> {editingId ? "Update" : "Submit Request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      {/* Leave list */}
      <div className="space-y-2">
        {(myLeaves as any[]).map((leave: any) => (
          <div key={leave.id} className="glass-card p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: leave.leave_types?.color || "#A855F7" }} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{leave.leave_types?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(leave.start_date), "MMM d")}
                  {leave.start_date !== leave.end_date ? ` – ${format(new Date(leave.end_date), "MMM d, yyyy")}` : `, ${format(new Date(leave.start_date), "yyyy")}`}
                  {" · "}{leave.days_requested} day{leave.days_requested !== 1 ? "s" : ""}
                </p>
                {leave.reason && <p className="text-xs text-muted-foreground italic truncate">{leave.reason}</p>}
                {leave.admin_note && <p className="text-xs text-muted-foreground italic">Admin: {leave.admin_note}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={leave.status} />
              {leave.status === "pending" && (
                <>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(leave)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteLeave.mutate(leave.id)}><Trash2 className="h-3 w-3" /></Button>
                </>
              )}
            </div>
          </div>
        ))}
        {(myLeaves as any[]).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No leave requests yet</p>}
      </div>
    </div>
  );
};

export default Leaves;
