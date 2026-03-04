#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { load, resetToken, CONFIG_FILE } = require('../src/config');

const PKG_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(os.homedir(), '.cogmemui-local', 'server.pid');
const VERSION = '1.1.7';

// Parse CLI args.
const args = process.argv.slice(2);

// Handle "setup" subcommand — create desktop/startup shortcuts (Windows).
if (args[0] === 'setup') {
	if (process.platform !== 'win32') {
		console.log('The setup command creates Windows shortcuts.');
		console.log('On macOS/Linux, just run: cogmemui-local');
		process.exit(0);
	}

	// Ensure config directory exists so start.bat can find it.
	const configDir = path.join(os.homedir(), '.cogmemui-local');
	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
	}

	// Generate config + token if not already present.
	load();

	// Write start.bat to config dir (uses global npm command).
	const batPath = path.join(configDir, 'start.bat');
	const batContent = [
		'@echo off',
		'setlocal enabledelayedexpansion',
		'color 0A',
		'title CogmemUI Local Companion',
		'',
		':: Stop previous instance.',
		'set "PIDFILE=%USERPROFILE%\\.cogmemui-local\\server.pid"',
		'if exist "%PIDFILE%" (',
		'    set /p OLDPID=<"%PIDFILE%"',
		'    taskkill /F /PID !OLDPID! >nul 2>&1',
		'    del "%PIDFILE%" >nul 2>&1',
		')',
		'',
		':: Copy token to clipboard.',
		'set "CONFIG=%USERPROFILE%\\.cogmemui-local\\config.json"',
		'if exist "%CONFIG%" (',
		'    for /f "tokens=2 delims=:," %%a in (\'findstr /C:"token" "%CONFIG%"\') do (',
		'        set "TOKEN=%%~a"',
		'    )',
		')',
		'if defined TOKEN (',
		'    for /f "tokens=* delims= " %%b in ("%TOKEN%") do set "TOKEN=%%~b"',
		'    echo %TOKEN%| clip',
		'    echo.',
		'    echo   Token copied to clipboard^!',
		'    echo   Paste it into CogmemUI Settings ^> Local Server',
		'    echo.',
		')',
		'',
		':: Start the companion.',
		'cogmemui-local',
		'',
	].join('\r\n');
	fs.writeFileSync(batPath, batContent);

	// Write VBS for hidden startup.
	const vbsPath = path.join(configDir, 'start-hidden.vbs');
	const vbsContent = 'CreateObject("WScript.Shell").Run "cogmemui-local", 0, False\r\n';
	fs.writeFileSync(vbsPath, vbsContent);

	// Create shortcuts via PowerShell.
	const desktopShortcut = path.join(os.homedir(), 'Desktop', 'CogmemUI Local.lnk');
	const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
	const startupShortcut = path.join(startupDir, 'CogmemUI Local.lnk');

	// Write PowerShell script to temp file to avoid quoting issues.
	const psPath = path.join(os.tmpdir(), 'cogmemui-setup.ps1');
	const psScript = [
		'$ws = New-Object -ComObject WScript.Shell',
		`$s = $ws.CreateShortcut('${desktopShortcut.replace(/'/g, "''")}')`,
		`$s.TargetPath = '${batPath.replace(/'/g, "''")}'`,
		`$s.WorkingDirectory = '${configDir.replace(/'/g, "''")}'`,
		`$s.Description = 'Start CogmemUI Local Companion'`,
		'$s.Save()',
		`$s2 = $ws.CreateShortcut('${startupShortcut.replace(/'/g, "''")}')`,
		`$s2.TargetPath = '${vbsPath.replace(/'/g, "''")}'`,
		`$s2.WorkingDirectory = '${configDir.replace(/'/g, "''")}'`,
		`$s2.Description = 'CogmemUI Local Companion (auto-start)'`,
		'$s2.Save()',
	].join('\r\n');
	fs.writeFileSync(psPath, psScript);
	try {
		execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, { windowsHide: true });
		try { fs.unlinkSync(psPath); } catch (_) {}
		console.log('');
		console.log('  CogmemUI Local Companion — Setup Complete');
		console.log('  ==========================================');
		console.log('');
		console.log('  Desktop shortcut created: "CogmemUI Local"');
		console.log('  Auto-start on login: enabled');
		console.log('');
		console.log('  Double-click the desktop shortcut to start,');
		console.log('  or just run: cogmemui-local');
		console.log('');
	} catch (e) {
		console.error('Failed to create shortcuts:', e.message);
		console.log('You can still run the companion manually: cogmemui-local');
		process.exit(1);
	}
	process.exit(0);
}

