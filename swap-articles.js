const fs = require('fs');

// Read files
const currentIndex = fs.readFileSync('index.html', 'utf8');
const originalIndex = fs.readFileSync('index_original.html', 'utf8');
let airdrop = fs.readFileSync('airdrop.html', 'utf8');

// Extract original article from index_original.html (EIP-2612 English)
const origStart = originalIndex.indexOf('<!-- ── TECHNICAL ARTICLE ── -->');
const origAfter = originalIndex.indexOf('<!-- ── FOOTER ── -->', origStart);
const originalArticle = originalIndex.substring(origStart, origAfter).trimEnd();

// Extract current article from index.html (Chinese 5-tier loyalty)
const curStart = currentIndex.indexOf('<!-- ── TECHNICAL ARTICLE ── -->');
const curAfter = currentIndex.indexOf('<!-- ── FOOTER ── -->', curStart);
const chineseArticle = currentIndex.substring(curStart, curAfter).trimEnd();

// 1. Replace current article with original in index.html
let newIndex = currentIndex.substring(0, curStart) + originalArticle + '\n\n' + currentIndex.substring(curAfter);
fs.writeFileSync('index.html', newIndex, 'utf8');
console.log('✅ index.html: Chinese article → original EIP-2612 article');

// 2. Add Chinese article to airdrop.html (before toast container)
const toastPos = airdrop.indexOf('<div id="toastContainer">');
// Wrap article as a standalone section with its own card style
const articleHtml = '\n\n  <!-- ── LOYALTY ARTICLE ── -->\n  <div class="card reveal" style="max-width:960px;margin:32px auto;">\n' +
  chineseArticle.replace('<!-- ── TECHNICAL ARTICLE ── -->', '').trim() +
  '\n  </div>\n\n';
airdrop = airdrop.substring(0, toastPos) + articleHtml + airdrop.substring(toastPos);
fs.writeFileSync('airdrop.html', airdrop, 'utf8');
console.log('✅ airdrop.html: added Chinese 5-tier loyalty article');

// Clean up temp files
fs.unlinkSync('index_original.html');
fs.unlinkSync('index_v25.html');
console.log('✅ Cleaned up temp files');
