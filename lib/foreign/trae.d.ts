import type { SessionSourceWiring } from './session-source.ts';
import type { TraeSessionFile } from './read-trae.ts';
import type { ForeignSource } from './registry.ts';
export declare const traeWiring: SessionSourceWiring<TraeSessionFile>;
export declare function createTraeSource(): ForeignSource;
export declare const traeSource: ForeignSource;
