/* MediaPipe runs here so image detection does not block poster editing. */
// This MediaPipe build reads document while calculating its mobile hint.
if (typeof document === 'undefined') self.document = {};
importScripts('vendor/mediapipe/face_detection/face_detection.js');

let detector = null;
let detectorReady = false;
let maxDimension = 1600;
let activeRequestId = null;
let resolveRequest = null;
let requestTimer = null;
let sourceW = 0;
let sourceH = 0;

function finishRequest(id, face) {
  if (activeRequestId !== id || !resolveRequest) return;
  clearTimeout(requestTimer);
  requestTimer = null;
  const resolve = resolveRequest;
  resolveRequest = null;
  resolve(face);
}

async function initDetector() {
  detector = new FaceDetection({
    locateFile: (file) => `vendor/mediapipe/face_detection/${file}`,
  });
  detector.setOptions({
    model: 'short',
    minDetectionConfidence: 0.5,
  });
  detector.onResults((results) => {
    if (activeRequestId === null || !resolveRequest) return;
    if (!results.detections || results.detections.length === 0) {
      finishRequest(activeRequestId, null);
      return;
    }

    const d = results.detections[0];
    const lm = d.landmarks.map(p => ({ x: p.x * sourceW, y: p.y * sourceH }));
    // landmarks: 0=leftEye, 1=rightEye, 2=noseTip, 3=mouth, 4=leftEar, 5=rightEar
    const leftEye = lm[0], rightEye = lm[1];
    const mouth = lm[3], leftEar = lm[4], rightEar = lm[5];
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const cx = Number.isFinite(d.boundingBox?.xCenter)
      ? d.boundingBox.xCenter * sourceW
      : eyeCenterX;
    const eyesMidY = (leftEye.y + rightEye.y) / 2;
    const cy = eyesMidY + (mouth.y - eyesMidY) * 0.45;
    const earDist = Math.abs(rightEar.x - leftEar.x);
    const eyeDist = Math.abs(rightEye.x - leftEye.x);
    const faceW = earDist > eyeDist * 0.6 ? earDist * 1.1 : eyeDist * 2.8;
    finishRequest(activeRequestId, { cx, cy, faceW, W: sourceW, H: sourceH });
  });
  await detector.initialize();
  detectorReady = true;
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === 'init') {
    maxDimension = Number.isFinite(message.maxDimension) ? message.maxDimension : 1600;
    try {
      await initDetector();
    } catch (error) {
      self.postMessage({ type: 'init-error', message: error?.message || String(error) });
    }
    return;
  }

  if (message.type !== 'detect' || !detectorReady || !message.bitmap) return;
  const { id, bitmap } = message;
  if (activeRequestId !== null) {
    bitmap.close?.();
    self.postMessage({ type: 'error', id, message: 'Face detector is busy' });
    return;
  }

  activeRequestId = id;
  try {
    sourceW = bitmap.width;
    sourceH = bitmap.height;
    const scale = Math.min(1, maxDimension / Math.max(sourceW, sourceH));
    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const result = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    requestTimer = setTimeout(() => finishRequest(id, null), 6000);
    try {
      const sendResult = detector.send({ image: canvas });
      if (sendResult?.catch) sendResult.catch(() => finishRequest(id, null));
    } catch (_) {
      finishRequest(id, null);
    }
    const face = await result;
    self.postMessage({ type: 'result', id, face });
  } catch (error) {
    bitmap.close?.();
    finishRequest(id, null);
    self.postMessage({ type: 'error', id, message: error?.message || String(error) });
  } finally {
    activeRequestId = null;
    resolveRequest = null;
    clearTimeout(requestTimer);
    requestTimer = null;
  }
};
