const fs = require('fs');
const path = require('path');

async function parsePdf() {
  console.log("Reading text of Renal Transplant Guidelines 2023.pdf...");
  try {
    const pdfjs = require('pdfjs-dist');
    const pdfPath = './public/Renal Transplant Guidelines 2023.pdf';
    const dataBuffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    // Load document
    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    console.log(`Number of pages: ${pdf.numPages}`);
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      console.log(`--- Page ${i} ---`);
      console.log(text.substring(0, 2000));
    }
  } catch (err) {
    console.error("Error parsing PDF:", err);
  }
}

parsePdf();
