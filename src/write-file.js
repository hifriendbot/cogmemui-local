const fs = require('fs');
const path = require('path');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const { path: filePath, content } = input;
	if (!filePath) return { content: 'The path parameter is required.', is_error: true };

	const exists = fs.existsSync(filePath);
	const result = validatePath(filePath, allowedDirs, exists);
	if (result.error) return { content: result.error, is_error: true };

	try {
		// Ensure parent directory exists.
		const dir = path.dirname(result.path);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const data = content || '';
		fs.writeFileSync(result.path, data, 'utf8');
		const lines = data.split('\n').length;

		return {
			content: 'Wrote ' + Buffer.byteLength(data) + ' bytes (' + lines + ' lines) to ' + result.path,
			is_error: false,
		};
	} catch (e) {
		return { content: 'Failed to write file: ' + e.message, is_error: true };
	}
}

module.exports = { execute };
