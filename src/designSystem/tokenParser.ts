import tokensCssRaw from '../styles/tokens.css?raw';
import indexCssRaw from '../index.css?raw';

export interface ParsedCssToken {
  name: string;
  rawValue: string;
  resolvedValue: string;
  group: string;
  tier: 'primitive' | 'semantic' | 'spatial';
}

export interface ParsedCssClassSpec {
  selector: string;
  roleComment?: string;
  declarations: Record<string, string>;
}

const SECTION_IGNORE_PATTERNS = [/RGB Channels/i];

function stripCssComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

/**
 * Recursively resolves `var(--foo)` expressions against the parsed variable map
 * so semantic tokens display their live underlying colour/hex straight from tokens.css.
 */
function resolveCssValue(value: string, allVars: Map<string, string>, depth = 0): string {
  if (depth > 8 || !value.includes('var(')) return value.trim();
  return value
    .replace(/var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)/gi, (_m, varName: string, fallback?: string) => {
      const target = allVars.get(varName);
      if (target) return resolveCssValue(target, allVars, depth + 1);
      return fallback ? fallback.trim() : varName;
    })
    .trim();
}

/**
 * Extracts all Tier-1 primitives (`--palette-*`) and Tier-2 semantic tokens (`--color-*`)
 * directly from `src/styles/tokens.css` so any edit in CSS reflects everywhere immediately.
 */
export function parseDesignTokens(): {
  primitives: ParsedCssToken[];
  semanticGroups: { group: string; tokens: ParsedCssToken[] }[];
  spatialTokens: ParsedCssToken[];
  wkAliases: ParsedCssToken[];
} {
  const rawVarMap = new Map<string, string>();
  const varMatches = tokensCssRaw.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi);
  for (const m of varMatches) {
    rawVarMap.set(m[1], m[2].trim());
  }

  // Also grab :root / .wk alias variables from src/index.css (--wk-bg, --wk-card, etc.)
  const wkSectionMatch = indexCssRaw.match(/\.wk\s*\{([\s\S]*?)\}/);
  if (wkSectionMatch) {
    for (const m of wkSectionMatch[1].matchAll(/(--wk-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      rawVarMap.set(m[1], m[2].trim());
    }
  }

  const rootBodyMatch = tokensCssRaw.match(/:root\s*\{([\s\S]*)\}/);
  const rootBody = rootBodyMatch ? rootBodyMatch[1] : tokensCssRaw;

  const primitives: ParsedCssToken[] = [];
  const spatialTokens: ParsedCssToken[] = [];
  const semanticGroupsMap = new Map<string, ParsedCssToken[]>();
  let currentGroup = 'Core Primitives';

  for (const line of rootBody.split(/\r?\n/)) {
    const trimmed = line.trim();
    const commentOnly = trimmed.match(/^\/\*\s*([^*][\s\S]*?)\s*\*\/$/);
    if (commentOnly) {
      const text = commentOnly[1].replace(/^-+|\*+/g, '').trim();
      if (text && !text.startsWith('Tier 1') && !text.startsWith('Tier 2')) {
        currentGroup = text.replace(/\s*\([^)]*\)\s*/g, '').trim();
      }
      continue;
    }

    const decl = trimmed.match(/^(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (!decl) continue;
    const [, name, rawVal] = decl;
    const resolvedValue = resolveCssValue(rawVal, rawVarMap);

    if (name.startsWith('--palette-')) {
      primitives.push({
        name,
        rawValue: rawVal,
        resolvedValue,
        group: currentGroup,
        tier: 'primitive',
      });
    } else if (name.startsWith('--space-') || name.startsWith('--radius-')) {
      spatialTokens.push({
        name,
        rawValue: rawVal,
        resolvedValue,
        group: '4px Spatial & Radius Scale',
        tier: 'spatial',
      });
    } else if (name.startsWith('--color-') && !SECTION_IGNORE_PATTERNS.some((p) => p.test(currentGroup))) {
      const groupName = currentGroup || 'Semantic';
      const bucket = semanticGroupsMap.get(groupName) ?? [];
      bucket.push({
        name,
        rawValue: rawVal,
        resolvedValue,
        group: groupName,
        tier: 'semantic',
      });
      semanticGroupsMap.set(groupName, bucket);
    }
  }

  const wkAliases: ParsedCssToken[] = [];
  if (wkSectionMatch) {
    for (const m of wkSectionMatch[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const name = m[1];
      if (!name.startsWith('--wk-')) continue;
      wkAliases.push({
        name,
        rawValue: m[2].trim(),
        resolvedValue: resolveCssValue(m[2].trim(), rawVarMap),
        group: 'Workout Scale Aliases (.wk)',
        tier: 'semantic',
      });
    }
  }

  const semanticGroups = Array.from(semanticGroupsMap.entries()).map(([group, tokens]) => ({
    group,
    tokens,
  }));

  return { primitives, semanticGroups, spatialTokens, wkAliases };
}

/**
 * Extracts exact CSS rule declarations for `.wk-*` design system classes from `src/index.css`.
 */
export function parseWkCssSpecs(selectors: string[]): ParsedCssClassSpec[] {
  const out: ParsedCssClassSpec[] = [];
  for (const sel of selectors) {
    const escaped = sel
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/,\s*/g, ',\\s*');
    const regex = new RegExp(
      `(?:\\/\\*\\s*((?:(?!\\*\\/)[\\s\\S])*?)\\s*\\*\\/\\s*)?^\\s*${escaped}\\s*\\{([^}]*)\\}`,
      'm'
    );
    const match = indexCssRaw.match(regex);
    if (!match) continue;
    const roleComment = match[1] ? stripCssComments(match[1]).replace(/\s+/g, ' ').trim() : undefined;
    const declarations: Record<string, string> = {};
    const cleanBody = stripCssComments(match[2]);
    for (const line of cleanBody.split(';')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const prop = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (prop && val) declarations[prop] = val;
    }
    out.push({ selector: sel, roleComment, declarations });
  }
  return out;
}
