import { Linking, Text, View } from 'react-native';

/** Inline: **bold**, *italic*, [text](url). Enough for the CMS pages the admin writes. */
function Inline({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(
        <Text key={i++} className="font-bold">
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      const url = tok.slice(tok.indexOf('](') + 2, -1);
      parts.push(
        <Text
          key={i++}
          className="font-semibold text-primary underline"
          onPress={() => void Linking.openURL(url)}
        >
          {label}
        </Text>,
      );
    } else {
      parts.push(
        <Text key={i++} className="italic">
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Text className={className}>{parts}</Text>;
}

/** Minimal markdown renderer: headings, bullet and numbered lists, paragraphs. */
export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <View className="gap-3">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim());
        if (!lines.length) return null;
        const first = lines[0] ?? '';
        const heading = first.match(/^(#{1,4})\s+(.*)$/);
        if (heading && lines.length === 1) {
          const level = heading[1]?.length ?? 1;
          return (
            <Text
              key={bi}
              accessibilityRole="header"
              className={
                level === 1
                  ? 'mt-2 text-2xl font-extrabold text-foreground'
                  : level === 2
                    ? 'mt-2 text-xl font-bold text-foreground'
                    : 'mt-1 text-base font-bold text-foreground'
              }
            >
              {heading[2]}
            </Text>
          );
        }
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          return (
            <View key={bi} className="gap-1.5">
              {lines.map((l, li) => {
                const numbered = l.match(/^\s*(\d+)\.\s+(.*)$/);
                const text = numbered ? (numbered[2] ?? '') : l.replace(/^\s*[-*]\s+/, '');
                return (
                  <View key={li} className="flex-row gap-2">
                    <Text className="text-foreground">{numbered ? `${numbered[1]}.` : '•'}</Text>
                    <Inline text={text} className="flex-1 text-sm leading-5 text-foreground" />
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <Inline
            key={bi}
            text={lines.join(' ')}
            className="text-sm leading-5 text-muted-foreground"
          />
        );
      })}
    </View>
  );
}
