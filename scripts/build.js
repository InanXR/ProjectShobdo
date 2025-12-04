const fs = require('fs');
const path = require('path');

// Configuration
const SOURCE_FILE = path.join(__dirname, '../dictionary.json');
const DIST_DIR = path.join(__dirname, '../dist');

// Ensure dist directories exist
['json', 'csv', 'xml', 'sql'].forEach(dir => {
  const fullPath = path.join(DIST_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Load Dictionary
console.log('Loading dictionary...');
const rawData = fs.readFileSync(SOURCE_FILE, 'utf8');
const dictionary = JSON.parse(rawData);
console.log(`Loaded ${dictionary.length} entries.`);

// 1. JSON Minification
console.log('Generating Minified JSON...');
fs.writeFileSync(
  path.join(DIST_DIR, 'json', 'dictionary.min.json'),
  JSON.stringify(dictionary)
);

// 2. CSV Export
console.log('Generating CSV...');
const csvHeader = ['word', 'pronunciation', 'part_of_speech', 'meanings', 'english_translation', 'examples', 'etymology_source', 'etymology_derivation'];
const csvRows = [csvHeader.join(',')];

dictionary.forEach(entry => {
  const row = [
    escapeCsv(entry.word),
    escapeCsv(entry.pronunciation),
    escapeCsv(entry.part_of_speech),
    escapeCsv((entry.meanings || []).join(' | ')),
    escapeCsv(entry.english_translation),
    escapeCsv((entry.examples || []).join(' | ')),
    escapeCsv(entry.etymology?.source || ''),
    escapeCsv(entry.etymology?.derivation || '')
  ];
  csvRows.push(row.join(','));
});

fs.writeFileSync(path.join(DIST_DIR, 'csv', 'dictionary.csv'), csvRows.join('\n'));

function escapeCsv(str) {
  if (!str) return '';
  const stringified = String(str).replace(/"/g, '""'); // Escape double quotes
  if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
    return `"${stringified}"`;
  }
  return stringified;
}

// 3. TEI-XML Export (Strict)
console.log('Generating TEI XML...');
let xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>ProjectShobdo: Bengali Lexical Corpus</title>
      </titleStmt>
      <publicationStmt>
        <p>Openly released under CC-BY-SA 4.0</p>
      </publicationStmt>
      <sourceDesc>
        <p>Born from the Iseer Thesaurus project.</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>`;

dictionary.forEach((entry, index) => {
  xml += `
      <entry xml:id="entry_${index}">
        <form>
          <orth>${escapeXml(entry.word)}</orth>
          ${entry.pronunciation ? `<pron>${escapeXml(entry.pronunciation)}</pron>` : ''}
        </form>
        <gramGrp>
          <pos>${escapeXml(entry.part_of_speech)}</pos>
        </gramGrp>
        <sense>
          ${(entry.meanings || []).map(m => `<def>${escapeXml(m)}</def>`).join('\n          ')}
          ${entry.english_translation ? `<cit type="translation" xml:lang="en"><quote>${escapeXml(entry.english_translation)}</quote></cit>` : ''}
          ${(entry.examples || []).map(ex => `<cit type="example"><quote>${escapeXml(ex)}</quote></cit>`).join('\n          ')}
        </sense>
        ${entry.etymology ? `<etym>${entry.etymology.source ? `<lang>${escapeXml(entry.etymology.source)}</lang>` : ''}${escapeXml(entry.etymology.derivation || '')}</etym>` : ''}
      </entry>`;
});

xml += `
    </body>
  </text>
</TEI>`;

fs.writeFileSync(path.join(DIST_DIR, 'xml', 'dictionary.xml'), xml);

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// 4. SQL Export (SQLite Compatible Dump)
console.log('Generating SQL Dump...');
let sql = `
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pronunciation TEXT,
  part_of_speech TEXT,
  english_translation TEXT,
  etymology_source TEXT,
  etymology_derivation TEXT
);

CREATE TABLE meanings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER,
  meaning TEXT NOT NULL,
  FOREIGN KEY(entry_id) REFERENCES entries(id)
);

CREATE TABLE examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER,
  example TEXT NOT NULL,
  FOREIGN KEY(entry_id) REFERENCES entries(id)
);

BEGIN TRANSACTION;
`;

dictionary.forEach((entry, index) => {
  const entryId = index + 1;
  const word = escapeSql(entry.word);
  const pron = escapeSql(entry.pronunciation);
  const pos = escapeSql(entry.part_of_speech);
  const eng = escapeSql(entry.english_translation);
  const etymSrc = escapeSql(entry.etymology?.source);
  const etymDer = escapeSql(entry.etymology?.derivation);

  sql += `INSERT INTO entries (id, word, pronunciation, part_of_speech, english_translation, etymology_source, etymology_derivation) VALUES (${entryId}, '${word}', '${pron}', '${pos}', '${eng}', '${etymSrc}', '${etymDer}');\n`;

  (entry.meanings || []).forEach(m => {
    sql += `INSERT INTO meanings (entry_id, meaning) VALUES (${entryId}, '${escapeSql(m)}');\n`;
  });

  (entry.examples || []).forEach(ex => {
    sql += `INSERT INTO examples (entry_id, example) VALUES (${entryId}, '${escapeSql(ex)}');\n`;
  });
});

sql += 'COMMIT;';

fs.writeFileSync(path.join(DIST_DIR, 'sql', 'dictionary.sql'), sql);

function escapeSql(str) {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

console.log('Build complete! Check dist/ folder.');
