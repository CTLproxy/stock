/**
 * Barcode Scanner using html5-qrcode library
 * Provides camera-based barcode scanning for iOS Safari
 */
import { Html5Qrcode } from 'html5-qrcode';

class BarcodeScanner {
  constructor() {
    this._scanner = null;
    this._isScanning = false;
    this._onScan = null;
    this._containerId = null;
  }

  get isScanning() {
    return this._isScanning;
  }

  /**
   * Start scanning
   * @param {string} containerId - DOM element ID to render camera into
   * @param {Function} onScan - Callback with scanned barcode value
   * @param {Function} onError - Error callback
   */
  async start(containerId, onScan, onError) {
    if (this._isScanning) {
      await this.stop();
    }

    this._containerId = containerId;
    this._onScan = onScan;

    try {
      this._scanner = new Html5Qrcode(containerId);

      const config = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.floor(minEdge * 0.75),
            height: Math.floor(minEdge * 0.45),
          };
        },
        formatsToSupport: [
          0,  // QR_CODE
          1,  // AZTEC
          2,  // CODABAR
          3,  // CODE_39
          4,  // CODE_93
          5,  // CODE_128
          6,  // DATA_MATRIX
          7,  // MAXICODE
          8,  // ITF
          9, // EAN_13
          10, // EAN_8
          11, // PDF_417
          12, // RSS_14
          13, // RSS_EXPANDED
          14, // UPC_A
          15, // UPC_E
          16, // UPC_EAN_EXTENSION
        ],
      };

      // On iOS Safari, facingMode constraint can fail silently.
      // Try facingMode first, then fall back to selecting a camera by ID.
      let started = false;
      try {
        await this._scanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText, decodedResult) => {
            if (navigator.vibrate) navigator.vibrate(100);
            if (this._onScan) this._onScan(decodedText, decodedResult);
          },
          () => {},
        );
        started = true;
      } catch (facingErr) {
        console.warn('facingMode start failed, trying camera list:', facingErr);
      }

      if (!started) {
        // Fallback: enumerate cameras and pick the back one (or first available)
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('No cameras found on this device');
        }
        const backCam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
        await this._scanner.start(
          backCam.id,
          config,
          (decodedText, decodedResult) => {
            if (navigator.vibrate) navigator.vibrate(100);
            if (this._onScan) this._onScan(decodedText, decodedResult);
          },
          () => {},
        );
      }

      this._isScanning = true;
    } catch (e) {
      console.error('Scanner start error:', e);
      if (onError) {
        onError(e);
      }
      throw e;
    }
  }

  async stop() {
    if (this._scanner && this._isScanning) {
      try {
        await this._scanner.stop();
      } catch (e) {
        console.warn('Scanner stop warning:', e);
      }
      try {
        this._scanner.clear();
      } catch (_) {
        // ignore
      }
    }
    this._isScanning = false;
    this._scanner = null;
    this._onScan = null;
  }

  /**
   * Get available cameras
   */
  static async getCameras() {
    try {
      return await Html5Qrcode.getCameras();
    } catch (e) {
      console.error('Failed to get cameras:', e);
      return [];
    }
  }

  /**
   * Check if camera is supported
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
}

// Singleton
export const scanner = new BarcodeScanner();
export default scanner;
