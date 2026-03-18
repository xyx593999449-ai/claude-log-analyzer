export type LogEventType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'text_delta' | 'system_stats' | 'raw';

export interface ParsedEvent {
  id: string;
  type: LogEventType;
  timestamp?: number;
  timestampStr?: string;
  sessionId?: string;
  raw: any;
  
  // For user/assistant messages
  text?: string;
  
  // For tool_use
  toolName?: string;
  toolInput?: any;
  
  // For tool_result
  toolResult?: any;
  isError?: boolean;
  
  // For system stats
  costUsd?: number;
  durationMs?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface LogStats {
  totalCost: number;
  totalDuration: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  toolCounts: Record<string, number>;
  toolErrors: Record<string, number>;
}

export interface SessionData {
  sessionId: string;
  events: ParsedEvent[];
  timeline: ParsedEvent[];
  stats: LogStats;
  startTime?: string;
  endTime?: string;
}

export interface LogAnalysis {
  events: ParsedEvent[];
  timeline: ParsedEvent[]; // Grouped/filtered for timeline
  stats: LogStats;
  sessions: Record<string, SessionData>;
}
