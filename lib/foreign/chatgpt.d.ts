import type { SessionSourceWiring } from './session-source.ts';
import type { ChatgptSessionFile } from './read-chatgpt.ts';
import type { ForeignSource } from './registry.ts';
export declare const chatgptWiring: SessionSourceWiring<ChatgptSessionFile>;
export declare function createChatgptSource(): ForeignSource;
export declare const chatgptSource: ForeignSource;
