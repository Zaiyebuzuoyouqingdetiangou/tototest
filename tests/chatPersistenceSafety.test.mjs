import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'src');
const files = fs.readdirSync(src).filter(name => name.endsWith('.js'));
const joined = files.map(name => `\n/* ${name} */\n${fs.readFileSync(path.join(src, name), 'utf8')}`).join('\n');

// SillyTavern context.saveMetadata() delegates to saveChatConditional(), so RabbitMirror
// must never invoke it merely to persist auxiliary extension metadata.
assert.equal(joined.includes('?.saveMetadata'), false, 'RabbitMirror must not access/invoke context.saveMetadata');
assert.equal(/\/api\/chats\/(?:save|delete)/.test(joined), false, 'RabbitMirror must not call direct chat save/delete endpoints');
assert.equal(/\b(?:clearChat|deleteMessage|deleteLastMessage)\s*\(/.test(joined), false, 'RabbitMirror must not invoke destructive SillyTavern chat APIs');
console.log('chatPersistenceSafety: PASS');
