/** Browser-side proctoring helpers shared by the pre-flight check and the exam runner. */

export type IntegrityEventTypeName =
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "FULLSCREEN_EXIT"
  | "CAMERA_DISABLED"
  | "MICROPHONE_DISABLED"
  | "CAMERA_STREAM_INTERRUPTED"
  | "MULTIPLE_FULLSCREEN_EXITS"
  | "NETWORK_INTERRUPTION"
  | "FACE_ABSENT"
  | "MULTIPLE_FACES"
  | "LOOKING_AWAY"
  | "FACE_TOO_CLOSE"
  | "ATTENTION_WARNING";

export function createClientEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type DeviceCheck = {
  camera: "granted" | "denied" | "unsupported" | "idle";
  microphone: "granted" | "denied" | "unsupported" | "idle";
  fullscreen: "granted" | "denied" | "unsupported" | "idle";
};

export const idleDeviceCheck: DeviceCheck = {
  camera: "idle",
  microphone: "idle",
  fullscreen: "idle",
};

/** Why a camera/microphone request failed, in terms a candidate can act on. */
export type MediaFailureReason =
  | "insecure_context"
  | "permission_denied"
  | "no_device"
  | "device_busy"
  | "unsupported"
  | "unknown";

export type MediaStartResult =
  { ok: true; stream: MediaStream } | { ok: false; reason: MediaFailureReason; message: string };

export function mediaFailureMessage(reason: MediaFailureReason): string {
  switch (reason) {
    case "insecure_context":
      return "Camera access needs a secure page. Open the exam on https:// or on localhost.";
    case "permission_denied":
      return "Camera permission was blocked. Allow it in your browser's site settings, then retry.";
    case "no_device":
      return "No camera was found. Connect a camera and retry.";
    case "device_busy":
      return "The camera is already in use by another application. Close it and retry.";
    case "unsupported":
      return "This browser does not support camera capture.";
    default:
      return "The camera could not be started. Check your browser's site settings and retry.";
  }
}

function classifyMediaError(error: unknown): MediaFailureReason {
  if (typeof navigator !== "undefined" && !window.isSecureContext) return "insecure_context";
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
      return "device_busy";
    default:
      return "unknown";
  }
}

export type MediaRequest = {
  camera: boolean;
  microphone: boolean;
  /** deviceId from enumerateDevices(), when the candidate picked a specific camera. */
  cameraDeviceId?: string | null;
};

function mediaConstraints(request: MediaRequest): MediaStreamConstraints {
  return {
    video: request.camera
      ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 30 },
          ...(request.cameraDeviceId ? { deviceId: { exact: request.cameraDeviceId } } : {}),
        }
      : false,
    audio: request.microphone,
  };
}

export function mediaDevicesSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function isSecureMediaContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

/**
 * Start camera/microphone capture and report *why* it failed. `probeDevices` below keeps the
 * older, terse `{ camera, microphone }` shape for the pre-flight checklist.
 */
export async function startProctoringMedia(request: MediaRequest): Promise<MediaStartResult> {
  if (!mediaDevicesSupported()) {
    return {
      ok: false,
      reason: isSecureMediaContext() ? "unsupported" : "insecure_context",
      message: mediaFailureMessage(isSecureMediaContext() ? "unsupported" : "insecure_context"),
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(request));
    return { ok: true, stream };
  } catch (error) {
    const reason = classifyMediaError(error);
    return { ok: false, reason, message: mediaFailureMessage(reason) };
  }
}

export type CameraOption = { deviceId: string; label: string };

/** Cameras the browser will let us name. Labels are empty until permission has been granted. */
export async function listCameras(): Promise<CameraOption[]> {
  if (!mediaDevicesSupported()) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Ask for camera (and optionally microphone) once. Returns the live stream so the
 * caller can either keep it for proctoring or stop it immediately for a dry run.
 */
export async function probeDevices(options: {
  camera: boolean;
  microphone: boolean;
}): Promise<{ stream: MediaStream | null; check: DeviceCheck }> {
  if (!mediaDevicesSupported()) {
    return {
      stream: null,
      check: {
        camera: options.camera ? "unsupported" : "idle",
        microphone: options.microphone ? "unsupported" : "idle",
        fullscreen: "idle",
      },
    };
  }

  const check: DeviceCheck = { ...idleDeviceCheck };
  const result = await startProctoringMedia(options);
  if (result.ok) {
    if (options.camera) check.camera = "granted";
    if (options.microphone) check.microphone = "granted";
    return { stream: result.stream, check };
  }

  // Permission or hardware failure — ask again per device so the candidate
  // learns exactly which one is blocked.
  if (options.camera) {
    const video = await startProctoringMedia({ camera: true, microphone: false });
    check.camera = video.ok ? "granted" : "denied";
    if (video.ok) stopStream(video.stream);
  }
  if (options.microphone) {
    const audio = await startProctoringMedia({ camera: false, microphone: true });
    check.microphone = audio.ok ? "granted" : "denied";
    if (audio.ok) stopStream(audio.stream);
  }
  return { stream: null, check };
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.fullscreenEnabled ?? false);
}

