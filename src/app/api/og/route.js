import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    // Params from query string
    const displayName = searchParams.get('name') || searchParams.get('displayName') || 'Anonymous User';
    const imageFileName = searchParams.get('image');
    const fid = searchParams.get('fid');

    // Get R2 public URL if configured
    const r2PublicUrl = process.env.R2_PUBLIC_URL;
    let generatedImageUrl = null;
    
    if (imageFileName && r2PublicUrl) {
      generatedImageUrl = `${r2PublicUrl}/ai-visual-generator/${imageFileName}`;
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            fontFamily: '"Arial", sans-serif',
            fontSize: 32,
            color: 'white',
            padding: '40px',
            position: 'relative'
          }}
        >
          {/* Generated Image or Placeholder */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            marginBottom: '30px',
            width: '300px',
            height: '300px',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
          }}>
            {generatedImageUrl ? (
              <img
                src={generatedImageUrl}
                alt="AI Generated Visual"
                width={300}
                height={300}
                style={{
                  objectFit: 'cover'
                }}
              />
            ) : (
              <div 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '120px'
                }}
              >
                ✨
              </div>
            )}
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '10px'
          }}>
            <div style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: '#ffd700'
            }}>{displayName}'s</div>
            
            <div style={{
              fontSize: '42px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent'
            }}>
              AI Visual Representation
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: '24px',
            color: '#aaa',
            marginTop: 'auto',
            opacity: 0.8
          }}>
            Generate yours at {appUrl}
          </div>
        </div>
      ),
      {
        width: 600,
        height: 600,
      },
    );
  } catch (e) {
    console.error('Error generating OG image:', e.message);
    if (e.cause) {
      console.error('Cause:', e.cause);
    }
    return new Response(`Failed to generate image: ${e.message}`, { status: 500 });
  }
} 