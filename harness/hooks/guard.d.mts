export declare const PROTECTED: string[]
export declare function decide(
  call: { tool_name: string; tool_input?: { file_path?: string; notebook_path?: string; command?: string } },
  specSession: boolean
): string | null
