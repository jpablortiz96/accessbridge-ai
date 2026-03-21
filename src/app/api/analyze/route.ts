import { NextRequest, NextResponse } from 'next/server';
import { AgentOrchestrator } from '@/agents/orchestrator';
import type { AgentEvent } from '@/types/agents';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, mode = 'cloud' } = body as { url?: string; mode?: 'cloud' | 'offline' };

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const orchestrator = new AgentOrchestrator(mode);

    // Collect events for real-time streaming later
    const events: AgentEvent[] = [];
    orchestrator.on('agent:event', (event: AgentEvent) => {
      events.push(event);
    });

    const result = await orchestrator.analyze(url);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
