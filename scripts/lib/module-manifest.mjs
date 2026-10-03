import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DELIVERY_STRATEGIES = Object.freeze(['critical', 'deferred', 'external']);

const PARAM_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'url', 'enum', 'array', 'object']);
const MANIFEST_FIELDS = new Set(['name', 'type', 'description', 'params', 'delivery', 'assets']);
const ASSET_FIELDS = new Set(['source', 'delivery', 'output']);
const RESERVED_PARAM_FIELDS = new Set(['module', 'id', 'align', 'delivery', 'legacyZone']);
const DELIVERY_RANK = Object.freeze({ critical: 0, deferred: 1, external: 2 });

function syntaxError(manifestPath, message) {
  return new Error(`${manifestPath}: ${message}`);
}

function tokenize(source, manifestPath) {
  const tokens = [];
  let index = 0;
  const punct = new Set(['.', '{', '}', '[', ']', '=', ',', '(', ')']);
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) break;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) throw syntaxError(manifestPath, 'unterminated block comment');
      index = end + 2;
    } else if (char === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < source.length) {
        if (!escaped && source[end] === '"') break;
        escaped = !escaped && source[end] === '\\';
        if (source[end] !== '\\') escaped = false;
        end += 1;
      }
      if (end === source.length) throw syntaxError(manifestPath, 'unterminated string');
      try {
        tokens.push({ kind: 'string', value: JSON.parse(source.slice(index, end + 1)) });
      } catch {
        throw syntaxError(manifestPath, 'invalid string');
      }
      index = end + 1;
    } else if (punct.has(char)) {
      tokens.push({ kind: char, value: char });
      index += 1;
    } else {
      const match = source.slice(index).match(/^-?(?:\d+\.\d+|\d+)|^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) throw syntaxError(manifestPath, `unexpected character ${JSON.stringify(char)}`);
      const value = match[0];
      tokens.push({
        kind: /^-?\d/.test(value) ? 'number' : 'identifier',
        value: /^-?\d/.test(value) ? Number(value) : value,
      });
      index += value.length;
    }
  }
  return tokens;
}

function parseTokens(tokens, manifestPath) {
  let position = 0;
  const peek = () => tokens[position];
  const take = kind => {
    const token = tokens[position];
    if (!token || token.kind !== kind) {
      throw syntaxError(manifestPath, `expected ${kind}, found ${token?.kind ?? 'end of input'}`);
    }
    position += 1;
    return token;
  };

  const parseRecord = (endKind = '}') => {
    const record = {};
    while (peek() && peek().kind !== endKind) {
      take('.');
      const key = take('identifier').value;
      take('=');
      record[key] = parseValue();
      if (peek()?.kind === ',') position += 1;
      else if (endKind === 'end' && !peek()) break;
      else if (peek()?.kind !== endKind) throw syntaxError(manifestPath, 'expected comma between record fields');
    }
    if (endKind !== 'end') take(endKind);
    return record;
  };

  const parseArray = () => {
    const values = [];
    take('[');
    while (peek() && peek().kind !== ']') {
      values.push(parseValue());
      if (peek()?.kind === ',') position += 1;
      else if (peek()?.kind !== ']') throw syntaxError(manifestPath, 'expected comma between array values');
    }
    take(']');
    return values;
  };

  const parseValue = () => {
    const token = peek();
    if (!token) throw syntaxError(manifestPath, 'expected value, found end of input');
    if (token.kind === 'string' || token.kind === 'number') {
      position += 1;
      return token.value;
    }
    if (token.kind === '[') return parseArray();
    if (token.kind === '{') {
      position += 1;
      return parseRecord();
    }
    if (token.kind === '.') {
      position += 1;
      if (peek()?.kind === '{') {
        position += 1;
        return parseRecord();
      }
      const functionName = take('identifier').value;
      take('(');
      const value = parseValue();
      take(')');
      if (functionName === 'date') return value;
      throw syntaxError(manifestPath, `unsupported Zig expression .${functionName}(...)`);
    }
    if (token.kind === 'identifier') {
      position += 1;
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (token.value === 'null') return null;
    }
    throw syntaxError(manifestPath, `expected value, found ${token.kind}`);
  };

  let record;
  if (peek()?.kind === '.' && tokens[position + 1]?.kind === '{') {
    position += 2;
    record = parseRecord();
  } else {
    record = parseRecord('end');
  }
  if (position !== tokens.length) throw syntaxError(manifestPath, 'unexpected trailing input');
  return record;
}

