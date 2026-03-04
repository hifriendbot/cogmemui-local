const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_DIR = path.join(os.homedir(), '.cogmemui-local');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
	token: '',
	port: 3847,
	allowed_origins: ['https://hifriendbot.com'],
	allowed_directories: [os.homedir()],
	shell_enabled: false,
	command_whitelist: ['git', 'npm', 'node', 'python', 'pip'],
};

function generateToken() {
	return 'clc_' + crypto.randomBytes(32).toString('hex');
}

function load() {
	try {
		if (!fs.existsSync(CONFIG_DIR)) {
			fs.mkdirSync(CONFIG_DIR, { recursive: true });
		}

		if (fs.existsSync(CONFIG_FILE)) {
			const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
			const saved = JSON.parse(raw);
			return { ...DEFAULTS, ...saved };
		}
	} catch (e) {
		console.error('Warning: Could not read config:', e.message);
	}

	// First run — generate token and save.
	const config = { ...DEFAULTS, token: generateToken() };
	save(config);
	return config;
}

function save(config) {
	try {
		if (!fs.existsSync(CONFIG_DIR)) {
			fs.mkdirSync(CONFIG_DIR, { recursive: true });
		}
		fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
	} catch (e) {
		console.error('Warning: Could not save config:', e.message);
	}
}

function resetToken() {
	const config = load();
	config.token = generateToken();
	save(config);
	return config;
}

module.exports = { load, save, resetToken, CONFIG_FILE };
