import type { ClaudeCodeInput, ForeignImportResult } from './types.ts';
export { frontmatterProblem, isSafeRelPath, isSafeUnitName, mcpEntryOf, splitFrontmatter, stripUserInfo, } from './kernel.ts';
export declare function convertClaudeCode(input: ClaudeCodeInput): ForeignImportResult;
