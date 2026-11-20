import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A small, dependency-free Markdown renderer for assistant answers.
 *
 * It builds React elements directly and never uses dangerouslySetInnerHTML, so
 * model output cannot inject markup or script. Only http(s) links become
 * anchors, and they open with rel="noopener noreferrer".
 *
 * Supported: ATX headings, fenced code blocks, unordered/ordered lists,
 * blockquotes, horizontal rules, tables, bold, italic, inline code and links.
 */

// --------------------------------------------------------------- inline

const INLINE_SOURCE =
  '(`[^`]+`)|(\\*\\*[^*]+\\*\\*)|(__[^_]+__)|(\\*[^*\\n]+\\*)|(_[^_\\n]+_)|(\\[[^\\]]+\\]\\([^)\\s]+\\))';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(INLINE_SOURCE, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-[rgb(var(--ss-border)/0.6)] px-1.5 py-0.5 font-mono text-[0.85em] text-[rgb(var(--ss-text))]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-semibold text-[rgb(var(--ss-text))]">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(
        <em key={key} className="italic">
          {renderInline(token.slice(1, -1), key)}
        </em>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1];
      const href = linkMatch?.[2];
      if (label && href && /^https?:\/\//i.test(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label ?? token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// ------------------------------------------------------- code highlighting

const KEYWORDS = new Set([
  'if', 'else', 'elif', 'for', 'while', 'return', 'function', 'const', 'let',
  'var', 'class', 'import', 'from', 'export', 'new', 'try', 'catch', 'throw',
  'await', 'async', 'def', 'print', 'lambda', 'with', 'as', 'in', 'not', 'and',
  'or', 'None', 'True', 'False', 'null', 'true', 'false', 'public', 'private',
  'static', 'void', 'int', 'float', 'double', 'string', 'char', 'bool', 'struct',
  'enum', 'switch', 'case', 'break', 'continue', 'do', 'using', 'namespace',
  'package', 'interface', 'extends', 'implements', 'this', 'self', 'yield',
  'raise', 'except', 'finally', 'pass', 'global', 'assert', 'del', 'select',
  'where', 'join', 'group', 'order', 'by', 'sum', 'count', 'end', 'begin',
]);

const TOKEN_SOURCE =
  '(#[^\\n]*|//[^\\n]*|/\\*[\\s\\S]*?\\*/)|("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)|\\b(\\d+\\.?\\d*)\\b|\\b([A-Za-z_$][A-Za-z0-9_$]*)\\b';

/** Colours comments, strings, numbers and keywords. Not a full parser. */
function highlight(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(TOKEN_SOURCE, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = pattern.exec(code)) !== null) {
    if (match.index > lastIndex) nodes.push(code.slice(lastIndex, match.index));
    const [token, comment, str, num, ident] = match;
    const key = `t${counter++}`;

    if (comment) {
      nodes.push(<span key={key} className="italic text-slate-500">{token}</span>);
    } else if (str) {
      nodes.push(<span key={key} className="text-emerald-300">{token}</span>);
    } else if (num) {
      nodes.push(<span key={key} className="text-amber-300">{token}</span>);
    } else if (ident && KEYWORDS.has(ident)) {
      nodes.push(<span key={key} className="text-violet-300">{token}</span>);
    } else {
      nodes.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < code.length) nodes.push(code.slice(lastIndex));
  return nodes;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d1224]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-slate-200">
        <code className="font-mono">{highlight(code)}</code>
      </pre>
    </div>
  );
}

// ----------------------------------------------------------- block parsing

type Block =
  | { kind: 'code'; language: string; code: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'p'; text: string };

const isBlank = (line: string) => /^\s*$/.test(line);
const isFence = (line: string) => /^```/.test(line);
const isHeading = (line: string) => /^#{1,6}\s+/.test(line);
const isQuote = (line: string) => /^>\s?/.test(line);
const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line);

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const language = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code', language, code: body.join('\n') });
      continue;
    }

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }

    if (isQuote(line)) {
      const body: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', text: body.join(' ') });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (isNumbered(line)) {
      const items: string[] = [];
      while (i < lines.length && isNumbered(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isFence(lines[i]) &&
      !isHeading(lines[i]) &&
      !isQuote(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'p', text: para.join(' ') });
  }

  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-4 mb-2 text-lg font-semibold',
  2: 'mt-4 mb-2 text-base font-semibold',
  3: 'mt-3 mb-1.5 text-[15px] font-semibold',
  4: 'mt-3 mb-1 text-sm font-semibold',
  5: 'mt-2 mb-1 text-sm font-medium',
  6: 'mt-2 mb-1 text-sm font-medium',
};

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case 'code':
      return <CodeBlock key={key} code={block.code} language={block.language} />;
    case 'heading': {
      const Tag = `h${Math.min(block.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag key={key} className={cn('text-[rgb(var(--ss-text))]', HEADING_CLASS[block.level])}>
          {renderInline(block.text, key)}
        </Tag>
      );
    }
    case 'ul':
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {block.items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {block.items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-brand-500/60 bg-[rgb(var(--ss-border)/0.25)] px-3 py-2 text-[rgb(var(--ss-text-muted))]"
        >
          {renderInline(block.text, key)}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} className="my-3 border-[rgb(var(--ss-border))]" />;
    case 'table':
      return (
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[rgb(var(--ss-border))]">
                {block.header.map((cell, idx) => (
                  <th key={idx} className="px-2 py-1.5 font-semibold">
                    {renderInline(cell, `${key}-h${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-[rgb(var(--ss-border)/0.6)]">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-2 py-1.5">
                      {renderInline(cell, `${key}-r${rowIdx}c${cellIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'p':
    default:
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {renderInline(block.text, key)}
        </p>
      );
  }
}

export function MarkdownMessage({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed', className)}>
      {blocks.map((block, index) => renderBlock(block, `b${index}`))}
    </div>
  );
}

export function CopyAnswerButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-[rgb(var(--ss-border)/0.5)] hover:text-[rgb(var(--ss-text))]"
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
    >
      {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
