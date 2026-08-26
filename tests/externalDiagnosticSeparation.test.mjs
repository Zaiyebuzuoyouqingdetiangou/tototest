import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const external = fs.readFileSync(path.join(root, 'src', 'externalDiagnostics.js'), 'utf8');
const sanitizer = fs.readFileSync(path.join(root, 'src', 'outputSanitizer.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src', 'ui.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

assert.match(external, /RabbitMirror 外部代码／宿主性能诊断/);
assert.match(ui, /外部代码／宿主性能诊断（测试版）/);
assert.match(ui, /不读取兔子镜内部生成或维修状态/);
assert.match(ui, /📋 生成全链路诊断/);
assert.match(sanitizer, /兔子镜小剧场 全链路诊断/);
assert.match(sanitizer, /诊断模式: 一次性全链路诊断（已自动停止）/);

assert.doesNotMatch(external, /maintenance\.userRepair|maintenance\.autoRepair|maintenance\.independentPersist/);
assert.doesNotMatch(external, /from ['"].*outputSanitizer|from ['"].*independentApi/);
assert.doesNotMatch(external, /globalThis\.fetch\s*=/);
assert.doesNotMatch(external, /requestBody|responseBody|persona_description|worldInfo|independentPersist|userRepair|autoRepair/);
assert.doesNotMatch(external, /__rabbitMirrorDiag/);
assert.match(index, /initRabbitMirrorExternalDiagnostics/);
assert.match(index, /destroyRabbitMirrorExternalDiagnostics/);

console.log('external diagnostic separation: PASS');
