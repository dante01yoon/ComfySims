export type FakeRequest = { server: 'api' | 'storage'; method: string; url: string; headers: Record<string, string | undefined> }
export declare function startFakeComfy(options?: { port?: number; storagePort?: number; failJobs?: boolean; requireKey?: string | null }): Promise<{
  requests: FakeRequest[]
  prompts: Map<string, { prompt: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>; polls: number; createdAt: number; slow: boolean }>
  close(): Promise<void>
}>
