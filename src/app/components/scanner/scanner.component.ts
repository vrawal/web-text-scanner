import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CameraService, CapturedImage } from '../../services/camera.service';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.scss'
})
export class ScannerComponent implements OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private cameraService = inject(CameraService);

  isStreaming = this.cameraService.isStreaming;
  capturedImages = this.cameraService.capturedImages;
  error = this.cameraService.error;

  // OCR signals
  scannedText = this.cameraService.scannedText;
  isScanning = this.cameraService.isScanning;
  scanProgress = this.cameraService.scanProgress;

  // MRZ signals
  mrzData = this.cameraService.mrzData;
  mrzError = this.cameraService.mrzError;

  selectedType: 'license' | 'identity' | 'other' = 'license';
  isCapturing = false;
  showGuide = true;
  showRawText = false;

  async startCamera(): Promise<void> {
    try {
      await this.cameraService.startCamera(this.videoElement.nativeElement);
    } catch (err) {
      console.error('Failed to start camera:', err);
    }
  }

  stopCamera(): void {
    this.cameraService.stopCamera(this.videoElement.nativeElement);
  }

  async scanNow(): Promise<void> {
    await this.cameraService.scanTextFromVideo(this.videoElement.nativeElement);
  }

  async scanCapturedImage(image: CapturedImage): Promise<void> {
    await this.cameraService.scanTextFromImage(image.dataUrl);
  }

  clearScannedText(): void {
    this.cameraService.clearScannedText();
  }

  toggleRawText(): void {
    this.showRawText = !this.showRawText;
  }

  copyMRZData(): void {
    const data = this.mrzData();
    if (data) {
      const text = `Document Type: ${data.documentType}
Document Number: ${data.documentNumber}
Name: ${data.firstName} ${data.lastName}
Nationality: ${data.nationality}
Date of Birth: ${data.birthDate}
Sex: ${data.sex}
Expiration Date: ${data.expirationDate}
Issuing State: ${data.issuingState}`;
      navigator.clipboard.writeText(text);
    }
  }

  copyToClipboard(): void {
    const text = this.scannedText();
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }

  captureImage(): void {
    if (this.isCapturing) return;

    this.isCapturing = true;

    // Add a brief flash effect
    setTimeout(() => {
      this.cameraService.captureImage(this.videoElement.nativeElement, this.selectedType);
      this.isCapturing = false;
    }, 100);
  }

  removeImage(image: CapturedImage): void {
    this.cameraService.removeImage(image.id);
  }

  clearAllImages(): void {
    this.cameraService.clearAllImages();
  }

  downloadImage(image: CapturedImage): void {
    const link = document.createElement('a');
    link.href = image.dataUrl;
    link.download = `${image.type}-${image.timestamp.toISOString()}.jpg`;
    link.click();
  }

  toggleGuide(): void {
    this.showGuide = !this.showGuide;
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}
