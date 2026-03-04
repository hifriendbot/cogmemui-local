const fs = require('fs');
const path = require('path');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const { pattern } = input;
	const searchPath = input.path || '.';

	if (!pattern) return { content: 'The pattern parameter is required.', is_error: true };

	const result = validatePath(searchPath, allowedDirs);
	if (result.error) return { content: result.error, is_error: true };

	const stat = fs.statSync(result.path);
	if (!stat.isDirectory()) {
		return { content: 'Path must be a directory for local_find_files.', is_error: true };
	}

	const results = [];
	const maxResults = 500;

	function walk(dir) {
		if (results.length >= maxResults) return;

		let items;
		try { items = fs.readdirSync(dir); } catch (e) { return; }

		for (const item of items) {
			if (results.length >= maxResults) break;

			const fullPath = path.join(dir, item);
			let itemStat;
			try { itemStat = fs.statSync(fullPath); } catch (e) { continue; }

			// Skip common large directories.
			if (itemStat.isDirectory() && (item === 'node_modules' || item === '.git' || item === 'vendor')) {
				continue;
			}

			if (matchGlob(item, pattern)) {
				const relPath = path.relative(result.path, fullPath).replace(/\\/g, '/');
				results.push({
					name: relPath,
					type: itemStat.isDirectory() ? 'directory' : 'file',
					size: itemStat.isFile() ? itemStat.size : null,
				});
			}

			if (itemStat.isDirectory()) {
				walk(fullPath);
			}
		}
	}

	walk(result.path);

	return {
		content: JSON.stringify({
			path: result.path,
			pattern: pattern,
			count: results.length,
			results: results,
		}),
		is_error: false,
	};
}

function matchGlob(filename, glob) {
	if (glob.startsWith('*.')) {
		return filename.toLowerCase().endsWith(glob.substring(1).toLowerCase());
	}
	if (glob.endsWith('*')) {
		return filename.toLowerCase().startsWith(glob.slice(0, -1).toLowerCase());
	}
	if (glob.includes('*')) {
		// Convert glob to simple regex.
		const regex = new RegExp('^' + glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
		return regex.test(filename);
	}
	return filename.toLowerCase() === glob.toLowerCase();
}

module.exports = { execute };
