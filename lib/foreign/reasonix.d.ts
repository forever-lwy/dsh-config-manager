import type { SessionSourceWiring } from './session-source.ts';
import type { ReasonixSessionFile } from './read-reasonix.ts';
import type { ForeignSource } from './registry.ts';
export declare const reasonixWiring: SessionSourceWiring<ReasonixSessionFile>;
export declare function createReasonixSource(): ForeignSource;
export declare const reasonixSource: ForeignSource;
