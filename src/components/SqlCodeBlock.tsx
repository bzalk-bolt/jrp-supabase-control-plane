import { Highlight, themes } from 'prism-react-renderer';

interface SqlCodeBlockProps {
  code: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

export default function SqlCodeBlock({ code, maxHeight = '400px', showLineNumbers = true }: SqlCodeBlockProps) {
  return (
    <Highlight theme={themes.nightOwl} code={code.trim()} language="sql">
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre
          className="text-[12px] font-mono leading-relaxed overflow-auto rounded-lg bg-[#011627] p-4"
          style={{ maxHeight }}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })} className="flex hover:bg-white/5 transition-colors">
              {showLineNumbers && (
                <span className="select-none text-gray-600 text-right pr-4 w-10 shrink-0 inline-block">
                  {i + 1}
                </span>
              )}
              <span className="flex-1">
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