export async function enterFullscreen(element: Element | null): Promise<boolean> {
  if (!fullscreenSupported() || !element) return false;
  try {
    await element.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.fullscreenElement);
}

export function deviceLabel(state: DeviceCheck[keyof DeviceCheck]): string {
  switch (state) {
    case "granted":
      return "Ready";
    case "denied":
      return "Blocked";
    case "unsupported":
      return "Not supported";
    default:
      return "Not checked";
  }
}

/* -------------------------------------------------------------------------- */
/* Attention monitoring                                                        */
/* -------------------------------------------------------------------------- */

export type AttentionState =
  "ok" | "no_face" | "multiple_faces" | "looking_away" | "too_close" | "unavailable";

export type AttentionReading = {
  state: AttentionState;
  faceCount: number;
  /** 0..1. Null when the detector could not produce a reading. */
  score: number | null;
  /** Fraction of the frame the face covers. */
  faceRatio: number | null;
  /** Horizontal centre of the face, 0 = left edge, 1 = right edge. */
  faceCentreX: number | null;
  detector: "face_detector" | "none";
};

export const idleAttention: AttentionReading = {
  state: "unavailable",
  faceCount: 0,
  score: null,
  faceRatio: null,
  faceCentreX: null,
  detector: "none",
};

/** The `FaceDetector` shape we rely on. Only shipped in some Chromium builds. */
type FaceDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};
type FaceDetectorConstructor = new (options?: {
  maxDetectedFaces?: number;
  fastMode?: boolean;
}) => FaceDetectorLike;

function faceDetectorConstructor(): FaceDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  return candidate ?? null;
}

export function faceDetectionSupported(): boolean {
  return faceDetectorConstructor() !== null;
}

export type AttentionThresholds = {
  /** Face smaller than this fraction of the frame counts as "not in view". */
  minFaceRatio: number;
  /** Face larger than this fraction counts as "too close". */
  maxFaceRatio: number;
  /** Centre offset (0..0.5) beyond which the candidate counts as turned away. */
  maxCentreOffset: number;
};

export const defaultThresholds: AttentionThresholds = {
  minFaceRatio: 0.02,
  maxFaceRatio: 0.62,
  maxCentreOffset: 0.22,
};

/**
 * Reads attention from a live camera frame.
 *
 * Uses the native `FaceDetector` where it exists (Chromium on some platforms). Where it does not,
 * `detect()` reports `unavailable` rather than guessing — a fabricated "the student is looking
 * away" signal would be worse than none, because it ends up in an integrity review.
 */
export class AttentionMonitor {
  private readonly video: HTMLVideoElement;
  private readonly thresholds: AttentionThresholds;
  private readonly detector: FaceDetectorLike | null;
  private busy = false;

  constructor(video: HTMLVideoElement, thresholds: Partial<AttentionThresholds> = {}) {
    this.video = video;
    this.thresholds = { ...defaultThresholds, ...thresholds };
    const Constructor = faceDetectorConstructor();
    this.detector = Constructor ? new Constructor({ maxDetectedFaces: 4, fastMode: true }) : null;
  }

  get supported(): boolean {
    return this.detector !== null;
  }