export function parseZigRecord(source, manifestPath = '<manifest>') {
  return parseTokens(tokenize(source, manifestPath), manifestPath);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBounds(schema, value, path) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw new Error(`${path}: must be at least ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw new Error(`${path}: must be at most ${schema.maximum}`);
  }
}

function normalizeParamSchema(schema, path) {
  if (!isPlainObject(schema)) throw new Error(`${path}: parameter schema must be a record`);
  const type = schema.type;
  if (!PARAM_TYPES.has(type)) throw new Error(`${path}.type: expected a supported parameter type`);
  if (schema.required !== undefined && typeof schema.required !== 'boolean') {
    throw new Error(`${path}.required: expected boolean`);
  }
  for (const bound of ['minimum', 'maximum']) {
    if (schema[bound] !== undefined && (typeof schema[bound] !== 'number' || !Number.isFinite(schema[bound]))) {
      throw new Error(`${path}.${bound}: expected number`);
    }
  }
  if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) {
    throw new Error(`${path}: minimum must not exceed maximum`);
  }
  const normalized = { ...schema };
  if (type === 'enum') {
    if (!Array.isArray(schema.values) || schema.values.length === 0) {
      throw new Error(`${path}.values: enum requires at least one value`);
    }
  }
  if (type === 'array' && schema.items !== undefined) {
    normalized.items = normalizeParamSchema(schema.items, `${path}.items`);
  }
  if (type === 'object') {
    if (schema.properties !== undefined && !isPlainObject(schema.properties)) {
      throw new Error(`${path}.properties: expected record`);
    }
    normalized.properties = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, child]) => [
      name,
      normalizeParamSchema(child, `${path}.properties.${name}`),
    ]));
  }
  if (Object.hasOwn(schema, 'default')) validateParamValue(normalized, schema.default, `${path}.default`);
  return normalized;
}

function rejectUnknownParams(schemas, params, path, moduleName) {
  for (const name of Object.keys(params)) {
    if (RESERVED_PARAM_FIELDS.has(name)) {
      throw new Error(`${path}.${name}: reserved instance field`);
    }
    if (!Object.hasOwn(schemas, name)) {
      throw new Error(`${path}.${name}: unknown parameter for module "${moduleName}"`);
    }
  }
}

function validateParamValue(schema, value, path) {
  if (value === undefined) {
    if (schema.required) throw new Error(`${path}: required parameter`);
    return undefined;
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') throw new Error(`${path}: expected string`);
      break;
    case 'integer':
      if (!Number.isInteger(value)) throw new Error(`${path}: expected integer`);
      validateBounds(schema, value, path);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path}: expected number`);
      validateBounds(schema, value, path);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${path}: expected boolean`);
      break;
    case 'url':
      if (typeof value !== 'string') throw new Error(`${path}: expected URL string`);
      try {
        new URL(value);
      } catch {
        throw new Error(`${path}: expected valid URL`);
      }
      break;
    case 'enum':
      if (!schema.values.includes(value)) throw new Error(`${path}: expected one of ${schema.values.join(', ')}`);
      break;
    case 'array':
      if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
      return schema.items === undefined ? value : value.map((item, index) =>
        validateParamValue(schema.items, item, `${path}[${index}]`));
    case 'object':
      if (!isPlainObject(value)) throw new Error(`${path}: expected object`);
      rejectUnknownParams(schema.properties ?? {}, value, path, 'object');
      return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, child]) => [
        name,
        validateParamValue(child, Object.hasOwn(value, name) ? value[name] : child.default, `${path}.${name}`),
      ]));
    default:
      throw new Error(`${path}: unsupported parameter type`);
  }
  return value;
}

export function validateModuleParams(manifest, params = {}, path) {
  if (!isPlainObject(params)) throw new Error(`${path}: expected params object`);
  const schemas = manifest.params ?? {};
  rejectUnknownParams(schemas, params, path, manifest.name);
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => {
    try {
      return [name, validateParamValue(schema, Object.hasOwn(params, name) ? params[name] : schema.default, `${path}.${name}`)];
    } catch (error) {
      if (error.message.endsWith(': required parameter')) {
        throw new Error(`${path}.${name}: required parameter for module "${manifest.name}"`);
      }
      throw error;
    }
  }));
}

export function normalizeManifestRecord(record, manifestPath) {
  if (!isPlainObject(record)) throw syntaxError(manifestPath, 'manifest must be a record');
  if (typeof record.name !== 'string' || record.name === '') throw syntaxError(manifestPath, '.name missing in module.ziggy');
  for (const field of Object.keys(record)) {
    if (!MANIFEST_FIELDS.has(field)) throw syntaxError(manifestPath, `unknown manifest field ${field}`);
  }
  if (record.type !== undefined && typeof record.type !== 'string') throw syntaxError(manifestPath, 'type: expected string');
  if (record.description !== undefined && typeof record.description !== 'string') {
    throw syntaxError(manifestPath, 'description: expected string');
  }
  const delivery = record.delivery ?? 'critical';
  if (!DELIVERY_STRATEGIES.includes(delivery)) {
    throw syntaxError(manifestPath, 'delivery: expected one of critical, deferred, external');
  }
  if (record.assets !== undefined && !Array.isArray(record.assets)) {
    throw syntaxError(manifestPath, 'assets: expected array');
  }
  const assets = (record.assets ?? []).map((asset, index) => {
    const path = `assets[${index}]`;
    const legacyPath = typeof asset === 'string';
    const definition = legacyPath ? { source: asset } : asset;
    if (!isPlainObject(definition)) throw syntaxError(manifestPath, `${path}: expected asset record`);
    for (const field of Object.keys(definition)) {
      if (!ASSET_FIELDS.has(field)) throw syntaxError(manifestPath, `${path}: unknown asset field ${field}`);
    }
    if (typeof definition.source !== 'string' || definition.source === '') {
      throw syntaxError(manifestPath, `${path}.source: expected string`);
    }
    const source = definition.source;
    const remote = /^[a-z][a-z0-9+.-]*:/i.test(source);
    if (remote && !source.startsWith('https://')) {
      throw syntaxError(manifestPath, `${path}.source: remote URL must use HTTPS`);
    }
    if (!remote && (source.startsWith('/') || source.split('/').includes('..'))) {
      throw syntaxError(manifestPath, `${path}.source: expected module-relative local path`);
    }
    if (!remote && !existsSync(join(dirname(manifestPath), source))) {
      throw syntaxError(manifestPath, `${path}${legacyPath ? '' : '.source'}: local asset "${source}" not found`);
    }
    const assetDelivery = definition.delivery ?? delivery;
    if (!DELIVERY_STRATEGIES.includes(assetDelivery)) {
      throw syntaxError(manifestPath, `${path}.delivery: expected one of critical, deferred, external`);
    }
    if (DELIVERY_RANK[assetDelivery] < DELIVERY_RANK[delivery]) {
      throw syntaxError(manifestPath, `${path}.delivery: cannot be more critical than module delivery`);
    }
    if (remote && assetDelivery !== 'external') {
      throw syntaxError(manifestPath, `${path}.delivery: remote assets must use external delivery`);
    }
    const output = definition.output;
    if (output !== undefined && (typeof output !== 'string' || !output.startsWith('/') || output.startsWith('//') || output.split('/').includes('..'))) {
      throw syntaxError(manifestPath, `${path}.output: expected an absolute output path`);
    }
    if (!remote && assetDelivery !== 'critical' && output === undefined) {
      throw syntaxError(manifestPath, `${path}.output: required for non-critical local asset`);
    }
    if (remote && output !== undefined) {
      throw syntaxError(manifestPath, `${path}.output: remote assets must not declare output`);
    }
    return { source, delivery: assetDelivery, ...(output === undefined ? {} : { output }) };
  });
  if (record.params !== undefined && !isPlainObject(record.params)) {
    throw syntaxError(manifestPath, 'params: expected record');
  }
  const params = Object.fromEntries(Object.entries(record.params ?? {}).map(([name, schema]) => {
    if (RESERVED_PARAM_FIELDS.has(name)) {
      throw syntaxError(manifestPath, `params.${name}: reserved instance field`);
    }
    return [name, normalizeParamSchema(schema, `${manifestPath}: params.${name}`)];
  }));
  const manifest = {
    name: record.name,
    type: record.type ?? 'builtin',
    description: record.description ?? '',
    params,
    delivery,
    assets,
  };
  Object.defineProperty(manifest, 'legacyParams', {
    value: !Object.hasOwn(record, 'params'),
    enumerable: false,
  });
  return manifest;
}

export function parseModuleManifest(source, manifestPath) {
  const record = parseZigRecord(source, manifestPath);
  return normalizeManifestRecord(record, manifestPath);
}