const flags = {};
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--port' && args[i + 1]) {
		flags.port = parseInt(args[i + 1]);
		i++;
	} else if (args[i] === '--allow-dir' && args[i + 1]) {
		flags.allowDir = flags.allowDir || [];
		flags.allowDir.push(args[i + 1]);
		i++;
	} else if (args[i] === '--origin' && args[i + 1]) {
		flags.origin = flags.origin || [];
		flags.origin.push(args[i + 1]);
		i++;
	} else if (args[i] === '--reset-token') {
		flags.resetToken = true;
	} else if (args[i] === '--help' || args[i] === '-h') {
		console.log(`
CogmemUI Local Companion v${VERSION}

Usage: cogmemui-local [options]

Commands:
  setup                 Create desktop shortcut + auto-start (Windows)

Options:
  --port <number>       Port to listen on (default: 3847)
  --allow-dir <path>    Allowed directory (can specify multiple)
  --origin <url>        Allowed CORS origin (can specify multiple)
  --reset-token         Generate a new bearer token
  --help, -h            Show this help

Config: ${CONFIG_FILE}
`);
		process.exit(0);
	}
}

// Lazy-load server modules (not needed for setup command above).
const { createServer } = require('../src/server');
const { getDefinitions } = require('../src/tools');
const { detectClaude } = require('../src/chat');

// Load config.
let config = flags.resetToken ? resetToken() : load();

// Apply CLI overrides.
if (flags.port) config.port = flags.port;
if (flags.allowDir) config.allowed_directories = flags.allowDir;
if (flags.origin) config.allowed_origins = flags.origin;

// Detect Claude CLI.
const claudeStatus = detectClaude();

/**
 * Check npm registry for a newer version (non-blocking).
 */
function checkForUpdate() {
	const https = require('https');
	const req = https.get('https://registry.npmjs.org/cogmemui-local/latest', { timeout: 5000 }, (res) => {
		let data = '';
		res.on('data', (chunk) => { data += chunk; });
		res.on('end', () => {
			try {
				const latest = JSON.parse(data).version;
				if (latest && latest !== VERSION) {
					console.log('');
					console.log('  \x1b[33m⚡ Update available: v' + VERSION + ' → v' + latest + '\x1b[0m');
					console.log('  \x1b[33m   Run: npm install -g cogmemui-local\x1b[0m');
					console.log('');
				}
			} catch (_) {}
		});
	});
	req.on('error', () => {}); // Silently ignore network errors.
	req.end();
}

// Start server.
const server = createServer(config);
const port = config.port || 3847;

server.listen(port, '127.0.0.1', () => {
	// Write PID file so start.bat can stop this instance later.
	try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch (_) {}

	const toolCount = getDefinitions().length;
	const dirs = config.allowed_directories.join(', ');

	const chatLine = claudeStatus.available
		? 'ENABLED (Claude ' + claudeStatus.version + ')'
		: 'disabled (claude CLI not in PATH)';

	console.log('');
	console.log('  CogmemUI Local Companion v' + VERSION);
	console.log('  ================================');
	console.log('  Server:    http://127.0.0.1:' + port);
	console.log('  Token:     ' + config.token);
	console.log('  Sandbox:   ' + dirs);
	console.log('  Tools:     ' + toolCount + ' available');
	console.log('  Chat:      ' + chatLine);
	console.log('  Shell:     ' + (config.shell_enabled ? 'ENABLED' : 'disabled'));
	console.log('  Config:    ' + CONFIG_FILE);
	console.log('');
	console.log('  Paste the URL and Token into CogmemUI');
	console.log('  Settings > Local Server to connect.');
	console.log('  (First time only — your token is saved automatically.)');
	console.log('');
	console.log('  Keep this window open while using CogmemUI.');
	console.log('  Press Ctrl+C to stop.');
	console.log('');

	// Check for updates (non-blocking).
	checkForUpdate();
});

server.on('error', (err) => {
	if (err.code === 'EADDRINUSE') {
		console.error('Error: Port ' + port + ' is already in use.');
		console.error('Use --port <number> to specify a different port.');
		process.exit(1);
	}
	console.error('Server error:', err.message);
	process.exit(1);
});

// Graceful shutdown.
function cleanup() {
	try { fs.unlinkSync(PID_FILE); } catch (_) {}
}
process.on('SIGINT', () => {
	console.log('\nShutting down...');
	cleanup();
	server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
	cleanup();
	server.close(() => process.exit(0));
});
process.on('exit', cleanup);
