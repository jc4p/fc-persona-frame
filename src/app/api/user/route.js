import { NextResponse } from 'next/server';

// This endpoint is deprecated - use /api/generate-image for streaming
export const runtime = 'edge';

export async function GET(request) {
  return NextResponse.json({ 
    error: 'This endpoint is deprecated. Please use /api/generate-image for streaming image generation.' 
  }, { status: 410 });
} 