/**
 * v9 (P1-1 fix): SafeMarkdown — render a tiny markdown subset WITHOUT using
 * `dangerouslySetInnerHTML`.
 *
 * The previous AstroAIChat renderer escaped HTML and then re-introduced
 * `<strong>` + `<br/>` via dangerouslySetInnerHTML. The escape was correct,
 * but any future edit (a third token, a markdown library import, an
 * intermediate string transform) could re-open an XSS hole. This component
 * removes the foot-gun by parsing the markdown subset into React nodes
 * directly — there is no string→HTML path at all.
 *
 * Supported syntax:
 *   - **bold**      → <strong>
 *   - *italic*      → <em>
 *   - `code`        → <code>
 *   - newline       → <br/>
 *
 * Anything else renders as plain text. Add tokens here only if you also add
 * tests for them in SafeMarkdown.spec.tsx.
 */

import React from 'react';

type Token = { type: 'text' | 'strong' | 'em' | 'code'; value: string };

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  // Single regex with three groups: **bold**, *italic*, `code`.
  // Greedy-minimal so `**a**b**c**` parses as <b>a</b>b<b>c</b>.
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) tokens.push({ type: 'text', value: line.slice(last, m.index) });
    if (m[1] != null) tokens.push({ type: 'strong', value: m[1] });
    else if (m[2] != null) tokens.push({ type: 'em', value: m[2] });
    else if (m[3] != null) tokens.push({ type: 'code', value: m[3] });
    last = re.lastIndex;
  }
  if (last < line.length) tokens.push({ type: 'text', value: line.slice(last) });
  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix: string): React.ReactNode {
  return tokens.map((t, i) => {
    const k = `${keyPrefix}-${i}`;
    switch (t.type) {
      case 'strong':
        return <strong key={k}>{t.value}</strong>;
      case 'em':
        return <em key={k}>{t.value}</em>;
      case 'code':
        return (
          <code key={k} style={{ background: '#0F245210', padding: '0 4px', borderRadius: 4 }}>
            {t.value}
          </code>
        );
      default:
        return <React.Fragment key={k}>{t.value}</React.Fragment>;
    }
  });
}

export interface SafeMarkdownProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className, style }) => {
  const lines = (text ?? '').split('\n');
  return (
    <span className={className} style={style}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderTokens(tokenize(line), `L${i}`)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </span>
  );
};
