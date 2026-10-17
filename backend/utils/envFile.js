const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

function readEnv() {
    if (!fs.existsSync(envPath)) return {};
    const values = {};
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
        const index = trimmed.indexOf('=');
        values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    });
    return values;
}

function writeEnv(updates) {
    const next = { ...readEnv(), ...updates };
    const body = `${Object.entries(next).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
    fs.writeFileSync(envPath, body, { mode: 0o600 });
    Object.entries(updates).forEach(([key, value]) => {
        process.env[key] = value;
    });
}

module.exports = { readEnv, writeEnv };
