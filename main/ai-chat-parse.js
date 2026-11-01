// =============================================================================
//  main/ai-chat-parse.js — Entender lo que escriben los CLI del chat (lógica pura)
// -----------------------------------------------------------------------------
//  Los tres CLI escriben una línea JSON por cada cosa que pasa ("stream-json"):
//    • Claude Code:  {"type":"stream_event","event":{"delta":{"type":"text_delta","text":"Ho"}}}
//                    ...y al final {"type":"result","is_error":false,"result":"Hola"}
//    • Gemini CLI:   {"type":"message","role":"assistant","content":"Ho","delta":true}
//                    ...y al final {"type":"result","status":"success"}
//    • Antigravity:  init, step_update y result (aún sin documentar del todo:
//                    aceptamos varias formas y, si algo no se entiende, se ignora)
//  Cada función recibe una línea y devuelve qué significa:
//    { delta } texto nuevo · { full } el texto completo · { model } · { error }
//    { done } terminó · { retry } está reintentando · null = nada útil
// =============================================================================

'use strict';

function parseJson(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('{')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** El texto de un mensaje de Claude ({ content: [{ type: 'text', text }] }). */
function textBlocks(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/** Una línea de `claude -p --output-format stream-json --include-partial-messages`. */
function parseClaudeLine(line) {
  const data = parseJson(line);
  if (!data) return null;
  if (data.type === 'system' && data.subtype === 'init') return typeof data.model === 'string' ? { model: data.model } : null;
  if (data.type === 'system' && data.subtype === 'api_retry') return { retry: true };
  if (data.type === 'stream_event') {
    const delta = data.event?.delta;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') return { delta: delta.text };
    return null;
  }
  // El mensaje completo (llega aunque no haya trozos, p. ej. con versiones antiguas)
  if (data.type === 'assistant' && !data.parent_tool_use_id) {
    const full = textBlocks(data.message);
    return full ? { full, partial: true } : null;
  }
  if (data.type === 'result') {
    if (data.is_error || (typeof data.subtype === 'string' && data.subtype.startsWith('error'))) {
      return { error: typeof data.result === 'string' && data.result ? data.result : 'Claude no pudo responder', done: true };
    }
    return { full: typeof data.result === 'string' ? data.result : undefined, done: true };
  }
  return null;
}

/** Una línea de `gemini --output-format stream-json`. */
function parseGeminiLine(line) {
  const data = parseJson(line);
  if (!data) return null;
  if (data.type === 'init') return typeof data.model === 'string' ? { model: data.model } : null;
  if (data.type === 'message' && data.role === 'assistant' && typeof data.content === 'string') {
    return data.delta ? { delta: data.content } : { full: data.content, partial: true };
  }
  if (data.type === 'error') {
    const message = data.message || data.error?.message;
    return data.severity === 'warning' ? null : { error: String(message || 'Gemini dio un error') };
  }
  if (data.type === 'result') {
    if (data.status === 'error' || data.error) {
      return { error: String(data.error?.message || data.error || 'Gemini no pudo responder'), done: true };
    }
    return { full: typeof data.response === 'string' ? data.response : undefined, done: true };
  }
  return null;
}

/** El primer texto que encontremos en estos campos. */
function pickText(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string') return object[key];
  }
  return undefined;
}

/**
 * Una línea de `agy -p ... --output-format stream-json`. Su formato no está
 * documentado del todo, así que somos tolerantes: probamos los campos más
 * probables y, si una línea no es JSON, la tratamos como texto normal.
 */
function parseAgyLine(line) {
  const text = String(line || '');
  const data = parseJson(text);
  if (!data) return text.trim() ? { delta: `${text}\n`, plain: true } : null;
  if (data.type === 'init') return typeof data.model === 'string' ? { model: data.model } : null;
  if (data.type === 'result') {
    const failed = data.is_error === true || data.status === 'error' || data.finished_reason === 'error' || Boolean(data.error);
    const full = pickText(data, ['result', 'response', 'text', 'content', 'output']);
    if (failed) return { error: String(data.error?.message || data.error || full || 'Antigravity no pudo responder'), done: true };
    return { full, done: true };
  }
  // Formato tipo Gemini CLI
  const gemini = parseGeminiLine(text);
  if (gemini) return gemini;
  // Trozos de texto en un step_update (si los trae)
  const step = data.step && typeof data.step === 'object' ? data.step : data;
  const delta = pickText(step, ['delta', 'text_delta', 'textDelta']);
  if (delta) return { delta };
  return null;
}

/** La línea "AGY_ERROR {...}" que agy escribe en stderr cuando falla. */
function parseAgyError(stderr) {
  const match = /AGY_ERROR\s+(\{.*\})/.exec(String(stderr || ''));
  if (!match) return '';
  const data = parseJson(match[1]);
  return String(data?.message || data?.error || '').trim();
}

module.exports = { parseClaudeLine, parseGeminiLine, parseAgyLine, parseAgyError };
