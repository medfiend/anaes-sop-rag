const fs = require('fs');
const path = require('path');

const xmlPath = path.join(__dirname, '../guidelines/temp_docx/word/document.xml');
const xmlContent = fs.readFileSync(xmlPath, 'utf8');

// Simple regex to extract text content between xml tags
// In docx xml, text blocks are wrapped in <w:t>...</w:t> tags
const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
let match;
const textBlocks = [];

while ((match = textRegex.exec(xmlContent)) !== null) {
  textBlocks.push(match[1]);
}

const plainText = textBlocks.join(' ');
console.log(`Extracted ${plainText.length} characters of plain text.`);

// Save to guidelines/temp_renal_text.txt
const outputPath = path.join(__dirname, '../guidelines/temp_renal_text.txt');
fs.writeFileSync(outputPath, plainText, 'utf8');
console.log(`Saved plain text to ${outputPath}`);
