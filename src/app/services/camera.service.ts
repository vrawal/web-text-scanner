import { Injectable, signal } from '@angular/core';
import Tesseract from 'tesseract.js';
import { parse as parseMRZ } from 'mrz';

export interface CapturedImage {
  id: string;
  dataUrl: string;
  timestamp: Date;
  type: 'license' | 'identity' | 'other';
}

export interface MRZData {
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string;
  sex: string;
  expirationDate: string;
  issuingState: string;
  valid: boolean;
  rawMRZ: string[];
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  private mediaStream: MediaStream | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  isStreaming = signal(false);
  capturedImages = signal<CapturedImage[]>([]);
  error = signal<string | null>(null);

  // OCR scanning signals
  scannedText = signal<string>('');
  isScanning = signal(false);
  scanProgress = signal(0);

  // MRZ data signal
  mrzData = signal<MRZData | null>(null);
  mrzError = signal<string | null>(null);
  
  async startCamera(videoElement: HTMLVideoElement): Promise<void> {
    try {
      this.error.set(null);

      // Request camera access with optimal settings for document scanning (portrait mode)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          facingMode: 'environment' // Prefer back camera on mobile
        },
        audio: false
      });

      videoElement.srcObject = this.mediaStream;
      await videoElement.play();
      this.isStreaming.set(true);

      // Start continuous text scanning
      this.startContinuousScanning(videoElement);
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.error.set(errorMessage);
      this.isStreaming.set(false);
      throw new Error(errorMessage);
    }
  }

  stopCamera(videoElement: HTMLVideoElement): void {
    this.stopContinuousScanning();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    videoElement.srcObject = null;
    this.isStreaming.set(false);
    this.scannedText.set('');
  }

  private startContinuousScanning(videoElement: HTMLVideoElement): void {
    // Scan every 2 seconds to avoid performance issues
    this.scanInterval = setInterval(async () => {
      if (this.isStreaming() && !this.isScanning()) {
        await this.scanTextFromVideo(videoElement);
      }
    }, 2000);
  }

  private stopContinuousScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  async scanTextFromVideo(videoElement: HTMLVideoElement): Promise<string> {
    if (!this.isStreaming()) {
      return '';
    }

    this.isScanning.set(true);
    this.scanProgress.set(0);
    this.mrzError.set(null);

    try {
      // Capture current frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.isScanning.set(false);
        return '';
      }

      ctx.drawImage(videoElement, 0, 0);
      const imageData = canvas.toDataURL('image/png');

      // Perform OCR using Tesseract.js with MRZ-optimized settings
      const result = await Tesseract.recognize(imageData, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.scanProgress.set(Math.round(m.progress * 100));
          }
        }
      });

      const text = result.data.text.trim();
      this.scannedText.set(text);

      // Try to parse MRZ from the scanned text
      this.parseMRZFromText(text);

      this.isScanning.set(false);
      this.scanProgress.set(100);

      return text;
    } catch (err) {
      console.error('OCR Error:', err);
      this.isScanning.set(false);
      return '';
    }
  }

  async scanTextFromImage(imageDataUrl: string): Promise<string> {
    this.isScanning.set(true);
    this.scanProgress.set(0);
    this.mrzError.set(null);

    try {
      const result = await Tesseract.recognize(imageDataUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.scanProgress.set(Math.round(m.progress * 100));
          }
        }
      });

      const text = result.data.text.trim();
      this.scannedText.set(text);

      // Try to parse MRZ from the scanned text
      this.parseMRZFromText(text);

      this.isScanning.set(false);
      this.scanProgress.set(100);

      return text;
    } catch (err) {
      console.error('OCR Error:', err);
      this.isScanning.set(false);
      return '';
    }
  }

  private parseMRZFromText(text: string): void {
    try {
      // Extract potential MRZ lines (lines with < characters typical in MRZ)
      const lines = text.split('\n').map(line => line.trim().toUpperCase());
      const mrzLines = lines.filter(line =>
        line.includes('<') || /^[A-Z0-9<]{30,}$/.test(line.replace(/\s/g, ''))
      );

      if (mrzLines.length === 0) {
        this.mrzData.set(null);
        this.mrzError.set('No MRZ detected. Position the MRZ zone (bottom of ID/passport) in view.');
        return;
      }

      // Clean MRZ lines - remove spaces, fix common OCR errors
      const cleanedLines = mrzLines.map(line =>
        line.replace(/\s/g, '')
            .replace(/O/g, '0')  // Common OCR error: O instead of 0
            .replace(/</g, '<')
      );

      // Try to parse as TD1 (3 lines), TD2 (2 lines), or TD3/Passport (2 lines)
      let parseResult;

      if (cleanedLines.length >= 3) {
        // Try TD1 format (ID cards - 3 lines of 30 chars)
        const td1Lines = cleanedLines.slice(0, 3).map(l => l.substring(0, 30).padEnd(30, '<'));
        try {
          parseResult = parseMRZ(td1Lines);
        } catch {
          // Try with 2 lines if 3 lines fail
          const td2Lines = cleanedLines.slice(0, 2).map(l => l.substring(0, 36).padEnd(36, '<'));
          parseResult = parseMRZ(td2Lines);
        }
      } else if (cleanedLines.length >= 2) {
        // Try TD2 (36 chars) or TD3/Passport (44 chars)
        const lineLength = cleanedLines[0].length;
        if (lineLength >= 44) {
          const td3Lines = cleanedLines.slice(0, 2).map(l => l.substring(0, 44).padEnd(44, '<'));
          parseResult = parseMRZ(td3Lines);
        } else {
          const td2Lines = cleanedLines.slice(0, 2).map(l => l.substring(0, 36).padEnd(36, '<'));
          parseResult = parseMRZ(td2Lines);
        }
      } else {
        this.mrzData.set(null);
        this.mrzError.set('Incomplete MRZ detected. Need at least 2 lines.');
        return;
      }

      if (parseResult && parseResult.valid) {
        const fields = parseResult.fields;
        this.mrzData.set({
          documentType: this.getDocumentType(fields.documentCode || ''),
          documentNumber: fields.documentNumber || '',
          firstName: fields.firstName || '',
          lastName: fields.lastName || '',
          nationality: fields.nationality || '',
          birthDate: this.formatMRZDate(fields.birthDate || undefined),
          sex: fields.sex || '',
          expirationDate: this.formatMRZDate(fields.expirationDate || undefined),
          issuingState: fields.issuingState || '',
          valid: parseResult.valid,
          rawMRZ: cleanedLines
        });
        this.mrzError.set(null);
      } else {
        this.mrzData.set(null);
        this.mrzError.set('MRZ detected but validation failed. Try adjusting the camera angle.');
      }
    } catch (err) {
      console.error('MRZ Parse Error:', err);
      this.mrzData.set(null);
      this.mrzError.set('Could not parse MRZ. Ensure the document is clearly visible.');
    }
  }

  private getDocumentType(code: string): string {
    if (!code) return 'Unknown';
    const firstChar = code.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'P': return 'Passport';
      case 'I': return 'ID Card';
      case 'A': return 'ID Card (Type A)';
      case 'C': return 'ID Card (Type C)';
      case 'V': return 'Visa';
      case 'D': return "Driver's License";
      default: return `Document (${code})`;
    }
  }

  private formatMRZDate(dateStr: string | undefined): string {
    if (!dateStr || dateStr.length !== 6) return '';
    const year = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);
    // Determine century (assume 20xx for years < 30, 19xx otherwise)
    const fullYear = parseInt(year) < 30 ? `20${year}` : `19${year}`;
    return `${fullYear}-${month}-${day}`;
  }

  clearScannedText(): void {
    this.scannedText.set('');
    this.mrzData.set(null);
    this.mrzError.set(null);
  }

  captureImage(
    videoElement: HTMLVideoElement,
    type: 'license' | 'identity' | 'other' = 'other'
  ): CapturedImage | null {
    if (!this.isStreaming()) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.drawImage(videoElement, 0, 0);

    const capturedImage: CapturedImage = {
      id: crypto.randomUUID(),
      dataUrl: canvas.toDataURL('image/jpeg', 0.95),
      timestamp: new Date(),
      type
    };

    this.capturedImages.update(images => [...images, capturedImage]);
    return capturedImage;
  }

  removeImage(id: string): void {
    this.capturedImages.update(images => images.filter(img => img.id !== id));
  }

  clearAllImages(): void {
    this.capturedImages.set([]);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return 'Camera access denied. Please allow camera permissions in your browser settings.';
        case 'NotFoundError':
          return 'No camera found. Please connect a camera and try again.';
        case 'NotReadableError':
          return 'Camera is already in use by another application.';
        case 'OverconstrainedError':
          return 'Camera does not support the requested settings.';
        default:
          return `Camera error: ${error.message}`;
      }
    }
    return 'An unexpected error occurred while accessing the camera.';
  }
}
