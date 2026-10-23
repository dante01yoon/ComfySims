import type { Server } from 'node:net'

export declare function holdVerifyLock(options?: { port?: number; retryMs?: number; onWait?: (port: number) => void }): Promise<Server>
