import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { importQuestions, validateCsv } from "@/lib/api";
import type { CsvValidationDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { truncate } from "@/lib/format";

const sampleCsv = `program,module,topic,difficulty,questionText,options,correctOption,explanation,marks,negativeMarks,tags
Product Management,Roadmap Prioritisation,Prioritisation,Medium,"Which framework best balances reach against delivery confidence?","RICE | Kano | Kano matrix | Weighted shortest job first",0,"RICE scores combine reach, impact, confidence and effort.",4,1,"prioritisation|frameworks"
Business Analytics,Statistics & Inference,Hypothesis Testing,Hard,"A/B test shows a 2% lift with a p-value of 0.18. What is the correct conclusion?","Reject the null | Fail to reject the null | The test is invalid | The lift is twice as large",1,"With p above the 0.05 threshold the result is not statistically significant.",4,1,"ab-testing|inference"`;

export function QuestionCsvDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}) {
  const [csv, setCsv] = useState("");
  const [validation, setValidation] = useState<CsvValidationDto | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCsv("");
    setValidation(null);
  };

  const validate = useMutation({
    mutationFn: async () => {
      const result = await validateCsv({ data: { csv } });
      setValidation(result);
      return result;
    },
    onError: (error) => toast.error(errorMessage(error, "Could not validate the CSV")),
  });

  const commit = useMutation({
    mutationFn: async () => {
      const result = await importQuestions({ data: { csv, commit: true } });
      return result.imported;
    },
    onSuccess: async (imported) => {
      toast.success(`Imported ${imported} question${imported === 1 ? "" : "s"}`);
      await onImported();
      reset();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not import the CSV")),
  });

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setValidation(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import questions from CSV</DialogTitle>
          <DialogDescription>
            Required columns: program, module, topic, difficulty, questionText, options,
            correctOption, explanation, marks, negativeMarks, tags. Separate options with a pipe
            (|).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <FileUp className="size-4" />
              Choose file
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCsv(sampleCsv)}>
              Use sample CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void handleFile(event)}
            />
          </div>

          <Textarea
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setValidation(null);
            }}
            rows={8}
            placeholder="Paste CSV content with a header row…"
            className="font-mono text-xs"
            aria-label="CSV content"
          />

          {validation ? (
            <div className="space-y-3">
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  validation.valid
                    ? "border-success/25 bg-success-soft text-success"
                    : "border-destructive/25 bg-destructive-soft text-destructive"
                }`}
              >
                {validation.valid ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  {validation.valid
                    ? `${validation.rowCount} row${validation.rowCount === 1 ? "" : "s"} ready to import.`
                    : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} found.`}
                </span>
              </div>

              {validation.errors.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-3">
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {validation.errors.slice(0, 50).map((issue, index) => (
                      <li key={`${issue.row}-${issue.field}-${index}`}>
                        Row {issue.row} · {issue.field}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {validation.rows.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                  <ul className="space-y-2 text-xs">
                    {validation.rows.slice(0, 25).map((row) => (
                      <li key={row.row} className="space-y-0.5">
                        <span className="font-medium text-foreground">
                          Row {row.row} · {truncate(row.questionText, 90)}
                        </span>
                        <span className="block text-muted-foreground">
                          {row.program} · {row.module} · {row.difficulty} · correct option{" "}
                          {row.correctOption + 1}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={csv.trim().length === 0 || validate.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Validate
          </Button>
          <Button
            type="button"
            disabled={!validation?.valid || commit.isPending}
            onClick={() => commit.mutate()}
          >
            {commit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import {validation?.rowCount ?? 0} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