  async read(): Promise<AttentionReading> {
    if (!this.detector || this.video.readyState < 2 || this.video.videoWidth === 0) {
      return { ...idleAttention, detector: this.detector ? "face_detector" : "none" };
    }
    if (this.busy) return { ...idleAttention, detector: "face_detector" };

    this.busy = true;
    try {
      const faces = await this.detector.detect(this.video);
      const frameArea = this.video.videoWidth * this.video.videoHeight;

      if (faces.length === 0) {
        return {
          state: "no_face",
          faceCount: 0,
          score: 0,
          faceRatio: 0,
          faceCentreX: null,
          detector: "face_detector",
        };
      }
      if (faces.length > 1) {
        return {
          state: "multiple_faces",
          faceCount: faces.length,
          score: 0,
          faceRatio: null,
          faceCentreX: null,
          detector: "face_detector",
        };
      }

      const box = faces[0]?.boundingBox;
      if (!box) return { ...idleAttention, detector: "face_detector" };

      const faceRatio = (box.width * box.height) / frameArea;
      const faceCentreX = (box.x + box.width / 2) / this.video.videoWidth;
      const centreOffset = Math.abs(faceCentreX - 0.5);

      let state: AttentionState = "ok";
      if (faceRatio > this.thresholds.maxFaceRatio) state = "too_close";
      else if (
        faceRatio < this.thresholds.minFaceRatio ||
        centreOffset > this.thresholds.maxCentreOffset
      ) {
        state = "looking_away";
      }

      // Prefer a face that is well framed and centred; penalise distance and off-centre faces.
      const sizeScore = Math.min(1, faceRatio / 0.12);
      const centreScore = Math.max(0, 1 - centreOffset / this.thresholds.maxCentreOffset);
      const score = Math.max(0, Math.min(1, sizeScore * 0.6 + centreScore * 0.4));

      return { state, faceCount: 1, score, faceRatio, faceCentreX, detector: "face_detector" };
    } catch {
      return { ...idleAttention, detector: "face_detector" };
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    /* nothing retained */
  }
}

/* -------------------------------------------------------------------------- */
/* Evidence capture                                                            */
/* -------------------------------------------------------------------------- */

export type CapturedArtifact = {
  kind: "snapshot" | "clip";
  mimeType: "image/jpeg" | "video/webm";
  /** Base64, no data: prefix. */
  data: string;
  byteSize: number;
  capturedAt: string;
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Grabs a single low-resolution JPEG frame from the camera preview. */
export async function captureSnapshot(
  video: HTMLVideoElement,
  options: { width?: number; quality?: number } = {},
): Promise<CapturedArtifact | null> {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const width = options.width ?? 480;
  const height = Math.round((video.videoHeight / video.videoWidth) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", options.quality ?? 0.6),
  );
  if (!blob) return null;
  return {
    kind: "snapshot",
    mimeType: "image/jpeg",
    data: toBase64(await blob.arrayBuffer()),
    byteSize: blob.size,
    capturedAt: new Date().toISOString(),
  };
}

export type ClipRecorder = {
  /** Resolves with the clip, or null if nothing usable was recorded. */
  finish: () => Promise<CapturedArtifact | null>;
  cancel: () => void;
};

export function clipRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/**
 * Records the camera preview for `durationMs` and returns it as webm. The preview is mirrored to
 * match what the candidate sees, and only the video track is kept — no microphone audio is ever
 * captured for evidence.
 */
export function recordClip(
  video: HTMLVideoElement,
  durationMs: number,
  options: { width?: number; fps?: number } = {},
): ClipRecorder | null {
  if (!clipRecordingSupported() || video.readyState < 2 || video.videoWidth === 0) return null;

  const width = options.width ?? 480;
  const height = Math.round((video.videoHeight / video.videoWidth) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const canvasStream = canvas.captureStream(options.fps ?? 5);
  const recorder = new MediaRecorder(canvasStream, { mimeType: "video/webm" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let cancelled = false;
  const draw = () => {
    if (cancelled) return;
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();
    drawHandle = requestAnimationFrame(draw);
  };
  let drawHandle = requestAnimationFrame(draw);

  recorder.start();

  const teardown = () => {
    cancelled = true;
    if (drawHandle) cancelAnimationFrame(drawHandle);
    for (const track of canvasStream.getTracks()) track.stop();
  };

  return {
    finish: () =>
      new Promise<CapturedArtifact | null>((resolve) => {
        recorder.onstop = () => {
          teardown();
          if (cancelled || chunks.length === 0) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: "video/webm" });
          if (blob.size === 0) {
            resolve(null);
            return;
          }
          blob
            .arrayBuffer()
            .then((buffer) =>
              resolve({
                kind: "clip",
                mimeType: "video/webm",
                data: toBase64(buffer),
                byteSize: blob.size,
                capturedAt: new Date().toISOString(),
              }),
            )
            .catch(() => resolve(null));
        };
        try {
          recorder.stop();
        } catch {
          teardown();
          resolve(null);
        }
      }),
    cancel: () => {
      cancelled = true;
      teardown();
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
