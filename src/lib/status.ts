export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-primary-soft text-primary border-primary/20",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-destructive-soft text-destructive border-destructive/25",
};

export function assessmentStatusTone(status: string): StatusTone {
  switch (status) {
    case "Live":
      return "success";
    case "Scheduled":
      return "info";
    case "Completed":
      return "warning";
    case "Archived":
      return "neutral";
    default:
      return "neutral";
  }
}

export function attemptStatusTone(status: string): StatusTone {
  switch (status) {
    case "submitted":
      return "success";
    case "in_progress":
      return "info";
    case "auto_submitted":
      return "warning";
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

export function attemptStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "auto_submitted":
      return "Auto submitted";
    case "expired":
      return "Expired";
    default:
      return "Submitted";
  }
}

export function integrityStatusTone(status: string): StatusTone {
  switch (status) {
    case "Clean":
      return "success";
    case "Review Required":
      return "warning";
    case "Flagged":
      return "danger";
    default:
      return "neutral";
  }
}

export function difficultyTone(difficulty: string): StatusTone {
  switch (difficulty) {
    case "Easy":
      return "success";
    case "Medium":
      return "warning";
    case "Hard":
      return "danger";
    default:
      return "info";
  }
}

export function questionStatusTone(status: string): StatusTone {
  return status === "Active" ? "success" : "neutral";
}

export function percentTone(percentage: number | null | undefined): StatusTone {
  if (percentage === null || percentage === undefined) return "neutral";
  if (percentage >= 75) return "success";
  if (percentage >= 50) return "warning";
  return "danger";
}
