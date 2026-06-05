export interface LivenessResponse {
  status: 'ok'
  uptimeSeconds: number
  timestamp: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  uptimeSeconds: number
  database: 'ok' | 'unreachable'
  timestamp: string
}
