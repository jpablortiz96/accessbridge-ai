// Offline Scanner — identical to the cloud scanner (all rules are static / deterministic).
// Re-exported under the OfflineScannerAgent name so the orchestrator can swap it in.

export { ScannerAgent as OfflineScannerAgent } from '../scanner';
