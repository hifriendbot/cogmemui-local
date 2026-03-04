const fs = require('fs');
const path = require('path');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const dirPath = input.path || '.';
	const result = validatePath(dirPath, allowedDirs);
	if (result.error) return { content: result.error, is_error: true };

	try {
		const stat = fs.statSync(result.path);
		if (!stat.isDirectory()) {
			return { content: 'Path is not a directory.', is_error: true };
		}

		const recursive = !!input.recursive;
		const maxDepth = recursive ? Math.min(5, Math.max(1, parseInt(input.max_depth) || 1)) : 1;
		const entries = [];
		const maxItems = 1000;

		scan(result.path, result.path, entries, 0, maxDepth, maxItems);

		return {
			content: JSON.stringify({ path: result.path, count: entries.length, entries }),
			is_error: false,
		};
	} catch (e) {
		return { content: 'Failed to list directory: ' + e.message, is_error: true };
	}
}

function scan(basePath, dirPath, entries, depth, maxDepth, maxItems) {
	if (entries.length >= maxItems || depth >= maxDepth) return;

	let items;
	try {
		items = fs.readdirSync(dirPath);
	} catch (e) {
		return;
	}

	for (const item of items) {
		if (entries.length >= maxItems) break;

		const fullPath = path.join(dirPath, item);
		const relPath = path.relative(basePath, fullPath);
		let isDir = false;

		try {
			isDir = fs.statSync(fullPath).isDirectory();
		} catch (e) {
			continue;
		}

		const entry = { name: relPath.replace(/\\/g, '/'), type: isDir ? 'directory' : 'file' };
		if (!isDir) {
			try { entry.size = fs.statSync(fullPath).size; } catch (e) { /* skip */ }
		}
		entries.push(entry);

		if (isDir && (depth + 1) < maxDepth) {
			scan(basePath, fullPath, entries, depth + 1, maxDepth, maxItems);
		}
	}
}

module.exports = { execute };
