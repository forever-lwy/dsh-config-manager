import type { SessionSourceWiring } from './session-source.ts';
import type { ClineSessionFile } from './read-cline.ts';
import type { ForeignSource } from './registry.ts';
export declare const clineWiring: SessionSourceWiring<ClineSessionFile>;
export declare function createClineSource(): ForeignSource;
export declare const clineSource: ForeignSource;
