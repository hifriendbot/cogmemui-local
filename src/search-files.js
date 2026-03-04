const fs = require('fs');
const path = require('path');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const { pattern, file_glob } = input;
	const searchPath = input.path || '.';

	if (!pattern) return { content: 'The pattern parameter is required.', is_error: true };

	const result = validatePath(searchPath, allowedDirs);
	if (result.error) return { content: result.error, is_error: true };

	const stat = fs.statSync(result.path);
	const matches = [];
	const maxMatches = 100;
	const maxFiles = 50;
	let filesSearched = 0;
	const startTime = Date.now();
	const timeout = 10000; // 10s

	const patternLower = pattern.toLowerCase();
	const glob = file_glob || '*';

	if (!stat.isDirectory()) {
		// Single file search.
		return searchSingleFile(result.path, patternLower, pattern);
	}

	function walk(dir) {
		if (matches.length >= maxMatches || filesSearched >= maxFiles) return;
		if (Date.now() - startTime > timeout) return;

		let items;
		try { items = fs.readdirSync(dir); } catch (e) { return; }

		for (const item of items) {
			if (matches.length >= maxMatches || filesSearched >= maxFiles) break;
			if (Date.now() - startTime > timeout) break;

			const fullPath = path.join(dir, item);
			let itemStat;
			try { itemStat = fs.statSync(fullPath); } catch (e) { continue; }

			if (itemStat.isDirectory()) {
				// Skip node_modules, .git, vendor.
				if (item === 'node_modules' || item === '.git' || item === 'vendor') continue;
				walk(fullPath);
			} else if (itemStat.isFile()) {
				if (glob !== '*' && !matchGlob(item, glob)) continue;
				if (itemStat.size > 1048576) continue;

				filesSearched++;
				try {
					const content = fs.readFileSync(fullPath, 'utf8');
					// Skip binary.
					if (/[\x00-\x08\x0E-\x1F]/.test(content.substring(0, 512))) continue;

					const lines = content.split('\n');
					const relPath = path.relative(result.path, fullPath).replace(/\\/g, '/');

					for (let i = 0; i < lines.length; i++) {
						if (matches.length >= maxMatches) break;
						if (lines[i].toLowerCase().includes(patternLower)) {
							matches.push({
								file: relPath,
								line: i + 1,
								text: lines[i].trim().substring(0, 200),
							});
						}
					}
				} catch (e) { /* skip unreadable files */ }
			}
		}
	}

	walk(result.path);

	return {
		content: JSON.stringify({
			path: result.path,
			pattern: pattern,
			matches: matches.length,
			files_searched: filesSearched,
			results: matches,
		}),
		is_error: false,
	};
}

function searchSingleFile(filePath, patternLower, pattern) {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const lines = content.split('\n');
		const matches = [];

		for (let i = 0; i < lines.length && matches.length < 100; i++) {
			if (lines[i].toLowerCase().includes(patternLower)) {
				matches.push({
					file: path.basename(filePath),
					line: i + 1,
					text: lines[i].trim().substring(0, 200),
				});
			}
		}

		return {
			content: JSON.stringify({
				path: filePath,
				pattern: pattern,
				matches: matches.length,
				files_searched: 1,
				results: matches,
			}),
			is_error: false,
		};
	} catch (e) {
		return { content: 'Failed to read file: ' + e.message, is_error: true };
	}
}

function matchGlob(filename, glob) {
	// Simple glob: *.ext or exact match.
	if (glob.startsWith('*.')) {
		return filename.endsWith(glob.substring(1));
	}
	return filename === glob;
}

module.exports = { execute };
