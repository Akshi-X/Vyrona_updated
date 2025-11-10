import React from 'react';

export default function renderMessageWithMentions(text: string): React.ReactNode {
  if (!text) return text;

  const mentionPattern = /(@[a-zA-Z0-9_-]+(?:\s+[A-Z][a-zA-Z0-9_-]*)?)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchCount = 0;

  mentionPattern.lastIndex = 0;

  while ((match = mentionPattern.exec(text)) !== null) {
    const matchEnd = match.index + match[0].length;
    const charAfterMatch = text[matchEnd];

    let mentionText = match[0];
    let actualEndIndex = matchEnd;

    if (charAfterMatch === ' ') {
      const charAfterSpace = text[matchEnd + 1];
      if (charAfterSpace && /[a-z0-9]/.test(charAfterSpace)) {
        mentionText = match[0].trim();
        actualEndIndex = match.index + mentionText.length;
      }
    }

    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText.length > 0) {
        parts.push(
          <span key={`text-before-${match.index}`} style={{ color: '#000000' }}>
            {beforeText}
          </span>
        );
      }
    }

    parts.push(
      <span key={`mention-${match.index}`} style={{ color: '#8d2b8f', fontWeight: 500 }}>
        {mentionText}
      </span>
    );

    lastIndex = actualEndIndex;
    matchCount++;
  }

  if (lastIndex < text.length) {
    const afterText = text.substring(lastIndex);
    if (afterText.length > 0) {
      parts.push(
        <span key={`text-after-${lastIndex}`} style={{ color: '#000000' }}>
          {afterText}
        </span>
      );
    }
  }

  if (matchCount === 0) {
    return <span style={{ color: '#000000' }}>{text}</span>;
  }

  return <>{parts}</>;
}


