import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function setupDatabase() {
  try {
    console.log('Creating persona_transactions table...');
    
    // Create the persona_transactions table
    await sql`
      CREATE TABLE IF NOT EXISTS persona_transactions (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) UNIQUE NOT NULL,
        network VARCHAR(20) NOT NULL,
        user_fid INTEGER NOT NULL,
        amount DECIMAL(10, 6) NOT NULL,
        verified_at TIMESTAMP NOT NULL,
        credits_granted INTEGER NOT NULL,
        from_address VARCHAR(42) NOT NULL,
        to_address VARCHAR(42) NOT NULL,
        block_number BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    console.log('✓ persona_transactions table created');
    
    // Create indexes for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_persona_tx_hash ON persona_transactions(tx_hash)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_persona_user_fid ON persona_transactions(user_fid)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_persona_created_at ON persona_transactions(created_at)
    `;
    
    console.log('✓ Indexes created');
    
    // Verify the table structure
    const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'persona_transactions'
      ORDER BY ordinal_position
    `;
    
    console.log('\nTable structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✅ Database setup complete!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
setupDatabase();