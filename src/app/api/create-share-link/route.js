import { NextResponse } from 'next/server';
import { uploadToR2, isCloudflareR2Configured } from '@/lib/r2';

export async function POST(request) {
  try {
    const body = await request.json();
    const { house, displayName, pfpUrl, fid } = body;

    if (!house || !displayName || !fid) {
      return NextResponse.json({ error: 'Missing required parameters: house, displayName, fid' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not configured.' }, { status: 500 });
    }

    // Create base shareable URL without image parameter (works without R2)
    const sharePageUrl = new URL(appUrl);
    
    let generatedImageR2Url = null;
    let imageFileName = null;

    // If R2 is configured, generate and upload the image
    if (isCloudflareR2Configured()) {
      try {
        // Construct the URL for the OG image generator
        const ogImageUrl = new URL(`${appUrl}/api/og`);
        ogImageUrl.searchParams.set('house', house);
        ogImageUrl.searchParams.set('displayName', displayName);
        if (pfpUrl) {
          ogImageUrl.searchParams.set('pfpUrl', pfpUrl);
        }
        ogImageUrl.searchParams.set('fid', fid.toString());

        // Fetch the image from the OG route
        const imageResponse = await fetch(ogImageUrl.toString());
        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.warn('Failed to generate OG image for R2 upload:', errorText);
        } else {
          const imageBuffer = await imageResponse.arrayBuffer();

          // Upload to R2
          const timestamp = Date.now();
          imageFileName = `share-image-${fid}-${timestamp}.png`;
          const r2FileName = `what-x-are-you/${imageFileName}`;
          
          generatedImageR2Url = await uploadToR2(Buffer.from(imageBuffer), r2FileName, 'image/png');

          // Add image parameter to the shareable URL only if R2 upload succeeded
          sharePageUrl.searchParams.set('image', imageFileName);
        }
      } catch (r2Error) {
        console.warn('R2 upload failed, sharing without image:', r2Error.message);
        // Continue without R2 image - sharing will still work
      }
    }

    return NextResponse.json({
      generatedImageR2Url,
      shareablePageUrl: sharePageUrl.toString(),
      imageFileName,
      hasCustomImage: !!generatedImageR2Url
    });

  } catch (error) {
    console.error('Error in create-share-link:', error); // Keep error
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 