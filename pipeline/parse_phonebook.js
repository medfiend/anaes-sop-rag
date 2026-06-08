const fs = require('fs');
const path = require('path');

const htmlPath = path.join(process.cwd(), 'Phonebook', 'BTS PhoneWare Search Results.html');
const outputJsonDir = path.join(process.cwd(), 'data');
const outputJsonPath = path.join(outputJsonDir, 'phonebook.json');

function parsePhonebook() {
  console.log("Reading Phonebook HTML from:", htmlPath);
  if (!fs.existsSync(htmlPath)) {
    console.error("Error: Phonebook HTML file not found at", htmlPath);
    return false;
  }

  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    console.log("HTML file size:", html.length, "bytes");

    const rows = [];
    
    // Regular expression to extract rows
    const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let trMatch;

    let rowCount = 0;
    while ((trMatch = trRegex.exec(html)) !== null) {
      rowCount++;
      const rowHtml = trMatch[1];
      
      // Filter for rows containing the main text styling
      if (!rowHtml.includes('#000084') && !rowHtml.includes('color="#000084"')) {
        continue;
      }

      // Split row into cell blocks
      const cells = [];
      const tdRegex = /<td[\s\S]*?>([\s\S]*?)<\/td>/g;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        cells.push(tdMatch[1].trim());
      }

      if (cells.length < 9) {
        continue;
      }

      // Helper to clean tags and sanitize text
      const cleanCell = (text) => {
        return text
          .replace(/<[^>]*>/g, '') // strip HTML tags
          .replace(/&nbsp;/g, '') // strip non-breaking spaces
          .replace(/&#38;/g, '&') // ampersand
          .replace(/&#39;/g, "'") // apostrophe
          .replace(/&amp;/g, '&')
          .trim();
      };

      const name = cleanCell(cells[1]);
      const jobTitle = cleanCell(cells[2]);
      const department = cleanCell(cells[3]);
      const extn = cleanCell(cells[4]);
      const altExtn = cleanCell(cells[5]);
      const bleep = cleanCell(cells[6]);
      const room = cleanCell(cells[7]);
      const site = cleanCell(cells[8]);

      // Filter out utility rows like parking slots that don't have ext/bleep or names
      if (!name || (!extn && !bleep && !altExtn)) {
        continue;
      }

      rows.push({
        name,
        jobTitle,
        department,
        extn,
        altExtn,
        bleep,
        room,
        site
      });
    }

    console.log(`Found ${rowCount} raw rows. Extracted ${rows.length} valid contacts.`);

    if (!fs.existsSync(outputJsonDir)) {
      fs.mkdirSync(outputJsonDir, { recursive: true });
    }

    fs.writeFileSync(outputJsonPath, JSON.stringify(rows, null, 2));
    console.log("Saved parsed phonebook database to:", outputJsonPath);
    return true;

  } catch (err) {
    console.error("Failed to parse phonebook HTML:", err);
    return false;
  }
}

// Run the script directly
parsePhonebook();
