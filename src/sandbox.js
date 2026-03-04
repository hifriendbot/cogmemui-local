/**
 * Path sandboxing — validates paths against allowed directories.
 */

const fs = require('fs');
const path = require('path');

function validatePath(filePath, allowedDirs, requireExists = true) {
	if (!filePath || typeof filePath !== 'string') {
		return { error: 'Path is required.' };
	}

	// Reject null bytes.
	if (filePath.includes('\0')) {
		return { error: 'Path contains null bytes.' };
	}

	// Normalize to absolute.
	const resolved = path.resolve(filePath);

	if (requireExists) {
		let real;
		try {
			real = fs.realpathSync(resolved);
		} catch (e) {
			return { error: 'Path does not exist: ' + resolved };
		}

		if (!isInSandbox(real, allowedDirs)) {
			return { error: 'Path is outside the allowed sandbox directories.' };
		}

		return { path: real };
	}

	// For new files, validate parent directory.
	const parent = path.dirname(resolved);
	let realParent;
	try {
		realParent = fs.realpathSync(parent);
	} catch (e) {
		return { error: 'Parent directory does not exist: ' + parent };
	}

	const fullPath = path.join(realParent, path.basename(resolved));

	if (!isInSandbox(fullPath, allowedDirs)) {
		return { error: 'Path is outside the allowed sandbox directories.' };
	}

	return { path: fullPath };
}

function isInSandbox(resolvedPath, allowedDirs) {
	const normalized = resolvedPath.replace(/\\/g, '/').toLowerCase();
	return allowedDirs.some(dir => {
		const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
		return normalized.startsWith(normalizedDir);
	});
}

module.exports = { validatePath };
