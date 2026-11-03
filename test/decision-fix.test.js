// =============================================================================
//  test/decision-fix.test.js — Pruebas para respuestas de decisiones y permisos
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../main/ai-logic');

test('Decisiones: describeDecision recorta textos largos y mantiene estructura', () => {
  const longQuestion = '¿Me das permiso para ejecutar este comando? '.repeat(10);
  const payload = {
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          question: longQuestion,
          options: [{ label: 'Sí, ejecútalo' }, { label: 'No' }],
        },
      ],
    },
  };
  const session = { id: 's1', source: 'claude', project: 'Notch' };
  const desc = logic.describeDecision('question', payload, session);

  assert.strictEqual(desc.kind, 'question');
  assert.strictEqual(desc.questions.length, 1);
  assert.ok(desc.questions[0].question.length <= 300);
  assert.ok(desc.questions[0].question.endsWith('…'));
});

test('Decisiones: cleanAnswers resuelve coincidencia exacta, clipped y por índice', () => {
  const longQuestion = 'A'.repeat(350);
  const payload = {
    tool_input: {
      questions: [
        { question: longQuestion },
        { question: 'Segunda pregunta corta' },
      ],
    },
  };

  // Caso 1: front manda la pregunta recortada (clipped) generada por describeDecision
  const clippedQuestion = `${longQuestion.slice(0, 299)}…`;
  const answersClipped = {
    [clippedQuestion]: 'Respuesta 1',
    'Segunda pregunta corta': 'Respuesta 2',
  };
  const cleaned1 = logic.cleanAnswers(payload, answersClipped);
  assert.ok(cleaned1);
  assert.strictEqual(cleaned1[longQuestion], 'Respuesta 1');
  assert.strictEqual(cleaned1['Segunda pregunta corta'], 'Respuesta 2');

  // Caso 2: front manda por índice
  const answersByIndex = {
    0: 'Respuesta 1 por índice',
    1: 'Respuesta 2 por índice',
  };
  const cleaned2 = logic.cleanAnswers(payload, answersByIndex);
  assert.ok(cleaned2);
  assert.strictEqual(cleaned2[longQuestion], 'Respuesta 1 por índice');
  assert.strictEqual(cleaned2['Segunda pregunta corta'], 'Respuesta 2 por índice');
});

test('Decisiones: buildResponse para permission genera ambos formatos (allow, always, deny)', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'java -version' },
    permission_suggestions: [{ type: 'addRules', behavior: 'allow', rules: [{ toolName: 'Bash' }] }],
  };

  // allow
  const allowResp = logic.buildResponse('permission', payload, 'allow');
  assert.strictEqual(allowResp.hookSpecificOutput.hookEventName, 'PermissionRequest');
  assert.strictEqual(allowResp.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(allowResp.hookSpecificOutput.decision.behavior, 'allow');

  // always
  const alwaysResp = logic.buildResponse('permission', payload, 'always');
  assert.strictEqual(alwaysResp.hookSpecificOutput.permissionDecision, 'allow');
  assert.strictEqual(alwaysResp.hookSpecificOutput.decision.behavior, 'allow');
  assert.ok(alwaysResp.hookSpecificOutput.decision.updatedPermissions);

  // deny
  const denyResp = logic.buildResponse('permission', payload, 'deny');
  assert.strictEqual(denyResp.hookSpecificOutput.permissionDecision, 'deny');
  assert.strictEqual(denyResp.hookSpecificOutput.decision.behavior, 'deny');
  assert.ok(denyResp.hookSpecificOutput.permissionDecisionReason);
});

test('Decisiones: buildResponse para question pasa respuestas y evita bloqueo de terminal', () => {
  const payload = {
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          question: '¿Me das permiso para ejecutar `java -version` en tu terminal?',
          options: [{ label: 'Sí, ejecútalo' }, { label: 'No' }],
        },
      ],
    },
  };

  const resp = logic.buildResponse('question', payload, 'answer', {
    answers: { 0: 'Sí, ejecútalo' },
  });

  assert.ok(resp);
  assert.strictEqual(resp.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(resp.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(resp.hookSpecificOutput.permissionDecisionReason.includes('Sí, ejecútalo'));
  assert.ok(resp.hookSpecificOutput.additionalContext.includes('Sí, ejecútalo'));
  assert.strictEqual(
    resp.hookSpecificOutput.updatedInput.answers['¿Me das permiso para ejecutar `java -version` en tu terminal?'],
    'Sí, ejecútalo'
  );
});
