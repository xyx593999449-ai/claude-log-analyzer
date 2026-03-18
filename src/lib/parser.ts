import { LogAnalysis, ParsedEvent, SessionData, LogStats } from './types';

function createEmptyStats(): LogStats {
  return {
    totalCost: 0,
    totalDuration: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    toolCounts: {},
    toolErrors: {},
  };
}

function extractTimestamp(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const match = id.match(/^msg_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [_, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
  return undefined;
}

export function parseNDJSON(ndjson: string): LogAnalysis {
  const lines = ndjson.split('\n').filter(line => line.trim() !== '');
  const events: ParsedEvent[] = [];
  
  const globalStats = createEmptyStats();
  const sessions: Record<string, SessionData> = {};

  let idCounter = 0;
  const toolIdToName: Record<string, string> = {};

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const message = raw.message || raw;
      
      const sessionId = raw.session_id || message.session_id || 'unknown_session';
      let timestampStr = extractTimestamp(message.id);

      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          sessionId,
          events: [],
          timeline: [],
          stats: createEmptyStats(),
        };
      }

      // If no timestamp could be extracted from the ID, try to inherit from the last event in the session
      if (!timestampStr) {
        const lastEvent = sessions[sessionId].events[sessions[sessionId].events.length - 1];
        if (lastEvent && lastEvent.timestampStr) {
          timestampStr = lastEvent.timestampStr;
        }
      }

      const event: ParsedEvent = {
        id: `ev_${idCounter++}`,
        type: 'raw',
        raw,
        sessionId,
        timestampStr,
      };

      const sessionStats = sessions[sessionId].stats;

      // Extract usage/cost info if present anywhere
      if (message.usage) {
        event.usage = message.usage;
        const inTokens = message.usage.input_tokens || 0;
        const outTokens = message.usage.output_tokens || 0;
        const cacheTokens = (message.usage.cache_creation_input_tokens || 0) + (message.usage.cache_read_input_tokens || 0);
        
        globalStats.inputTokens += inTokens;
        globalStats.outputTokens += outTokens;
        globalStats.cacheTokens += cacheTokens;
        
        sessionStats.inputTokens += inTokens;
        sessionStats.outputTokens += outTokens;
        sessionStats.cacheTokens += cacheTokens;
      }
      if (message.cost_usd) {
        event.costUsd = message.cost_usd;
        globalStats.totalCost += message.cost_usd;
        sessionStats.totalCost += message.cost_usd;
      }
      if (message.duration_ms) {
        event.durationMs = message.duration_ms;
        globalStats.totalDuration += message.duration_ms;
        sessionStats.totalDuration += message.duration_ms;
      }

      // Classify event
      const role = message.role || raw.type;

      if (raw.type === 'stream_event' && raw.event?.delta?.type === 'text_delta') {
        event.type = 'text_delta';
        event.text = raw.event.delta.text;
      } else if (raw.type === 'content_block_delta' && raw.delta?.type === 'text_delta') {
        event.type = 'text_delta';
        event.text = raw.delta.text;
      } else if (role === 'system') {
        event.type = 'system_stats';
        event.costUsd = message.cost_usd;
        event.durationMs = message.duration_ms;
      } else if (role === 'user') {
        if (Array.isArray(message.content)) {
          const toolResult = message.content.find((c: any) => c.type === 'tool_result');
          if (toolResult) {
            event.type = 'tool_result';
            event.toolName = toolResult.name || (toolResult.tool_use_id ? toolIdToName[toolResult.tool_use_id] : null) || toolResult.tool_use_id || 'unknown';
            event.toolResult = toolResult.content;
            event.isError = toolResult.is_error || false;
            if (event.isError) {
              globalStats.toolErrors[event.toolName] = (globalStats.toolErrors[event.toolName] || 0) + 1;
              sessionStats.toolErrors[event.toolName] = (sessionStats.toolErrors[event.toolName] || 0) + 1;
            }
          } else {
            event.type = 'user';
            event.text = message.content.map((c: any) => c.text || '').join('');
          }
        } else if (typeof message.content === 'string') {
          event.type = 'user';
          event.text = message.content;
        }
      } else if (role === 'assistant' || raw.type === 'message') {
        // Handle message type
        if (Array.isArray(message.content)) {
          const textBlocks = message.content.filter((c: any) => c.type === 'text');
          if (textBlocks.length > 0) {
            event.type = 'assistant';
            event.text = textBlocks.map((c: any) => c.text).join('');
          }
          
          const toolUse = message.content.find((c: any) => c.type === 'tool_use');
          if (toolUse) {
            event.type = 'tool_use';
            event.toolName = toolUse.name;
            event.toolInput = toolUse.input;
            if (toolUse.id) {
              toolIdToName[toolUse.id] = toolUse.name;
            }
            globalStats.toolCounts[toolUse.name] = (globalStats.toolCounts[toolUse.name] || 0) + 1;
            sessionStats.toolCounts[toolUse.name] = (sessionStats.toolCounts[toolUse.name] || 0) + 1;
          }
          
          const toolResult = message.content.find((c: any) => c.type === 'tool_result');
          if (toolResult) {
            event.type = 'tool_result';
            event.toolName = toolResult.name || (toolResult.tool_use_id ? toolIdToName[toolResult.tool_use_id] : null) || toolResult.tool_use_id || 'unknown';
            event.toolResult = toolResult.content;
            event.isError = toolResult.is_error || false;
            if (event.isError) {
              globalStats.toolErrors[event.toolName] = (globalStats.toolErrors[event.toolName] || 0) + 1;
              sessionStats.toolErrors[event.toolName] = (sessionStats.toolErrors[event.toolName] || 0) + 1;
            }
          }
        }
      } else if (raw.type === 'content_block_start' && raw.content_block?.type === 'tool_use') {
        event.type = 'tool_use';
        event.toolName = raw.content_block.name;
        event.toolInput = raw.content_block.input;
        if (raw.content_block.id) {
          toolIdToName[raw.content_block.id] = raw.content_block.name;
        }
        globalStats.toolCounts[event.toolName] = (globalStats.toolCounts[event.toolName] || 0) + 1;
        sessionStats.toolCounts[event.toolName] = (sessionStats.toolCounts[event.toolName] || 0) + 1;
      } else if (raw.type === 'content_block_delta' && raw.delta?.type === 'input_json_delta') {
        event.type = 'raw'; // We can ignore partial json delta for now or merge it
      }

      events.push(event);
      sessions[sessionId].events.push(event);
    } catch (e) {
      console.warn('Failed to parse line:', line);
    }
  }

  // Build timeline per session
  const globalTimeline: ParsedEvent[] = [];

  for (const sessionId in sessions) {
    const session = sessions[sessionId];
    let currentAssistantText = '';
    
    // Find start and end time
    for (const ev of session.events) {
      if (ev.timestampStr) {
        if (!session.startTime) session.startTime = ev.timestampStr;
        session.endTime = ev.timestampStr;
      }
    }
    
    for (const ev of session.events) {
      if (ev.type === 'text_delta') {
        currentAssistantText += ev.text || '';
      } else if (ev.type === 'assistant' || ev.type === 'tool_use' || ev.type === 'tool_result' || ev.type === 'user') {
        if (currentAssistantText) {
          const mergedEv: ParsedEvent = {
            id: `merged_${ev.id}`,
            type: 'assistant',
            text: currentAssistantText,
            raw: {},
            sessionId,
            timestampStr: ev.timestampStr,
          };
          session.timeline.push(mergedEv);
          globalTimeline.push(mergedEv);
          currentAssistantText = '';
        }
        session.timeline.push(ev);
        globalTimeline.push(ev);
      }
    }
    
    if (currentAssistantText) {
      const mergedEv: ParsedEvent = {
        id: `merged_final_${sessionId}`,
        type: 'assistant',
        text: currentAssistantText,
        raw: {},
        sessionId,
      };
      session.timeline.push(mergedEv);
      globalTimeline.push(mergedEv);
    }
  }

  return { events, timeline: globalTimeline, stats: globalStats, sessions };
}
