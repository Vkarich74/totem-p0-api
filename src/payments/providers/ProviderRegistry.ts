// ProviderRegistry.ts
// Registers and resolves provider adapters.

import { ProviderAdapter } from "./ProviderAdapter";

export class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.providers.set(adapter.name, adapter);
  }

  get(name: string): ProviderAdapter {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Payment provider not registered: ${name}`);
    }
    return p;
  }
}
\n