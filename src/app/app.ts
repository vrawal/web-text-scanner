import { Component } from '@angular/core';
import { ScannerComponent } from './components/scanner/scanner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ScannerComponent],
  template: `<app-scanner />`,
  styles: []
})
export class App {}
