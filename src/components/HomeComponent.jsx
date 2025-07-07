'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import styles from './HomeComponent.module.css';
import { 
  NETWORKS, 
  verifyAndSwitchNetwork, 
  sendETHTransaction 
} from '@/lib/frame';

// Replace with your actual wallet address
const RECIPIENT_WALLET = process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0x...';

export function HomeComponent() {
  const [userData, setUserData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [currentFunFact, setCurrentFunFact] = useState('');
  const [error, setError] = useState(null);
  const [fid, setFid] = useState(null);
  
  // Payment and credits state
  const [selectedNetwork, setSelectedNetwork] = useState('arbitrum');
  const [generationCredits, setGenerationCredits] = useState(0);
  const [sessionImages, setSessionImages] = useState([]);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [transactionHash, setTransactionHash] = useState(null);
  const [selectedHistoryImage, setSelectedHistoryImage] = useState(null);

  // Load cached credits on mount
  useEffect(() => {
    if (fid) {
      const cachedData = localStorage.getItem(`fc-persona-${fid}`);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed.credits > 0) {
            setGenerationCredits(parsed.credits);
          }
          // Note: We don't restore session images due to localStorage size limits
        } catch (e) {
          console.error('Error loading cached data:', e);
        }
      }
    }
  }, [fid]);

  // Save credits to localStorage whenever they change (not images due to size)
  useEffect(() => {
    if (fid) {
      const dataToCache = {
        credits: generationCredits,
        imageCount: sessionImages.length,
        lastUpdated: Date.now()
      };
      try {
        localStorage.setItem(`fc-persona-${fid}`, JSON.stringify(dataToCache));
      } catch (e) {
        console.error('Failed to save to localStorage:', e);
      }
    }
  }, [fid, generationCredits, sessionImages.length]);

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

  // Handle payment
  const handlePayment = useCallback(async () => {
    if (!fid) return;
    
    setIsPaying(true);
    setPaymentStatus('Checking network...');
    setError(null);
    
    try {
      // Verify/switch to the selected network
      await verifyAndSwitchNetwork(selectedNetwork);
      
      setPaymentStatus('Requesting payment...');
      
      // Send ETH transaction
      const price = NETWORKS[selectedNetwork].price;
      const txHash = await sendETHTransaction(RECIPIENT_WALLET, price);
      
      setTransactionHash(txHash);
      setPaymentStatus('Verifying transaction...');
      
      // First check if this transaction was already used locally
      const usedTransactions = JSON.parse(localStorage.getItem('fc-persona-used-txs') || '[]');
      if (usedTransactions.includes(txHash)) {
        throw new Error('This transaction has already been used');
      }

      // Verify transaction with backend
      const verifyResponse = await fetch('/api/verify-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
          network: selectedNetwork,
          fid
        }),
      });
      
      const verifyData = await verifyResponse.json();
      
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Transaction verification failed');
      }
      
      // Store used transaction locally
      usedTransactions.push(txHash);
      localStorage.setItem('fc-persona-used-txs', JSON.stringify(usedTransactions));
      
      // Grant credits
      setGenerationCredits(verifyData.credits || 3);
      setSessionImages([]); // Reset session images for new payment
      setPaymentStatus('Payment successful!');
      
      // Clear payment status after delay
      setTimeout(() => {
        setPaymentStatus('');
        setTransactionHash(null);
      }, 3000);
      
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed');
      setPaymentStatus('');
      // Clear error after a delay
      setTimeout(() => {
        setError(null);
      }, 5000);
    } finally {
      setIsPaying(false);
    }
  }, [fid, selectedNetwork]);

  // Generate image with streaming
  const generateImageStream = useCallback(async () => {
    if (!fid || generationCredits <= 0) return;
    
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
            const newImage = {
              imageBase64: data.imageBase64,
              castsUsed: data.castsUsed,
              timestamp: data.timestamp,
              artStyle: data.artStyle
            };
            setGeneratedImage(newImage);
            setGenerationStatus('Complete!');
            
            // Add to session history
            setSessionImages(prev => [...prev, newImage]);
            
            // Decrease credits
            setGenerationCredits(prev => prev - 1);
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
  }, [fid, generationCredits]);


  // Loading State UI
  if (!fid || isLoading) {
    return (
      <div className={`${styles.container} ${styles.loadingContainer}`}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>{!fid ? "Waiting for frame context..." : "Initializing..."}</p>
      </div>
    );
  }

  // Payment Screen (when no credits)
  if (generationCredits === 0 && !generatedImage) {
    return (
      <div className={styles.paymentContainer}>
        {/* Credits display */}
        {sessionImages.length > 0 && (
          <div className={styles.creditsDisplay}>
            <span>Credits: <span className={styles.creditsCount}>0</span></span>
          </div>
        )}
        
        <div className={styles.paymentCard}>
          <h1 className={styles.titleSmall}>Farcaster Personas</h1>
          <p className={styles.introText}>What does your Farcaster Persona look like? We'll analyze your casts to see.</p>
          
          {/* Network selector */}
          <div className={styles.networkSelector}>
            <button
              className={`${styles.networkButton} ${selectedNetwork === 'base' ? styles.active : ''}`}
              onClick={() => setSelectedNetwork('base')}
              disabled={isPaying}
            >
              Base
            </button>
            <button
              className={`${styles.networkButton} ${selectedNetwork === 'arbitrum' ? styles.active : ''}`}
              onClick={() => setSelectedNetwork('arbitrum')}
              disabled={isPaying}
            >
              <div>
                <div>Arbitrum</div>
                <div className={styles.networkSaveLabel}>Save 30%</div>
              </div>
            </button>
          </div>
          
          {/* Price display */}
          <div className={styles.priceDisplay}>
            {NETWORKS[selectedNetwork].price} ETH
          </div>
          <p className={styles.priceLabel}>
            Pay once, generate 3 images
          </p>
          
          {/* Payment button */}
          <button
            className={styles.payButton}
            onClick={handlePayment}
            disabled={isPaying}
          >
            {isPaying ? 'Processing...' : 'Pay to Generate'}
          </button>
          
          {/* Transaction status */}
          {paymentStatus && (
            <div className={`${styles.transactionStatus} ${
              paymentStatus.includes('successful') ? styles.transactionSuccess :
              paymentStatus.includes('failed') ? styles.transactionError :
              styles.transactionPending
            }`}>
              {paymentStatus}
            </div>
          )}
          
          {/* Error display */}
          {error && (
            <div className={styles.transactionError}>
              {error}
            </div>
          )}
        </div>
        
        {/* Show previous images from this session */}
        {sessionImages.length > 0 && (
          <div className={styles.sessionHistory}>
            {sessionImages.map((img, index) => (
              <div key={index} className={styles.historyImageWrapper}>
                <span className={styles.historyImageNumber}>#{index + 1}</span>
                <Image
                  src={`data:image/png;base64,${img.imageBase64}`}
                  alt={`Generation ${index + 1}`}
                  width={150}
                  height={150}
                  className={styles.historyImage}
                  unoptimized={true}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Show the final image
  const displayImage = generatedImage?.imageBase64;

  // Main Content UI (with credits)
  return (
    <div className={styles.container}>
      {/* Credits display */}
      <div className={styles.creditsDisplay}>
        <span>Credits: <span className={styles.creditsCount}>{generationCredits}</span></span>
      </div>
      
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
          Farcaster Personas
        </h1>
      </div>

      {/* Show previous images from this session */}
      {sessionImages.length > 1 && !isGenerating && (
        <div className={styles.sessionHistory}>
          {sessionImages.slice(0, -1).map((img, index) => (
            <div key={index} className={styles.historyImageWrapper}>
              <span className={styles.historyImageNumber}>#{index + 1}</span>
              <Image
                src={`data:image/png;base64,${img.imageBase64}`}
                alt={`Generation ${index + 1}`}
                width={150}
                height={150}
                className={styles.historyImage}
                unoptimized={true}
                onClick={() => setSelectedHistoryImage(selectedHistoryImage === index ? null : index)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Show selected history image full size */}
      {selectedHistoryImage !== null && sessionImages[selectedHistoryImage] && !isGenerating && (
        <div className={styles.selectedHistoryContainer}>
          <Image
            src={`data:image/png;base64,${sessionImages[selectedHistoryImage].imageBase64}`}
            alt={`Generation ${selectedHistoryImage + 1}`}
            width={512}
            height={512}
            className={styles.selectedHistoryImage}
            unoptimized={true}
            onClick={() => setSelectedHistoryImage(null)}
          />
        </div>
      )}

      {/* Generate Button (shown when have credits but no current image) */}
      {!generatedImage && !isGenerating && generationCredits > 0 && (
        <div className={styles.generateContainer}>
          <p className={styles.introText}>
            {sessionImages.length === 0 
              ? "We'll analyze all your casts (ever!) to generate a unique persona."
              : `You have ${generationCredits} generation${generationCredits > 1 ? 's' : ''} remaining`
            }
          </p>
          <button
            className={styles.generateButton}
            onClick={generateImageStream}
            aria-label="Generate Image"
          >
            <span role="img" aria-label="sparkles">✨</span> Generate {sessionImages.length > 0 ? 'Another' : ''} Image
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
                {/* Regenerate Button (only if credits remain) */}
                {generationCredits > 0 && (
                  <button
                    className={styles.regenerateButton}
                    onClick={generateImageStream}
                    aria-label="Generate New Image"
                  >
                    <span role="img" aria-label="refresh">🔄</span> Generate New Image
                  </button>
                )}
                
                {/* Restart Button (if no credits) */}
                {generationCredits === 0 && (
                  <button
                    className={styles.regenerateButton}
                    onClick={() => {
                      setGeneratedImage(null);
                      setSessionImages([]);
                    }}
                    aria-label="Restart"
                  >
                    <span role="img" aria-label="restart">↻</span> Restart
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}