import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Camera } from "lucide-react";

interface TimerProps {
  taskId?: string;
  projectId?: string;
  onEntryCreated?: () => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const Timer = ({ taskId, projectId, onEntryCreated }: TimerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [screenshotInterval, setScreenshotInterval] = useState("600");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const takeScreenshot = useCallback(async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px Inter";
        ctx.fillText(`Screenshot taken at ${new Date().toLocaleTimeString()}`, 20, 40);
        ctx.fillText(`Timer: ${formatTime(elapsed)}`, 20, 70);
      }
      toast({ title: "Screenshot captured", description: `Next in ${parseInt(screenshotInterval) / 60} min` });
    } catch {
      toast({ title: "Screenshot failed", variant: "destructive" });
    }
  }, [elapsed, screenshotInterval, toast]);

  useEffect(() => {
    if (isRunning && screenshotInterval !== "0") {
      screenshotTimerRef.current = setInterval(takeScreenshot, parseInt(screenshotInterval) * 1000);
    }
    return () => {
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
    };
  }, [isRunning, screenshotInterval, takeScreenshot]);

  const handleStart = () => {
    setStartTime(new Date());
    setElapsed(0);
    setIsRunning(true);
  };

  const handleStop = async () => {
    setIsRunning(false);
    if (!startTime || !user) return;

    const endTime = new Date();
    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      task_id: taskId || null,
      project_id: projectId || null,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_seconds: elapsed,
      screenshot_interval: parseInt(screenshotInterval),
    });

    if (error) {
      toast({ title: "Error saving time entry", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Time entry saved!" });
      onEntryCreated?.();
    }
    setElapsed(0);
    setStartTime(null);
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Timer</h3>
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <Select value={screenshotInterval} onValueChange={setScreenshotInterval}>
            <SelectTrigger className="w-[140px] bg-secondary border-border">
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
        </div>
      </div>

      <div className="text-center">
        <div className={`timer-display text-5xl font-bold ${isRunning ? "text-primary animate-pulse-glow glow-primary rounded-lg p-4" : "text-foreground p-4"}`}>
          {formatTime(elapsed)}
        </div>
      </div>

      <div className="flex justify-center">
        {isRunning ? (
          <Button onClick={handleStop} variant="destructive" size="lg" className="gap-2">
            <Square className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button onClick={handleStart} size="lg" className="gap-2 gradient-primary">
            <Play className="h-4 w-4" /> Start
          </Button>
        )}
      </div>
    </div>
  );
};

export default Timer;
