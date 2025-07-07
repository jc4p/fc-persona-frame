import { getUserDataFromNeynar, getRecentCastTexts, getRecentCastsWithTimestamps } from '@/lib/neynar';
import { generateUserImageStream } from '@/lib/ai-generation';

// Use Node.js runtime for streaming
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fidParam = searchParams.get('fid');

  if (!fidParam) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'FID query parameter is required' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  }

  const fid = parseInt(fidParam, 10);

  if (isNaN(fid)) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'Invalid FID format' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  }

  // Set up SSE headers
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  // Create a TransformStream to handle the SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Start the async generation process
  (async () => {
    try {
      // Send initial status
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Fetching user data...' })}\n\n`)
      );

      // Fetch user data and casts with timestamps
      const [userData, castsWithTimestamps] = await Promise.all([
        getUserDataFromNeynar(fid),
        getRecentCastsWithTimestamps(fid)
      ]);
      
      // Extract just the texts for compatibility
      const castTexts = castsWithTimestamps.map(cast => cast.text);

      // console.log('First cast:', castsWithTimestamps[0]);
      // console.log('Last cast:', castsWithTimestamps[castsWithTimestamps.length - 1]);

      if (!userData) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'User not found' })}\n\n`)
        );
        await writer.close();
        return;
      }

      // Extract bio
      const bio = userData.profile?.bio?.text || null;

      // Generate image with streaming (include profile picture and casts with timestamps)
      for await (const event of generateUserImageStream(bio, castTexts, {
        username: userData.username,
        display_name: userData.display_name,
        pfp_url: userData.pfp_url
      }, castsWithTimestamps)) {
        // Send each event as SSE
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );

        // If it's the final image, also send user data
        if (event.type === 'final_image') {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({
              type: 'complete',
              userData: {
                username: userData.username,
                pfp_url: userData.pfp_url,
                display_name: userData.display_name
              }
            })}\n\n`)
          );
        }
      }

    } catch (error) {
      console.error('Streaming error:', error);
      try {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: error.message || 'Internal server error' 
          })}\n\n`)
        );
      } catch (writeError) {
        console.error('Error writing error message:', writeError);
      }
    } finally {
      try {
        await writer.close();
      } catch (closeError) {
        // Writer might already be closed, ignore
        console.log('Writer already closed:', closeError.message);
      }
    }
  })();

  return new Response(stream.readable, { headers });
}