// Offline Navigator — identical to the cloud navigator (all rules are deterministic).
// Re-exported under the OfflineNavigatorAgent name so the orchestrator can swap it in.

export { NavigatorAgent as OfflineNavigatorAgent } from '../navigator';
