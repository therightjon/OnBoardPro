import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Create connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/onboardpro'
});

const db = drizzle(pool);

async function checkDepartments() {
  try {
    console.log('Connecting to database...');
    
    // Query all departments directly with raw SQL
    const result = await pool.query('SELECT id, name, archived, "createdAt", "updatedAt" FROM departments ORDER BY "createdAt" DESC');
    
    console.log('\n=== ALL DEPARTMENTS ===');
    console.log('Total departments:', result.rows.length);
    
    result.rows.forEach((dept, index) => {
      console.log(`${index + 1}. ${dept.name} (ID: ${dept.id.substring(0, 8)}...) - Archived: ${dept.archived} - Created: ${dept.createdAt.toISOString().split('T')[0]}`);
    });
    
    const archivedCount = result.rows.filter(dept => dept.archived === true).length;
    const activeCount = result.rows.filter(dept => dept.archived === false).length;
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Active departments: ${activeCount}`);
    console.log(`Archived departments: ${archivedCount}`);
    console.log(`Total: ${result.rows.length}`);
    
    if (archivedCount > 0) {
      console.log('\n=== ARCHIVED DEPARTMENTS ===');
      result.rows.filter(dept => dept.archived === true).forEach((dept, index) => {
        console.log(`${index + 1}. ${dept.name} (ID: ${dept.id}) - Updated: ${dept.updatedAt ? dept.updatedAt.toISOString() : 'Never'}`);
      });
    }
    
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDepartments();