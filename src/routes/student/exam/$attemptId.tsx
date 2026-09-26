import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Expand,
  Flag,
  Loader2,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  autoSubmitAttempt,
  logIntegrityEvent,
  proctoringStatus,
  saveAnswer,
  setFlag,
  submitAttempt,
  updateAttemptProgress,
  uploadProctoringArtifact,
} from "@/lib/api";
import type { StudentPaperQuestionDto, SubmissionReceiptDto } from "@/lib/api";
import { errorMessage } from "@/lib/client-errors";
import { formatClock, formatDuration } from "@/lib/format";
import {
  AttentionMonitor,
  captureSnapshot,
  createClientEventId,
  enterFullscreen,
  exitFullscreen,
  faceDetectionSupported,
  idleAttention,
  isFullscreen,
  listCameras,
  recordClip,
  startProctoringMedia,
  stopStream,
  type AttentionReading,
  type CameraOption,
  type IntegrityEventTypeName,
  type MediaFailureReason,
} from "@/lib/proctoring";
import { paperQuery, studentResultsQuery } from "@/lib/queries";

export const Route = createFileRoute("/student/exam/$attemptId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(paperQuery(params.attemptId)),
  component: ExamRunner,
});

type QueuedEvent = {
  clientEventId: string;
  eventType: IntegrityEventTypeName;
  durationSec?: number;
  metadata?: Record<string, string | number | boolean>;
};

const heartbeatIntervalMs = 15_000;
const flushIntervalMs = 5_000;
const fullscreenExitLimit = 2;
/** One stored frame every 30s while the camera is live. */
const snapshotIntervalMs = 30_000;
/** How often attention is sampled. FaceDetector is cheap, so this can stay tight. */
const attentionIntervalMs = 1_500;
/** Consecutive bad readings before a violation is recorded. */
const attentionStrikeLimit = 3;
/** Length of the clip recorded when a violation is confirmed. */
const clipDurationMs = 4_000;

/** Which integrity signal a sustained attention failure maps to. */
function violationEventFor(state: AttentionReading["state"]): IntegrityEventTypeName | null {
  switch (state) {
    case "no_face":
      return "FACE_ABSENT";
    case "multiple_faces":
      return "MULTIPLE_FACES";
    case "looking_away":
      return "LOOKING_AWAY";
    case "too_close":
      return "FACE_TOO_CLOSE";
    default:
      return null;
  }
}

function attentionWarning(state: AttentionReading["state"]): string {
  switch (state) {
    case "no_face":
      return "We could not see your face. Make sure you are in frame of the camera.";
    case "multiple_faces":
      return "More than one person was detected. Only the candidate may be in frame.";
    case "looking_away":
      return "Please face the screen. Looking away has been recorded.";
    case "too_close":
      return "Please move back so your whole face is visible to the camera.";
    default:
      return "Attention check failed.";
  }
}

function attentionBadge(state: AttentionReading["state"]): { label: string; tone: string } {
  switch (state) {
    case "ok":
      return { label: "Watching screen", tone: "text-success" };
    case "no_face":
      return { label: "No face detected", tone: "text-destructive" };
    case "multiple_faces":
      return { label: "Multiple people", tone: "text-destructive" };
    case "looking_away":
      return { label: "Looking away", tone: "text-warning" };
    case "too_close":
      return { label: "Too close", tone: "text-warning" };
    default:
      return { label: "Attention check unavailable", tone: "text-muted-foreground" };
  }
}

