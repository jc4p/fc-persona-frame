import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { createPublicClient, http, parseEther } from 'viem';
import { base, arbitrum } from 'viem/chains';

// Expected recipient wallet address
const RECIPIENT_WALLET = process.env.RECIPIENT_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD5e';

// Network configurations
const NETWORKS = {
  base: {
    chainId: 8453,
    name: 'Base',
    chain: base,
    rpcUrl: process.env.ALCHEMY_BASE_RPC_URL || 'https://mainnet.base.org',
    price: 0.0005 // ETH
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum',
    chain: arbitrum,
    rpcUrl: process.env.ALCHEMY_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    price: 0.00035 // ETH
  }
};

// Create viem clients for each network
const clients = {
  base: createPublicClient({
    chain: base,
    transport: http(NETWORKS.base.rpcUrl)
  }),
  arbitrum: createPublicClient({
    chain: arbitrum,
    transport: http(NETWORKS.arbitrum.rpcUrl)
  })
};

export async function POST(request) {
  try {
    const { txHash, network, fid } = await request.json();

    // Validate inputs
    if (!txHash || !network || !fid) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!NETWORKS[network]) {
      return NextResponse.json(
        { error: 'Invalid network' },
        { status: 400 }
      );
    }

    // Check if transaction hash has been used before
    const existingTx = await sql`
      SELECT tx_hash FROM persona_transactions 
      WHERE tx_hash = ${txHash}
    `;

    if (existingTx.rows.length > 0) {
      return NextResponse.json(
        { error: 'Transaction already used' },
        { status: 400 }
      );
    }

    // Get the client for the specified network
    const client = clients[network];
    const expectedPrice = parseEther(NETWORKS[network].price.toString());

    try {
      // Get transaction receipt with retries
      let receipt = null;
      let retries = 0;
      const maxRetries = 10;
      const retryDelay = 3000; // 3 seconds

      while (!receipt && retries < maxRetries) {
        try {
          receipt = await client.getTransactionReceipt({
            hash: txHash
          });
        } catch (error) {
          if (error.name === 'TransactionReceiptNotFoundError' && retries < maxRetries - 1) {
            console.log(`Transaction not found yet, retrying... (${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retries++;
          } else {
            throw error;
          }
        }
      }

      if (!receipt) {
        return NextResponse.json(
          { error: 'Transaction not found or not confirmed after multiple attempts' },
          { status: 400 }
        );
      }

      // Check if transaction was successful
      if (receipt.status !== 'success') {
        return NextResponse.json(
          { error: 'Transaction failed' },
          { status: 400 }
        );
      }

      // Get the full transaction details
      const transaction = await client.getTransaction({
        hash: txHash
      });

      // Verify recipient address (case-insensitive comparison)
      if (transaction.to?.toLowerCase() !== RECIPIENT_WALLET.toLowerCase()) {
        return NextResponse.json(
          { error: 'Invalid recipient address' },
          { status: 400 }
        );
      }

      // Verify amount (allow some tolerance for gas variations)
      const tolerance = parseEther('0.00001'); // 0.00001 ETH tolerance
      if (transaction.value < expectedPrice - tolerance) {
        return NextResponse.json(
          { error: `Insufficient payment amount. Expected at least ${NETWORKS[network].price} ETH` },
          { status: 400 }
        );
      }

      // Store the verified transaction
      const result = await sql`
        INSERT INTO persona_transactions (
          tx_hash, 
          network, 
          user_fid, 
          amount, 
          verified_at,
          credits_granted,
          from_address,
          to_address,
          block_number
        ) VALUES (
          ${txHash},
          ${network},
          ${fid},
          ${NETWORKS[network].price},
          NOW(),
          3,
          ${transaction.from},
          ${transaction.to},
          ${receipt.blockNumber.toString()}
        )
        RETURNING *
      `;

      return NextResponse.json({
        success: true,
        credits: 3,
        transaction: result.rows[0]
      });

    } catch (viemError) {
      console.error('Viem error:', viemError);
      
      // Handle specific viem errors
      if (viemError.message?.includes('not found')) {
        return NextResponse.json(
          { error: 'Transaction not found on blockchain' },
          { status: 400 }
        );
      }
      
      throw viemError;
    }

  } catch (error) {
    console.error('Transaction verification error:', error);
    
    return NextResponse.json(
      { error: 'Transaction verification failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check transaction status
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get('txHash');
  
  if (!txHash) {
    return NextResponse.json(
      { error: 'Transaction hash required' },
      { status: 400 }
    );
  }
  
  try {
    const result = await sql`
      SELECT * FROM persona_transactions 
      WHERE tx_hash = ${txHash}
    `;
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      transaction: result.rows[0],
      used: true
    });
  } catch (error) {
    console.error('Transaction lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to check transaction' },
      { status: 500 }
    );
  }
}