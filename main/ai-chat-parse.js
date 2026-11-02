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
  if (data.type === 'init') {
    return typeof data.model === 'string' && data.model && data.model !== 'auto' ? { model: data.model } : null;
  }
  if (data.type === 'message' && data.role === 'assistant' && typeof data.content === 'string') {
    return data.delta ? { delta: data.content } : { full: data.content.replace(/\r?\n$/, ''), partial: true };
  }
  if (data.type === 'error') {
    const message = data.message || data.error?.message;
    return data.severity === 'warning' ? null : { error: String(message || 'Gemini dio un error') };
  }
  if (data.type === 'result') {
    if (data.status === 'error' || data.error) {
      return { error: String(data.error?.message || data.error || 'Gemini no pudo responder'), done: true };
    }
    const models = data.stats?.models && typeof data.stats.models === 'object' ? Object.keys(data.stats.models) : [];
    const realModel = models.find((name) => name && name !== 'auto');
    const full = typeof data.response === 'string' ? data.response.replace(/\r?\n$/, '') : undefined;
    return { full: full || undefined, ...(realModel ? { model: realModel } : {}), done: true };
  }
  return null;
}

/** El primer texto no vacío que encontremos en estos campos. */
function pickText(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string' && object[key].length > 0) return object[key];
  }
  return undefined;
}

/**
 * Una línea de `agy --output-format stream-json -p=...`.
 * Antigravity escribe líneas JSON con `"event"`:
 *   • {"event":"init","init":{...}}
 *   • {"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"..."}}
 *   • {"event":"result","result":{"status":"SUCCESS"|"ERROR","response":"...","error":"..."}}
 * Seguimos aceptando también `"type"` o salida en texto plano por si cambia entre versiones.
 */
function parseAgyLine(line) {
  const text = String(line || '');
  const data = parseJson(text);
  if (!data) return text.trim() ? { delta: `${text.replace(/\r$/, '')}\n`, plain: true } : null;

  const kind = data.event || data.type;
  if (kind === 'init') {
    const initObj = data.init && typeof data.init === 'object' ? data.init : data;
    const model = pickText(initObj, ['model', 'model_name', 'modelName']) || pickText(data, ['model', 'model_name', 'modelName']);
    return model && model !== 'auto' ? { model } : null;
  }

  if (kind === 'error') {
    const errObj = data.error && typeof data.error === 'object' ? data.error : data;
    const message = pickText(errObj, ['message', 'error']) || (typeof data.error === 'string' ? data.error : '');
    return data.severity === 'warning' ? null : { error: String(message || 'Antigravity dio un error') };
  }

  if (kind === 'result') {
    const res = data.result && typeof data.result === 'object' ? data.result : data;
    const status = String(res.status ?? data.status ?? '').toLowerCase();
    const reason = String(res.finished_reason ?? data.finished_reason ?? '').toLowerCase();
    const rawError = res.error ?? data.error;
    const failed =
      res.is_error === true ||
      data.is_error === true ||
      status === 'error' ||
      status === 'failed' ||
      reason === 'error' ||
      Boolean(rawError);
    const rawFull =
      pickText(res, ['response', 'result', 'text', 'content', 'output']) ??
      pickText(data, ['result', 'response', 'text', 'content', 'output']);
    const full = typeof rawFull === 'string' ? rawFull.replace(/\r?\n$/, '') : undefined;
    const model = pickText(res, ['model', 'model_name', 'modelName']) || pickText(res.usage, ['model', 'model_name']);
    if (failed) {
      const errMessage = (typeof rawError === 'object' ? rawError?.message : rawError) || full || 'Antigravity no pudo responder';
      return { error: String(errMessage), done: true };
    }
    return { full: full || undefined, ...(model ? { model } : {}), done: true };
  }

  if (kind === 'step_update' || data.step_update || data.step) {
    const step =
      (data.step_update && typeof data.step_update === 'object' && data.step_update) ||
      (data.step && typeof data.step === 'object' && data.step) ||
      data;
    // Ignorar pasos que no sean la respuesta al usuario (p. ej. user_input o pensamientos internos)
    if (
      typeof step.step_type === 'string' &&
      step.step_type !== 'agent_response' &&
      step.step_type !== 'assistant_response' &&
      step.step_type !== 'text'
    ) {
      return null;
    }
    const delta = pickText(step, ['text_delta', 'delta', 'textDelta']);
    if (!delta) return null;
    // Al cerrar el paso (DONE), agy añade un "\n" suelto final: lo omitimos para no dar un salto vacío
    if (String(step.state || '').toUpperCase() === 'DONE' && /^\r?\n$/.test(delta)) return null;
    return { delta };
  }

  // Respaldo por si agy adopta el esquema de Gemini CLI
  return parseGeminiLine(text);
}

/** La línea "AGY_ERROR: {...}" (con o sin los dos puntos) que agy escribe en stderr cuando falla. */
function parseAgyError(stderr) {
  const match = /AGY_ERROR:?\s*(\{.*\})/.exec(String(stderr || ''));
  if (!match) return '';
  const data = parseJson(match[1]);
  return String(data?.message || data?.short_error || data?.error || '').trim();
}

module.exports = { parseClaudeLine, parseGeminiLine, parseAgyLine, parseAgyError };
