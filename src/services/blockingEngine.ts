/**
 * BlockingEngine - Abstraction layer for app blocking functionality.
 * Currently simulates blocking in-app. 
 * Ready to integrate with Android Accessibility Service / iOS Screen Time API later.
 */

export interface BlockingEngineInterface {
  startBlocking(selectedApps: string[]): Promise<void>;
  stopBlocking(): Promise<void>;
  isBlocking(): boolean;
  getBlockedApps(): string[];
  getBlockedAttempts(): number;
  recordBlockedAttempt(appName: string): void;
  reset(): void;
}

class SimulatedBlockingEngine implements BlockingEngineInterface {
  private _isBlocking: boolean = false;
  private _blockedApps: string[] = [];
  private _blockedAttempts: number = 0;
  private _attemptLog: { app: string; time: Date }[] = [];

  async startBlocking(selectedApps: string[]): Promise<void> {
    this._isBlocking = true;
    this._blockedApps = [...selectedApps];
    this._blockedAttempts = 0;
    this._attemptLog = [];
    console.log('[BlockingEngine] Simulated blocking started for:', selectedApps);
  }

  async stopBlocking(): Promise<void> {
    this._isBlocking = false;
    console.log('[BlockingEngine] Simulated blocking stopped. Attempts:', this._blockedAttempts);
  }

  isBlocking(): boolean {
    return this._isBlocking;
  }

  getBlockedApps(): string[] {
    return [...this._blockedApps];
  }

  getBlockedAttempts(): number {
    return this._blockedAttempts;
  }

  recordBlockedAttempt(appName: string): void {
    this._blockedAttempts++;
    this._attemptLog.push({ app: appName, time: new Date() });
  }

  reset(): void {
    this._isBlocking = false;
    this._blockedApps = [];
    this._blockedAttempts = 0;
    this._attemptLog = [];
  }
}

// Singleton instance
export const blockingEngine: BlockingEngineInterface = new SimulatedBlockingEngine();
