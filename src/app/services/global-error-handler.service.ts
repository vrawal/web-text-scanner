import { ErrorHandler, Injectable, inject } from '@angular/core';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: Error): void {
    // Log error to console
    console.error('Global Error Handler caught an error:', error);

    // Extract error details
    const errorMessage = error.message || 'An unexpected error occurred';
    const stackTrace = error.stack || '';

    // Log structured error information
    console.error({
      message: errorMessage,
      stack: stackTrace,
      timestamp: new Date().toISOString(),
      type: error.name || 'Error'
    });

    // Here you can add additional error handling logic:
    // - Send errors to a logging service (e.g., Sentry, Application Insights)
    // - Display user-friendly error messages
    // - Store errors locally for debugging
    // - Track error metrics

    // Example: Send to analytics/monitoring service
    // this.logErrorToService(error);
  }

  private logErrorToService(error: Error): void {
    // Implement your error logging service integration here
    // Example: Send to external monitoring service
    // fetch('/api/log-error', {
    //   method: 'POST',
    //   body: JSON.stringify({
    //     message: error.message,
    //     stack: error.stack,
    //     timestamp: new Date().toISOString()
    //   })
    // });
  }
}
