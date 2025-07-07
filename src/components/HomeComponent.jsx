'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import styles from './HomeComponent.module.css';
import { shareCastIntent } from '@/lib/frame';

export function HomeComponent() {
  const [userData, setUserData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [currentFunFact, setCurrentFunFact] = useState('');
  const [error, setError] = useState(null);
  const [fid, setFid] = useState(null);
  const [shareStatus, setShareStatus] = useState('');

  // Effect to check for window.userFid
  useEffect(() => {
    console.log('HomeComponent: Checking for window.userFid...');
    
    if (typeof window !== 'undefined' && window.userFid) {
      console.log('HomeComponent: Found window.userFid immediately:', window.userFid);
      setFid(window.userFid);
      setIsLoading(false); 
      return; 
    }
    
    let attempts = 0;
    const maxAttempts = 30; 
    const intervalMs = 200;
    
    const intervalId = setInterval(() => {
      attempts++;
      console.log(`HomeComponent: Polling attempt ${attempts}, window.userFid =`, window.userFid);
      
      if (typeof window !== 'undefined' && window.userFid) {
        console.log(`HomeComponent: Found window.userFid after ${attempts} attempts:`, window.userFid);
        setFid(window.userFid);
        setIsLoading(false);
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        console.error('HomeComponent: Polling timeout reached without finding window.userFid');
        setError("Could not detect Farcaster frame context. Ensure you're viewing this in a frame.");
        setIsLoading(false);
        clearInterval(intervalId);
      }
    }, intervalMs);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Generate image with streaming
  const generateImageStream = useCallback(async () => {
    if (!fid) return;
    
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setGenerationStatus('Connecting...');
    setCurrentFunFact('');

    try {
      const eventSource = new EventSource(`/api/generate-image?fid=${fid}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'status':
            setGenerationStatus(data.message);
            break;
            
          case 'fun_fact':
            setCurrentFunFact(data.message);
            break;
            
          case 'final_image':
            setGeneratedImage({
              imageBase64: data.imageBase64,
              castsUsed: data.castsUsed,
              timestamp: data.timestamp,
              artStyle: data.artStyle
            });
            setGenerationStatus('Complete!');
            break;
            
          case 'complete':
            if (data.userData) {
              setUserData(data.userData);
            }
            eventSource.close();
            setIsGenerating(false);
            break;
            
          case 'retry':
            setGenerationStatus(data.message);
            break;
            
          case 'error':
            setError(data.message);
            eventSource.close();
            setIsGenerating(false);
            break;
        }
      };
      
      eventSource.onerror = () => {
        setError('Connection lost. Please try again.');
        eventSource.close();
        setIsGenerating(false);
      };
      
    } catch (err) {
      console.error('Streaming error:', err);
      setError(err.message || 'Failed to generate image');
      setIsGenerating(false);
    }
  }, [fid]);


  const handleShareClick = useCallback(async () => {
    if (!generatedImage || !fid || !userData) {
      setShareStatus('Error: Missing data');
      setTimeout(() => setShareStatus(''), 3000);
      return;
    }

    setShareStatus('Sharing...');

    try {
      const apiResponse = await fetch('/api/create-share-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: generatedImage.imageBase64,
          displayName: userData.display_name || userData.username || `FID ${fid}`,
          pfpUrl: userData.pfp_url || '',
          fid: fid,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || `Failed to create share link (status: ${apiResponse.status})`);
      }

      const { shareablePageUrl, generatedImageR2Url, hasCustomImage } = await apiResponse.json();

      if (generatedImageR2Url) {
        console.log('Final R2 Image URL:', generatedImageR2Url);
      }

      if (!shareablePageUrl) {
        throw new Error('Shareable Page URL not received from API.');
      }

      const castText = `Check out my AI-generated visual representation based on my Farcaster personality!`;
      
      await shareCastIntent(castText, shareablePageUrl);
      
      if (hasCustomImage) {
        setShareStatus('Shared with image!');
      } else {
        setShareStatus('Shared!');
      }

    } catch (err) {
      console.error('Error in handleShareClick:', err);
      setShareStatus(`Share failed: ${err.message.substring(0, 50)}...`);
    } finally {
      setTimeout(() => setShareStatus(''), 5000); 
    }
  }, [generatedImage, userData, fid]);

  // Loading State UI
  if (!fid || isLoading) {
    return (
      <div className={`${styles.container} ${styles.loadingContainer}`}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>{!fid ? "Waiting for frame context..." : "Initializing..."}</p>
      </div>
    );
  }

  // Error State UI
  if (error && !isGenerating) {
    return (
      <div className={styles.container}>
        <h2 className={styles.errorTitle}>Generation Error</h2>
        <p className={styles.errorMessage}>{error}</p>
        <button 
          className={styles.retryButton}
          onClick={generateImageStream}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show the final image
  const displayImage = generatedImage?.imageBase64;

  // Main Content UI
  return (
    <div className={styles.container}>
      {/* Header */} 
      <div className={styles.headerContainer}>
        {userData && userData.pfp_url && (
          <div className={styles.pfpContainerSmall}>
            <Image
              src={userData.pfp_url}
              alt={`${userData.display_name || userData.username || 'User'}'s profile picture`}
              width={50}
              height={50}
              className={styles.pfpImageSmall}
              priority
              unoptimized={true}
            />
          </div>
        )}
        <h1 className={styles.titleSmall}>
          AI Visual Generator for <span className={styles.userNameHighlight}>{userData?.display_name || userData?.username || `FID ${fid}`}</span>
        </h1>
      </div>

      {/* Generate Button (shown when no image yet) */}
      {!generatedImage && !isGenerating && (
        <div className={styles.generateContainer}>
          <p className={styles.introText}>
            Generate a unique visual representation based on your Farcaster personality and posts
          </p>
          <button
            className={styles.generateButton}
            onClick={generateImageStream}
            aria-label="Generate Image"
          >
            <span role="img" aria-label="sparkles">✨</span> Generate My Image
          </button>
        </div>
      )}

      {/* Generation Progress */}
      {isGenerating && (
        <div className={styles.generatingContainer}>
          <div className={styles.spinner}></div>
          <p className={styles.generationStatus}>{generationStatus}</p>
          <p className={styles.generationTimeNote}>This may take 60-90 seconds</p>
          {currentFunFact && (
            <div className={styles.funFactContainer}>
              <p className={styles.funFact}>💡 {currentFunFact}</p>
            </div>
          )}
        </div>
      )}

      {/* Image Display */}
      {displayImage && !isGenerating && (
        <div className={styles.imageContainer}>
          <div className={styles.imageWrapper}>
            <Image
              src={`data:image/png;base64,${displayImage}`}
              alt="AI generated representation"
              width={512}
              height={512}
              className={styles.generatedImage}
              unoptimized={true}
            />
          </div>
          
          {generatedImage && (
            <>
              <p className={styles.imageInfo}>
                {generatedImage.artStyle || `Generated using ${generatedImage.castsUsed} of your posts`}
              </p>
              
              {/* Button Container */}
              <div className={styles.buttonContainer}>
                {/* Share Button */}
                <button
                  className={styles.shareButton}
                  onClick={handleShareClick}
                  disabled={!!shareStatus && shareStatus !== 'Share Result'}
                  aria-label="Share Result"
                >
                  <span role="img" aria-label="share icon">🔗</span> 
                  {shareStatus || 'Share Result'}
                </button>
                
                {/* Regenerate Button */}
                <button
                  className={styles.regenerateButton}
                  onClick={generateImageStream}
                  aria-label="Generate New Image"
                >
                  <span role="img" aria-label="refresh">🔄</span> Generate New Image
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
} 