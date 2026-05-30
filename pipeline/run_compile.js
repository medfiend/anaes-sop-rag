const { compileGuideline } = require('./compile');
const { auditCompiledSchema } = require('./audit');
const path = require('path');

async function run() {
  const pdfPath = path.join(__dirname, '../guidelines/Dexmed SOP for AFOI.KD..pdf');
  console.log(`\n[RUNNER] Initiating compilation pipeline for: ${path.basename(pdfPath)}`);
  
  // 1. Run compilation
  const compiledSchema = await compileGuideline({
    filePath: pdfPath,
    version: '1.0.0',
    ownerEmail: 'olivia.kent@nhs.net',
    dateNextReview: '2028-05-29T00:00:00Z',
    supersedesId: null
  });
  
  // 2. Run adversarial auditing
  const auditReport = await auditCompiledSchema({
    pdfPath: pdfPath,
    compiledSchema: compiledSchema
  });
  
  console.log('\n=======================================');
  console.log('        PIPELINE RUN COMPLETED         ');
  console.log('=======================================');
  console.log(`Audit Verdict: ${auditReport.verdict}`);
  console.log(`Details: ${auditReport.reason}`);
  if (auditReport.discrepancies && auditReport.discrepancies.length > 0) {
    console.log('Discrepancies found:', JSON.stringify(auditReport.discrepancies, null, 2));
  }
  console.log('=======================================\n');
}

run().catch(err => {
  console.error('[RUNNER ERROR] Pipeline run failed:', err);
  process.exit(1);
});
