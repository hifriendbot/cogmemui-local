const fs = require('fs');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const { path: filePath, old_string, new_string } = input;
	if (!filePath) return { content: 'The path parameter is required.', is_error: true };
	if (old_string === undefined || old_string === '') {
		return { content: 'The old_string parameter is required.', is_error: true };
	}

	const result = validatePath(filePath, allowedDirs);
	if (result.error) return { content: result.error, is_error: true };

	try {
		const content = fs.readFileSync(result.path, 'utf8');

		// Count occurrences.
		let count = 0;
		let pos = 0;
		while ((pos = content.indexOf(old_string, pos)) !== -1) {
			count++;
			pos += old_string.length;
		}

		if (count === 0) {
			return { content: 'The old_string was not found in the file.', is_error: true };
		}
		if (count > 1) {
			return {
				content: 'The old_string was found ' + count + ' times. Please provide more surrounding context to make it unique, or use local_write_file for a full replacement.',
				is_error: true,
			};
		}

		// Single replacement.
		const idx = content.indexOf(old_string);
		const newContent = content.substring(0, idx) + (new_string || '') + content.substring(idx + old_string.length);
		fs.writeFileSync(result.path, newContent, 'utf8');

		return {
			content: 'Edited ' + result.path + ': replaced 1 occurrence (' + old_string.length + ' chars -> ' + (new_string || '').length + ' chars)',
			is_error: false,
		};
	} catch (e) {
		return { content: 'Failed to edit file: ' + e.message, is_error: true };
	}
}

module.exports = { execute };
