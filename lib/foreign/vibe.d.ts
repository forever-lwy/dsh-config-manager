import type { SessionSourceWiring } from './session-source.ts';
import type { VibeSessionFile } from './read-vibe.ts';
import type { ForeignSource } from './registry.ts';
export declare const vibeWiring: SessionSourceWiring<VibeSessionFile>;
export declare function createVibeSource(): ForeignSource;
export declare const vibeSource: ForeignSource;
