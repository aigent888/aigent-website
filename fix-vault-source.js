const { execSync } = require('child_process');
const fs = require('fs');
const src = execSync('git -C "c:/Users/Administrator/Desktop/新建文件夹" show "82a08ab:contracts/AIGENTVault.sol"', { encoding: 'utf8' });
const clean = src.replace(/^﻿/, '');
fs.writeFileSync('c:/Users/Administrator/Desktop/新建文件夹/contracts/AIGENTVault.sol', clean, 'utf8');
console.log('Written OK, length:', clean.length);
console.log('First line:', clean.split('\n')[0]);
