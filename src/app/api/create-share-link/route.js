import { NextResponse } from 'next/server';
import { uploadToR2, isCloudflareR2Configured } from '@/lib/r2';

export async function POST(request) {
  try {
    const body = await request.json();
    const { imageBase64, displayName, pfpUrl, fid } = body;

    if (!imageBase64 || !displayName || !fid) {
      return NextResponse.json({ error: 'Missing required parameters: imageBase64, displayName, fid' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not configured.' }, { status: 500 });
    }

    // Create base shareable URL
    const sharePageUrl = new URL(appUrl);
    
    let generatedImageR2Url = null;
    let imageFileName = null;

    // If R2 is configured, upload the generated image
    if (isCloudflareR2Configured()) {
      try {
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        // Upload to R2
        const timestamp = Date.now();
        imageFileName = `ai-generated-${fid}-${timestamp}.png`;
        const r2FileName = `ai-visual-generator/${imageFileName}`;
        
        generatedImageR2Url = await uploadToR2(imageBuffer, r2FileName, 'image/png');

        // Add image parameter to the shareable URL only if R2 upload succeeded
        sharePageUrl.searchParams.set('image', imageFileName);
        sharePageUrl.searchParams.set('fid', fid.toString());
        sharePageUrl.searchParams.set('name', displayName);
      } catch (r2Error) {
        console.warn('R2 upload failed, sharing without image:', r2Error.message);
        // Continue without R2 image - sharing will still work
      }
    } else {
      // Without R2, we can still share basic info
      sharePageUrl.searchParams.set('fid', fid.toString());
      sharePageUrl.searchParams.set('name', displayName);
    }

    return NextResponse.json({
      generatedImageR2Url,
      shareablePageUrl: sharePageUrl.toString(),
      imageFileName,
      hasCustomImage: !!generatedImageR2Url
    });

  } catch (error) {
    console.error('Error in create-share-link:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 