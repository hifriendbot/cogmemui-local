const fs = require('fs');
const { validatePath } = require('./sandbox');

function execute(input, allowedDirs) {
	const { path: filePath } = input;
	const result = validatePath(filePath, allowedDirs);
	if (result.error) return { content: result.error, is_error: true };

	try {
		const stat = fs.statSync(result.path);
		if (stat.isDirectory()) {
			return { content: 'Path is a directory. Use local_list_directory instead.', is_error: true };
		}
		if (stat.size > 1048576) {
			return { content: 'File is too large (' + Math.round(stat.size / 1024) + 'KB). Maximum is 1MB.', is_error: true };
		}

		const content = fs.readFileSync(result.path, 'utf8');
		const lines = content.split('\n');
		const total = lines.length;
		const offset = Math.max(0, parseInt(input.offset) || 0);
		const limit = Math.min(500, Math.max(1, parseInt(input.limit) || 500));

		const slice = lines.slice(offset, offset + limit);
		let output = '';
		for (let i = 0; i < slice.length; i++) {
			const lineNum = String(offset + i + 1).padStart(4, ' ');
			output += lineNum + '\t' + slice[i] + '\n';
		}

		let header = 'File: ' + result.path + ' (' + total + ' lines total)';
		if (offset > 0 || total > limit) {
			const shownEnd = Math.min(offset + limit, total);
			header += '\nShowing lines ' + (offset + 1) + '-' + shownEnd;
		}

		return { content: header + '\n' + '─'.repeat(60) + '\n' + output, is_error: false };
	} catch (e) {
		return { content: 'Failed to read file: ' + e.message, is_error: true };
	}
}

module.exports = { execute };
