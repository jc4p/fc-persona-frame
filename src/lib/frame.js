import * as frame from '@farcaster/frame-sdk'

// Network configurations
export const NETWORKS = {
  base: {
    chainId: 8453,
    chainIdHex: '0x2105',
    name: 'Base',
    price: 0.0005
  },
  arbitrum: {
    chainId: 42161,
    chainIdHex: '0xa4b1',
    name: 'Arbitrum',
    price: 0.00035
  }
};

export async function initializeFrame() {
  // Await the context promise
  const context = await frame.sdk.context;

  if (!context || !context.user) {
    // console.log('Not in frame context');
    return;
  }

  // Handle potential nested user object (known issue)
  let user = context.user;
  if (user && typeof user === 'object' && 'fid' in user && 'user' in user && user.user) {
    // console.warn('Detected nested user object, accessing user.user');
    user = user.user;
  }

  // Ensure user object has fid
  if (!user || typeof user.fid !== 'number') {
    console.error('User object or fid is missing or invalid in frame context:', user);
    return;
  }

  // console.log('Frame context initialized for user FID:', user.fid);

  // Make FID globally accessible
  // console.log('Setting window.userFid =', user.fid);
  window.userFid = user.fid;

  // Call the ready function to remove splash screen
  try {
    await frame.sdk.actions.ready();
    // console.log('Frame ready signal sent.');
  } catch (error) {
    console.error('Error signaling frame ready:', error);
  }
}

export async function shareCastIntent(castText, embedUrl) {
  if (!castText || !embedUrl) {
    // console.error('shareCastIntent: castText and embedUrl are required.');
    throw new Error('Cast text and embed URL are required for sharing.');
  }

  try {
    const finalComposeUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(embedUrl)}`;
    
    // Ensure the SDK is available and has the necessary methods
    if (!frame || !frame.sdk || !frame.sdk.actions || !frame.sdk.actions.openUrl) {
        throw new Error('Farcaster SDK or actions.openUrl not available.');
    }

    await frame.sdk.actions.openUrl({ url: finalComposeUrl });
    // console.log('Successfully opened Warpcast compose intent:', finalComposeUrl);
  } catch (error) {
    console.error('Error in shareCastIntent opening URL:', error);
    // Re-throw the error so the calling component can handle it if needed
    throw error; 
  }
}

// Wallet utilities
export function ethToWei(eth) {
  // Convert to BigInt and multiply by 10^18
  const wei = BigInt(Math.floor(eth * 1e18)).toString(16);
  return '0x' + wei;
}

export async function getCurrentChainId() {
  try {
    const chainId = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_chainId'
    });
    
    const chainIdDecimal = typeof chainId === 'number' ? chainId : parseInt(chainId, 16);
    return chainIdDecimal;
  } catch (error) {
    console.error('Error getting chain ID:', error);
    throw error;
  }
}

export async function switchNetwork(network) {
  const networkConfig = NETWORKS[network];
  if (!networkConfig) {
    throw new Error('Invalid network');
  }
  
  try {
    await frame.sdk.wallet.ethProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: networkConfig.chainIdHex }]
    });
    return true;
  } catch (error) {
    console.error('Error switching network:', error);
    throw error;
  }
}

export async function sendETHTransaction(to, amount) {
  try {
    // Get the user's wallet address
    const accounts = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_requestAccounts'
    });
    
    if (!accounts || !accounts[0]) {
      throw new Error('No wallet connected');
    }
    
    // Convert ETH to Wei
    const weiValue = ethToWei(amount);
    
    // Send transaction
    const txHash = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: accounts[0],
        to: to,
        value: weiValue
      }]
    });
    
    return txHash;
  } catch (error) {
    console.error('Error sending ETH transaction:', error);
    throw error;
  }
}

export async function verifyAndSwitchNetwork(expectedNetwork) {
  const currentChainId = await getCurrentChainId();
  const expectedChainId = NETWORKS[expectedNetwork].chainId;
  
  if (currentChainId !== expectedChainId) {
    console.log(`Switching from chain ${currentChainId} to ${expectedNetwork} (${expectedChainId})`);
    await switchNetwork(expectedNetwork);
  }
  
  return true;
} 