function ExamRunner() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: paper } = useSuspenseQuery(paperQuery(attemptId));

  const security = paper.assessment.security;
  const questions = paper.questions;
  const totalQuestions = questions.length;

  const [answers, setAnswers] = useState<Record<string, string | null>>(() => ({
    ...paper.savedAnswers,
  }));
  const [flagged, setFlaggedState] = useState<string[]>(() => [...paper.flagged]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remaining, setRemaining] = useState(() => paper.remainingSec);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cameraError, setCameraError] = useState<{
    reason: MediaFailureReason;
    message: string;
  } | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | null>(null);
  const [attention, setAttention] = useState<AttentionReading>(idleAttention);
  const [evidenceStored, setEvidenceStored] = useState<number | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [eventCount, setEventCount] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceiptDto | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * The live stream as state, not only as a ref. The preview element needs the
   * stream during render/effect time; setting `srcObject` imperatively from
   * inside an async camera-start raced the ref being attached, which left the
   * video without dimensions and silently defeated every snapshot.
   */
  const [stream, setStream] = useState<MediaStream | null>(null);
  /** True once the preview can actually produce a frame (readyState >= 2). */
  const [videoReady, setVideoReady] = useState(false);
  const queueRef = useRef<QueuedEvent[]>([]);
  const fullscreenExitsRef = useRef(0);
  const submittingRef = useRef(false);
  const deadlineRef = useRef(Date.now() + paper.remainingSec * 1000);
  const monitorRef = useRef<AttentionMonitor | null>(null);
  const attentionRef = useRef<AttentionReading>(idleAttention);
  const strikesRef = useRef<{ state: AttentionReading["state"]; count: number }>({
    state: "ok",
    count: 0,
  });
  const storedCountRef = useRef(0);
  /**
   * Tri-state on purpose. Evidence must never be discarded just because the
   * one-off status probe has not answered yet, so uploads are only skipped
   * once we positively know storage is unavailable.
   */
  const storageEnabledRef = useRef<"unknown" | "yes" | "no">("unknown");
  /** Set the moment the paper is submitted; no further frames may be captured. */
  const captureClosedRef = useRef(false);
  const clipRecorderRef = useRef<ReturnType<typeof recordClip>>(null);

  const current = questions[currentIndex];
  const answeredCount = useMemo(
    () => questions.filter((question) => (answers[question.id] ?? null) !== null).length,
    [questions, answers],
  );
  const progress = totalQuestions === 0 ? 0 : Math.round((answeredCount / totalQuestions) * 100);

  /* ---------------------------------------------------------------------- */
  /* Offline answer queue                                                    */
  /* ---------------------------------------------------------------------- */

  const pendingKey = `careerveda:pending-answers:${attemptId}`;
  const pendingRef = useRef<Record<string, string | null>>({});
  const [unsynced, setUnsynced] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(pendingKey);
      if (raw) pendingRef.current = JSON.parse(raw) as Record<string, string | null>;
    } catch {
      // A corrupt queue must never block the exam; it is simply rebuilt.
    }
    setUnsynced(Object.keys(pendingRef.current).length);
  }, [pendingKey]);

  const persistPending = useCallback(() => {
    try {
      const entries = Object.entries(pendingRef.current);
      if (entries.length === 0) window.localStorage.removeItem(pendingKey);
      else window.localStorage.setItem(pendingKey, JSON.stringify(pendingRef.current));
    } catch {
      // Storage can be unavailable in private mode; the in-memory queue still works.
    }
    setUnsynced(Object.keys(pendingRef.current).length);
  }, [pendingKey]);

  const queueAnswer = useCallback(
    (questionId: string, optionId: string | null) => {
      pendingRef.current[questionId] = optionId;
      persistPending();
    },
    [persistPending],
  );

  const dequeueAnswer = useCallback(
    (questionId: string) => {
      if (pendingRef.current[questionId] === undefined) return;
      delete pendingRef.current[questionId];
      persistPending();
    },
    [persistPending],
  );

  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    const entries = Object.entries(pendingRef.current);
    if (entries.length === 0) return;
    syncingRef.current = true;
    try {
      for (const [questionId, optionId] of entries) {
        try {
          await saveAnswer({ data: { attemptId, questionId, selectedOptionId: optionId } });
          delete pendingRef.current[questionId];
        } catch {
          // Still unreachable: keep the rest queued and retry on the next tick.
          break;
        }
      }
    } finally {
      syncingRef.current = false;
      persistPending();
    }
  }, [attemptId, persistPending]);

  useEffect(() => {
    void syncPending();
  }, [syncPending]);

  useEffect(() => {
    const onReconnect = () => void syncPending();
    window.addEventListener("online", onReconnect);
    return () => window.removeEventListener("online", onReconnect);
  }, [syncPending]);

  /* ---------------------------------------------------------------------- */
  /* Integrity event plumbing                                                */
  /* ---------------------------------------------------------------------- */

  const enqueue = useCallback(
    (
      eventType: IntegrityEventTypeName,
      options?: { durationSec?: number; metadata?: Record<string, string | number | boolean> },
    ) => {
      const event: QueuedEvent = {
        clientEventId: createClientEventId(),
        eventType,
        ...(options ?? {}),
      };
      queueRef.current.push(event);
    },
    [],
  );

  const flush = useCallback(async () => {
    const batch = queueRef.current.splice(0, 50);
    if (batch.length === 0) return;
    try {
      const result = await logIntegrityEvent({ data: { attemptId, events: batch } });
      setEventCount(result.eventCount);
      if (result.integrityStatus === "Flagged") {
        setWarning(
          "This attempt has been flagged for administrator review. Stay on this page and keep your camera visible.",
        );
      }
    } catch (error) {
      // Put the batch back so nothing is silently lost.
      queueRef.current.unshift(...batch);
      if (batch.length > 0) {
        console.warn("Failed to deliver integrity events", errorMessage(error));
      }
    }
  }, [attemptId]);

  /* ---------------------------------------------------------------------- */
  /* Media setup                                                            */
  /* ---------------------------------------------------------------------- */

  const startCamera = useCallback(
    async (deviceId: string | null) => {
      // Never re-acquire the camera once the paper has been submitted: the
      // effect that calls this re-runs whenever its dependencies change, and
      // that would silently resume recording a graded attempt.
      if (captureClosedRef.current) return;
      setStartingCamera(true);
      const result = await startProctoringMedia({
        camera: security.cameraRequired,
        microphone: security.microphoneRequired,
        cameraDeviceId: deviceId,
      });
      setStartingCamera(false);

      if (!result.ok) {
        stopStream(streamRef.current);
        streamRef.current = null;
        setCameraOn(false);
        setMicOn(false);
        setCameraError({ reason: result.reason, message: result.message });
        if (security.cameraRequired) {
          enqueue("CAMERA_DISABLED", { metadata: { reason: result.reason } });
        }
        if (security.microphoneRequired) {
          enqueue("MICROPHONE_DISABLED", { metadata: { reason: result.reason } });
        }
        return;
      }

      const stream = result.stream;
      streamRef.current = stream;
      setStream(stream);
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      setCameraOn(videoTracks.length > 0 && videoTracks[0]?.readyState === "live");
      setMicOn(audioTracks.length > 0 && audioTracks[0]?.readyState === "live");
      setCameraError(null);
      setCameras(await listCameras());

      for (const track of videoTracks) {
        track.addEventListener("ended", () => {
          setCameraOn(false);
          enqueue("CAMERA_STREAM_INTERRUPTED");
          toast.error("Camera stream stopped — please restore camera access.");
        });
      }
      for (const track of audioTracks) {
        track.addEventListener("ended", () => {
          setMicOn(false);
          enqueue("MICROPHONE_DISABLED");
        });
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
    },
    [enqueue, security.cameraRequired, security.microphoneRequired],
  );

  useEffect(() => {
    if (!security.cameraRequired && !security.microphoneRequired) return;
    void startCamera(cameraDeviceId);

    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
      clipRecorderRef.current?.cancel();
      clipRecorderRef.current = null;
      monitorRef.current?.dispose();
      monitorRef.current = null;
    };
    // Switching cameras calls startCamera directly; restarting on device change would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  const switchCamera = useCallback(
    async (deviceId: string) => {
      setCameraDeviceId(deviceId);
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraOn(false);
      await startCamera(deviceId);
    },
    [startCamera],
  );

  /* ---------------------------------------------------------------------- */
  /* Evidence capture + upload                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    void proctoringStatus()
      .then((status) => {
        storageEnabledRef.current = status.configured ? "yes" : "no";
        if (!status.configured) {
          setStorageNotice(
            "Evidence storage is not configured on this deployment — integrity signals are still being recorded.",
          );
        }
      })
      .catch(() => {
        // Unknown, not "no": let the first upload decide rather than dropping evidence.
        storageEnabledRef.current = "unknown";
      });
  }, []);

  const uploadArtifact = useCallback(
    async (
      artifact: {
        kind: "snapshot" | "clip";
        mimeType: "image/jpeg" | "video/webm";
        data: string;
        byteSize: number;
        capturedAt: string;
      },
      reason: IntegrityEventTypeName | "interval" | "manual",
      reading: AttentionReading,
    ) => {
      if (storageEnabledRef.current === "no") return;
      if (captureClosedRef.current) return;
      try {
        const response = await uploadProctoringArtifact({
          data: {
            attemptId,
            assessmentId: paper.assessment.id,
            kind: artifact.kind,
            reason,
            mimeType: artifact.mimeType,
            capturedAt: artifact.capturedAt,
            data: artifact.data,
            faceCount: reading.faceCount,
            attentionScore: reading.score,
            metadata: { byteSize: artifact.byteSize },
          },
        });
        if (response.status === "stored") {
          storedCountRef.current += 1;
          setEvidenceStored(storedCountRef.current);
          setStorageNotice(null);
        } else {
          setStorageNotice(
            response.failure.hint
              ? `${response.failure.message} ${response.failure.hint}`
              : response.failure.message,
          );
        }
      } catch (error) {
        console.warn("Could not store proctoring evidence", errorMessage(error));
      }
    },
    [attemptId, paper.assessment.id],
  );

  const startViolationClip = useCallback(
    (reason: IntegrityEventTypeName) => {
      const video = videoRef.current;
      if (!video || clipRecorderRef.current || captureClosedRef.current) return;
      const recorder = recordClip(video, clipDurationMs);
      if (!recorder) return;
      clipRecorderRef.current = recorder;
      window.setTimeout(() => {
        void recorder.finish().then((clip) => {
          clipRecorderRef.current = null;
          if (clip && !captureClosedRef.current) {
            void uploadArtifact(clip, reason, attentionRef.current);
          }
        });
      }, clipDurationMs);
    },
    [uploadArtifact],
  );

  /* ---------------------------------------------------------------------- */
  /* Attention monitoring                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !video) return;
    if (!faceDetectionSupported()) {
      setAttention({ ...idleAttention, state: "unavailable", detector: "none" });
      return;
    }

    const monitor = new AttentionMonitor(video);
    monitorRef.current = monitor;
    setAttention({ ...idleAttention, detector: "face_detector" });

    const timer = window.setInterval(() => {
      void monitor.read().then((reading) => {
        attentionRef.current = reading;
        setAttention(reading);

        if (reading.state === "ok" || reading.state === "unavailable") {
          strikesRef.current = { state: "ok", count: 0 };
          return;
        }

        const previous = strikesRef.current;
        const count = previous.state === reading.state ? previous.count + 1 : 1;
        strikesRef.current = { state: reading.state, count };
        // A single bad frame is noise; three in a row is a signal worth recording.
        if (count < attentionStrikeLimit) return;

        strikesRef.current = { state: "ok", count: 0 };
        const eventType = violationEventFor(reading.state);
        if (!eventType) return;
        enqueue(eventType, {
          metadata: { faceCount: reading.faceCount, score: reading.score ?? -1 },
        });
        startViolationClip(eventType);
        setWarning(attentionWarning(reading.state));
      });
    }, attentionIntervalMs);

    return () => {
      window.clearInterval(timer);
      monitor.dispose();
      monitorRef.current = null;
    };
  }, [cameraOn, enqueue, startViolationClip]);

  /* ---------------------------------------------------------------------- */
  /* Periodic snapshots                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;

    const grab = async () => {
      const video = videoRef.current;
      if (!video || cancelled || captureClosedRef.current) return;
      const snapshot = await captureSnapshot(video);
      if (snapshot && !cancelled && !captureClosedRef.current) {
        void uploadArtifact(snapshot, "interval", attentionRef.current);
      }
    };

    const timer = window.setInterval(() => void grab(), snapshotIntervalMs);
    void grab();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraOn, uploadArtifact]);

  /* ---------------------------------------------------------------------- */
  /* Fullscreen                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!security.fullscreenRequired) return;

    const onChange = () => {
      if (isFullscreen()) {
        fullscreenExitsRef.current = 0;
        return;
      }
      fullscreenExitsRef.current += 1;
      enqueue("FULLSCREEN_EXIT", {
        metadata: { exitCount: fullscreenExitsRef.current },
      });
      if (fullscreenExitsRef.current >= fullscreenExitLimit) {
        enqueue("MULTIPLE_FULLSCREEN_EXITS", {
          metadata: { exitCount: fullscreenExitsRef.current },
        });
      }
      setWarning("Fullscreen was exited. Return to fullscreen to continue the assessment.");
      void enterFullscreen(document.documentElement);
    };

    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [enqueue, security.fullscreenRequired]);

  /* ---------------------------------------------------------------------- */
  /* Focus / network listeners                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && security.detectTabSwitch) {
        enqueue("TAB_SWITCH");
        setWarning("Leaving this tab is recorded as an integrity signal.");
      }
    };
    const onBlur = () => {
      if (security.detectWindowBlur) enqueue("WINDOW_BLUR");
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      enqueue("NETWORK_INTERRUPTION");
      setWarning("You are offline. Your answers are kept locally until the connection returns.");
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enqueue, security.detectTabSwitch, security.detectWindowBlur]);

  /* ---------------------------------------------------------------------- */
  /* Countdown + auto submit                                                */
  /* ---------------------------------------------------------------------- */

  const finalise = useCallback(
    async (mode: "manual" | "auto") => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await flush();
        // Replay anything the queue still holds so the graded paper is complete.
        await syncPending();
        const result =
          mode === "auto"
            ? await autoSubmitAttempt({ data: { attemptId } })
            : await submitAttempt({ data: { attemptId, mode: "manual" } });
        setReceipt(result);
        setSubmitOpen(false);
        // The attempt is closed; anything still queued has been accepted or lost with it.
        pendingRef.current = {};
        persistPending();
        // Release the camera and stop evidence capture. The paper is graded, so
        // any further frame would be recording a candidate who is no longer
        // under assessment. Flipping cameraOn/micOn also tears down the
        // snapshot interval and the attention monitor.
        captureClosedRef.current = true;
        clipRecorderRef.current?.cancel();
        clipRecorderRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        setCameraOn(false);
        setMicOn(false);
        setCameraError(null);
        void exitFullscreen();
        await queryClient.invalidateQueries({ queryKey: studentResultsQuery().queryKey });
        await queryClient.invalidateQueries({ queryKey: ["student", "dashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["student", "assessment-list"] });
      } catch (error) {
        submittingRef.current = false;
        setSubmitting(false);
        setSubmitError(errorMessage(error, "Could not submit the paper. Try again."));
      }
    },
    [attemptId, flush, persistPending, queryClient, syncPending],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && !submittingRef.current) {
        window.clearInterval(timer);
        if (security.autoSubmitOnExpiry) {
          toast.warning("Time is up — submitting your paper.");
          void finalise("auto");
        } else {
          submittingRef.current = true;
          setSubmitting(true);
          void flush().then(() => {
            setSubmitError("Time is up. Your saved answers stand as submitted.");
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finalise, flush, security.autoSubmitOnExpiry]);

  /* ---------------------------------------------------------------------- */
  /* Heartbeat + event flushing                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const timer = window.setInterval(() => {
      void updateAttemptProgress({
        data: {
          attemptId,
          currentQuestionIndex: currentIndex,
          cameraActive: cameraOn,
          microphoneActive: micOn,
          online: navigator.onLine,
        },
      }).catch(() => undefined);
    }, heartbeatIntervalMs);
    return () => window.clearInterval(timer);
  }, [attemptId, cameraOn, currentIndex, micOn]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void flush();
    }, flushIntervalMs);
    return () => {
      window.clearInterval(timer);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (receipt) return;
    void updateAttemptProgress({ data: { attemptId, currentQuestionIndex: currentIndex } }).catch(
      () => undefined,
    );
  }, [attemptId, currentIndex, receipt]);

  /* ---------------------------------------------------------------------- */
  /* Answering                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * A dropped connection must never cost a candidate their answer, so a failed
   * save keeps the selection, parks it in a local queue keyed by question (which
   * makes retries idempotent — the latest choice always wins), and replays the
   * queue as soon as connectivity returns.
   */
  const chooseOption = async (question: StudentPaperQuestionDto, displayedIndex: number) => {
    const optionId = question.optionIds[displayedIndex] ?? null;
    setAnswers((current) => ({ ...current, [question.id]: optionId }));
    queueAnswer(question.id, optionId);
    try {
      await saveAnswer({
        data: { attemptId, questionId: question.id, selectedOptionId: optionId },
      });
      dequeueAnswer(question.id);
    } catch (error) {
      toast.error(errorMessage(error, "Saved on this device — it will sync when you reconnect"));
    }
  };

  const clearAnswer = async (question: StudentPaperQuestionDto) => {
    setAnswers((current) => ({ ...current, [question.id]: null }));
    queueAnswer(question.id, null);
    try {
      await saveAnswer({ data: { attemptId, questionId: question.id, selectedOptionId: null } });
      dequeueAnswer(question.id);
    } catch (error) {
      toast.error(errorMessage(error, "Saved on this device — it will sync when you reconnect"));
    }
  };

  const toggleFlag = async (question: StudentPaperQuestionDto) => {
    const next = !flagged.includes(question.id);
    setFlaggedState((current) =>
      next ? [...current, question.id] : current.filter((id) => id !== question.id),
    );
    try {
      await setFlag({ data: { attemptId, questionId: question.id, flagged: next } });
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the review flag"));
    }
  };

  const goTo = (index: number) => {
    if (index < 0) return;
    if (index >= totalQuestions) return;
    setCurrentIndex(index);
  };

  /* ---------------------------------------------------------------------- */
  /* Submitted state                                                        */
  /* ---------------------------------------------------------------------- */

  if (receipt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <CardTitle className="mt-2 text-xl">Paper submitted</CardTitle>
            <CardDescription>
              {receipt.autoSubmitted
                ? "Your paper was submitted automatically when the time expired."
                : "Thank you — your responses have been recorded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Assessment</dt>
                <dd className="font-medium text-foreground">{receipt.assessmentTitle}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Submission ID</dt>
                <dd className="truncate font-mono text-xs text-foreground">
                  {receipt.submissionId}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Answered</dt>
                <dd className="font-medium text-foreground">
                  {receipt.answered} of {receipt.totalQuestions}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Integrity signals</dt>
                <dd className="font-medium text-foreground">{eventCount}</dd>
              </div>
            </dl>
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
              {paper.integrityAdvisory}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  void navigate({ to: "/student/assessments" });
                }}
              >
                Back to assessments
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  void navigate({ to: "/student/results" });
                }}
              >
                My results
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lowTime = remaining <= 60;
  const criticalTime = remaining <= 300;
  const canGoBack = paper.assessment.navigationMode === "free" || !security.disableBackNavigation;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur no-select">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {paper.assessment.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Question {currentIndex + 1} of {totalQuestions} · {answeredCount} answered
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {security.cameraRequired ? (
              <span
                title={cameraOn ? "Camera on" : "Camera off"}
                className={`flex size-8 items-center justify-center rounded-md ${
                  cameraOn ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
                }`}
              >
                {cameraOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              </span>
            ) : null}
            {security.microphoneRequired ? (
              <span
                title={micOn ? "Microphone on" : "Microphone off"}
                className={`flex size-8 items-center justify-center rounded-md ${
                  micOn ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
                }`}
              >
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </span>
            ) : null}
            {!online ? (
              <span className="flex size-8 items-center justify-center rounded-md bg-warning-soft text-warning">
                <WifiOff className="size-4" />
              </span>
            ) : null}
            {security.fullscreenRequired ? (
              <span
                title="Fullscreen required"
                className={`flex size-8 items-center justify-center rounded-md ${
                  isFullscreen() ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                }`}
              >
                <Expand className="size-4" />
              </span>
            ) : null}
          </div>

          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums ${
              criticalTime
                ? "border-destructive/30 bg-destructive-soft text-destructive"
                : lowTime
                  ? "border-warning/30 bg-warning-soft text-warning"
                  : "border-border bg-surface text-foreground"
            }`}
            role="timer"
            aria-live="off"
          >
            {formatClock(remaining)}
          </div>

          <Button type="button" size="sm" onClick={() => setSubmitOpen(true)}>
            <Send className="size-4" />
            Submit
          </Button>
        </div>
        <Progress value={progress} className="h-1 rounded-none" />
      </header>

      {warning ? (
        <div className="border-b border-warning/30 bg-warning-soft px-4 py-2.5">
          <p className="mx-auto flex max-w-6xl items-start gap-2 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {warning}
            <button
              type="button"
              className="ml-auto shrink-0 underline"
              onClick={() => setWarning(null)}
            >
              Dismiss
            </button>
          </p>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            {current ? (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {current.topic} · {current.marks} marks
                    {current.negativeMarks > 0
                      ? ` · −${current.negativeMarks} for a wrong answer`
                      : ""}
                  </p>
                  <h1 className="text-lg leading-relaxed font-medium text-foreground">
                    {current.questionText}
                  </h1>
                </div>

                <ul className="space-y-2.5">
                  {current.options.map((option, index) => {
                    const optionId = current.optionIds[index] ?? null;
                    const selected = answers[current.id] === optionId && optionId !== null;
                    return (
                      <li key={optionId ?? index}>
                        <button
                          type="button"
                          onClick={() => void chooseOption(current, index)}
                          className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                            selected
                              ? "border-primary bg-primary-soft"
                              : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border-strong text-muted-foreground"
                            }`}
                          >
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="text-sm leading-relaxed text-foreground">{option}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center gap-2">
                  {answers[current.id] ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void clearAnswer(current)}
                    >
                      Clear answer
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={flagged.includes(current.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => void toggleFlag(current)}
                  >
                    <Flag className="size-4" />
                    {flagged.includes(current.id) ? "Flagged for review" : "Flag for review"}
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          {security.cameraRequired || security.microphoneRequired ? (
            <Card>
              <CardContent className="space-y-3 p-3">
                <div className="relative overflow-hidden rounded-lg bg-slate-950">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    className="aspect-video w-full -scale-x-100 object-cover"
                    aria-label="Proctoring camera preview"
                  />
                  {security.cameraRequired && !cameraOn ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/85 px-3 text-center text-xs text-white/70">
                      <CameraOff className="size-4" />
                      {cameraError ? "Camera blocked" : "Camera unavailable"}
                    </div>
                  ) : null}
                  {cameraOn ? (
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 rounded-md bg-slate-950/70 px-1.5 py-1 text-[10px] font-semibold text-white">
                      <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                      REC
                    </div>
                  ) : null}
                </div>

                {cameraError ? (
                  <div className="space-y-2 rounded-lg border border-destructive/25 bg-destructive-soft p-2.5">
                    <p className="text-[11px] leading-relaxed text-destructive">
                      {cameraError.message}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={startingCamera}
                      onClick={() => void startCamera(cameraDeviceId)}
                    >
                      {startingCamera ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Camera className="size-4" />
                      )}
                      {startingCamera ? "Starting…" : "Retry camera"}
                    </Button>
                  </div>
                ) : null}

                {cameras.length > 1 ? (
                  <select
                    aria-label="Camera device"
                    value={cameraDeviceId ?? ""}
                    onChange={(event) => void switchCamera(event.target.value)}
                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                  >
                    {cameras.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                <div className="space-y-1 text-center text-[11px] text-muted-foreground">
                  <p className={`font-semibold ${attentionBadge(attention.state).tone}`}>
                    {attentionBadge(attention.state).label}
                  </p>
                  <p>
                    Frames are stored for administrator review
                    {evidenceStored !== null ? ` · ${evidenceStored} uploaded` : ""}
                  </p>
                  {storageNotice ? (
                    <p className="text-warning" title={storageNotice}>
                      {storageNotice}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Question navigator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((question, index) => {
                  const isAnswered = (answers[question.id] ?? null) !== null;
                  const isFlagged = flagged.includes(question.id);
                  const isCurrent = index === currentIndex;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => goTo(index)}
                      className={`relative flex size-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                        isCurrent
                          ? "border-primary bg-primary text-primary-foreground"
                          : isAnswered
                            ? "border-success/30 bg-success-soft text-success"
                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {index + 1}
                      {isFlagged ? (
                        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-warning" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-success/30" />{" "}
                  Answered
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-card ring-1 ring-border" /> Not answered
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-warning" /> Flagged for review
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                {paper.integrityAdvisory}
              </p>
              <p>
                Started {formatDuration(paper.assessment.duration * 60 - paper.remainingSec)} ago ·{" "}
                {eventCount} signal{eventCount === 1 ? "" : "s"} recorded
              </p>
              {unsynced > 0 || !online ? (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-lg bg-warning-soft px-2.5 py-2 text-warning"
                >
                  {online ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <WifiOff className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  {online
                    ? `Syncing ${unsynced} saved answer${unsynced === 1 ? "" : "s"}…`
                    : `Connection interrupted. ${unsynced} answer${unsynced === 1 ? "" : "s"} held on this device and will sync automatically.`}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur no-select">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={!canGoBack || currentIndex === 0}
            onClick={() => goTo(currentIndex - 1)}
          >
            <ArrowLeft className="size-4" />
            Previous
          </Button>
          <p className="text-xs text-muted-foreground">
            {flagged.length > 0
              ? `${flagged.length} flagged for review`
              : `${answeredCount} answered`}
          </p>
          {currentIndex < totalQuestions - 1 ? (
            <Button type="button" onClick={() => goTo(currentIndex + 1)}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={() => setSubmitOpen(true)}>
              Review &amp; submit
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit your paper?</DialogTitle>
            <DialogDescription>
              You answered {answeredCount} of {totalQuestions} questions
              {flagged.length > 0 ? `, with ${flagged.length} flagged for review` : ""}. After
              submitting you cannot change your answers.
            </DialogDescription>
          </DialogHeader>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}

          <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-3">
            <div className="grid grid-cols-8 gap-1.5">
              {questions.map((question, index) => {
                const isAnswered = (answers[question.id] ?? null) !== null;
                return (
                  <span
                    key={question.id}
                    className={`flex size-7 items-center justify-center rounded-md text-[11px] font-semibold ${
                      isAnswered ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)}>
              Keep working
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                setSubmitOpen(false);
                void finalise("manual");
              }}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Submit paper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
