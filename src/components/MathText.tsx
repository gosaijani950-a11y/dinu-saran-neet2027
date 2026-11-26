import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';

interface MathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'inline' | 'block' | 'chem';
  value: string;
}

function tokenizeMath(input: string): Segment[] {
  if (!input) return [];
  // Matches $$...$$, $...$, or bare \ce{...}
  const regex = /(\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\n])+\$|\\ce\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({ type: 'block', value: token.slice(2, -2).trim() });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      segments.push({ type: 'inline', value: token.slice(1, -1).trim() });
    } else if (token.startsWith('\\ce{')) {
      segments.push({ type: 'chem', value: token });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return segments;
}

function renderKatex(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return expr;
  }
}

export const MathText: React.FC<MathTextProps> = React.memo(({ text, className = '' }) => {
  const segments = useMemo(() => tokenizeMath(text || ''), [text]);

  return (
    <span className={`font-hindi whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
        }
        const html = renderKatex(seg.value, seg.type === 'block');
        if (seg.type === 'block') {
          return (
            <span
              key={idx}
              className="block my-2 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return (
          <span
            key={idx}
            className="inline-block align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
});

MathText.displayName = 'MathText';
