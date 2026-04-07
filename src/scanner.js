/**
 * Camera barcode scanner module using html5-qrcode.
 */
import { Html5Qrcode } from 'html5-qrcode';

let html5QrCode = null;
let isScanning = false;

/**
 * Get list of available cameras.
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
export async function getCameras() {
  try {
    const devices = await Html5Qrcode.getCameras();
    return devices || [];
  } catch (err) {
    console.error('Cannot enumerate cameras:', err);
    return [];
  }
}

/**
 * Start camera scanning.
 * @param {string} elementId - HTML element ID for the scanner viewport
 * @param {string|null} cameraId - Camera device ID (null = use back camera)
 * @param {function} onSuccess - Callback: (decodedText, decodedResult) => void
 * @param {function} onError - Callback: (errorMessage) => void (optional, scan misses)
 * @param {object} options - Additional options
 */
export async function startScanner(elementId, cameraId, onSuccess, onError, options = {}) {
  if (isScanning) {
    await stopScanner();
  }

  html5QrCode = new Html5Qrcode(elementId, { verbose: false });

  const config = {
    fps: options.fps || 10,
    qrbox: options.qrbox || { width: 280, height: 280 },
    aspectRatio: options.aspectRatio || 1.0,
    formatsToSupport: [
      0, // QR_CODE
      2, // DATA_MATRIX
      4, // EAN_13
      5, // EAN_8
      8, // CODE_128
      11, // ITF
    ],
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true,
    },
  };

  const cameraConfig = cameraId
    ? { deviceId: { exact: cameraId } }
    : { facingMode: 'environment' };

  try {
    await html5QrCode.start(
      cameraConfig,
      config,
      (decodedText, decodedResult) => {
        // Vibrate on successful scan
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }
        onSuccess(decodedText, decodedResult);
      },
      onError || (() => {})
    );
    isScanning = true;
  } catch (err) {
    isScanning = false;
    throw err;
  }
}

/**
 * Stop the camera scanner.
 */
export async function stopScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
    } catch (err) {
      console.warn('Error stopping scanner:', err);
    }
    isScanning = false;
  }
  if (html5QrCode) {
    try {
      html5QrCode.clear();
    } catch (e) {
      // ignore
    }
    html5QrCode = null;
  }
}

/**
 * Check if scanner is currently running.
 */
export function isScannerRunning() {
  return isScanning;
}

/**
 * Scan a file/image for a barcode.
 * @param {File} imageFile
 * @param {string} elementId
 * @returns {Promise<string>} Decoded text
 */
export async function scanFile(imageFile, elementId) {
  const qr = new Html5Qrcode(elementId);
  try {
    const result = await qr.scanFile(imageFile, true);
    return result;
  } finally {
    qr.clear();
  }
}
