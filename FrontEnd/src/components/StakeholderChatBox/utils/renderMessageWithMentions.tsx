import React from 'react';

interface User {
  user_id: string;
  first_name: string;
  last_name: string;
}

export default function renderMessageWithMentions(text: string, users: User[] = []): React.ReactNode {
  if (!text) return text;

  // Pattern to match mentions: @word or @word word word... (handles multiple words)
  // Matches @ followed by one or more words (alphanumeric sequences separated by spaces)
  // Stops when encountering non-word characters or end of string
  const mentionPattern = /@[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchCount = 0;

  // Helper function to check if a mention matches a valid user
  const isValidMention = (mentionText: string): boolean => {
    if (!users || users.length === 0) {
      return false; // No users available, don't highlight any mentions
    }
    
    // Remove @ symbol and trim
    const namePart = mentionText.substring(1).trim();
    if (!namePart) return false;
    
    // Check if it matches any user's name
    return users.some(user => {
      const fullName = `${user.first_name} ${user.last_name}`;
      const firstName = user.first_name;
      
      // Case-insensitive comparison
      const nameLower = namePart.toLowerCase();
      const fullNameLower = fullName.toLowerCase();
      const firstNameLower = firstName.toLowerCase();
      
      // Match full name or first name
      return nameLower === fullNameLower || nameLower === firstNameLower;
    });
  };

  // Helper function to extend mention match to match user's full name
  const extendMentionMatch = (startIndex: number, initialMatch: string, text: string, users: User[]): { mentionText: string; endIndex: number } => {
    let mentionText = initialMatch;
    let endIndex = startIndex + initialMatch.length;
    
    // Try to extend the match by looking ahead for more words
    // Continue extending as long as adding more words matches a user's full name
    while (endIndex < text.length && text[endIndex] === ' ') {
      // Skip the space
      let nextWordStart = endIndex + 1;
      
      // Find the next word
      let nextWordEnd = nextWordStart;
      while (nextWordEnd < text.length && /[a-zA-Z0-9_-]/.test(text[nextWordEnd])) {
        nextWordEnd++;
      }
      
      if (nextWordEnd > nextWordStart) {
        // We found another word, try extending the mention
        const extendedText = text.substring(startIndex, nextWordEnd);
        const extendedNamePart = extendedText.substring(1).trim();
        
        // Check if this extended mention matches any user's full name
        const matchesUser = users.some(user => {
          const fullName = `${user.first_name} ${user.last_name}`;
          return extendedNamePart.toLowerCase() === fullName.toLowerCase();
        });
        
        if (matchesUser) {
          // Extend the match
          mentionText = extendedText;
          endIndex = nextWordEnd;
        } else {
          // No match, stop extending
          break;
        }
      } else {
        // No more words found
        break;
      }
    }
    
    // Trim trailing space
    if (mentionText.endsWith(' ')) {
      mentionText = mentionText.trimEnd();
      endIndex = startIndex + mentionText.length;
    }
    
    return { mentionText, endIndex };
  };

  mentionPattern.lastIndex = 0;

  while ((match = mentionPattern.exec(text)) !== null) {
    const matchStart = match.index;
    const initialMatch = match[0];
    
    // Try to extend the match to include full names with multiple words
    const { mentionText, endIndex: actualEndIndex } = extendMentionMatch(matchStart, initialMatch, text, users);

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

    // Check if this mention matches a valid user
    if (isValidMention(mentionText)) {
      parts.push(
        <span key={`mention-${match.index}`} style={{ color: '#8d2b8f', fontWeight: 500 }}>
          {mentionText}
        </span>
      );
    } else {
      // Not a valid mention - render as regular text
      parts.push(
        <span key={`text-${match.index}`} style={{ color: '#000000' }}>
          {mentionText}
        </span>
      );
    }

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


