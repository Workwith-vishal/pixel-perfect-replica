import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStudent } from "@/lib/api";
import type { ProgramDto, StudentListRowDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";

/**
 * Enrolment is deliberately limited to the four facts a candidate cannot start
 * without: who they are, how they log in, and which programme gates their
 * assessments. Everything else (attempts, averages, integrity standing) is
 * derived from their exam activity, so it is not asked for here and not stored.
 */

const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function suggestPassword(): string {
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (value) => ALPHANUMERIC[value % ALPHANUMERIC.length]).join("");
  return `Cv${body}7`;
}

export function StudentEnrolDialog({
  programs,
  onCreated,
}: {
  programs: ProgramDto[];
  onCreated: (student: StudentListRowDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setProgram((current) => current || programs[0]?.name || "");
  }, [open, programs]);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setReveal(false);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      reset();
      // Land focus on the first field so keyboard entry starts immediately.
      requestAnimationFrame(() => emailRef.current?.focus());
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("Enter the student's full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password needs at least 8 characters, including a letter and a number.");
      return;
    }
    if (!program) {
      setError("Choose a programme.");
      return;
    }

    setSaving(true);
    try {
      const created = await createStudent({
        data: { name: name.trim(), email: email.trim(), program, password },
      });
      onCreated(created);
      toast.success(`${created.name} enrolled in ${created.program}`);
      handleOpenChange(false);
    } catch (submitError) {
      const message = errorMessage(submitError, "Could not enrol the student");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Enrol student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
          <DialogDescription>
            Creates a login for the candidate. Their results and integrity standing fill in as they
            take assessments.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Aarav Sharma"
              autoComplete="off"
              maxLength={120}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-email">Email</Label>
            <Input
              id="student-email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="aarav@example.com"
              autoComplete="off"
              maxLength={320}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-program">Programme</Label>
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger id="student-program">
                <SelectValue placeholder="Choose a programme" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((entry) => (
                  <SelectItem key={entry.id} value={entry.name}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-password">Temporary password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="student-password"
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((current) => !current)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={reveal ? "Hide password" : "Show password"}
                >
                  {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Generate a strong password"
                onClick={() => {
                  setPassword(suggestPassword());
                  setReveal(true);
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this with the candidate. It is stored only as a PBKDF2 hash and cannot be read
              back.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Enrol student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
