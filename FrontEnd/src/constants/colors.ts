// Color palette for Vyrona project
export const COLORS = {
  // Primary colors
  primary: {
    purple: 'var(--color-primary)',      // Header background
    purpleDark: '#703F99',  // Ticket IDs
    purpleLight: 'var(--color-primary-bg)', // Light purple accent
    blue: '#2563EB',        // Primary blue for buttons
  },
  
  // Base colors
  base: {
    white: '#FFFFFF',       // Pure white
    black: '#000000',       // Pure black
  },
  
  // Text colors
  text: {
    black: '#000000',       // Bold headings, table headers
    gray: {
      dark: '#374151',      // Main text
      medium: '#6B7280',    // Secondary text
      light: '#9CA3AF',     // Placeholder text
    }
  },
  
  // Background colors
  background: {
    light: '#F8F9FA',       // Page background
    white: '#FFFFFF',       // Card backgrounds
    purpleLight: 'var(--color-primary-bg)', // Light purple background accent
    gray: {
      light: '#F3F4F6',     // Disabled inputs
      medium: '#E5E7EB',    // Borders
    }
  },
  
  // Status colors
  status: {
    inProgress: '#DBEAFE',  // Light blue for "In Progress" badges
    completed: '#D1FAE5',   // Light green for "Completed" badges
    underReview: '#FEF3C7', // Light yellow for "Under Review" badges
  },
  
  // Interactive colors
  interactive: {
    hover: {
      blue: '#2563EB',      // Blue button hover
      gray: '#F9FAFB',      // Gray button hover
    },
    focus: {
      blue: '#3B82F6',      // Focus ring color
    }
  },
  
  // Brand palette (exact colors from design)
  brand: {
    white: '#FFFFFF',       // Pure white
    purple: 'var(--color-primary)',      // Deep purple
    purpleLight: 'var(--color-primary-bg)', // Light lavender
    purpleDark: '#703F99',  // Medium purple
    black: '#000000',       // Pure black
  }
} as const;

// Helper function to get color values
export const getColor = (path: string): string => {
  const keys = path.split('.');
  let value: any = COLORS;
  
  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) {
      return '#000000'; // Fallback to black
    }
  }
  
  return value;
};

// Common color combinations
export const COLOR_COMBINATIONS = {
  primaryButton: {
    background: COLORS.primary.blue,
    text: COLORS.background.white,
    hover: COLORS.interactive.hover.blue,
  },
  secondaryButton: {
    background: COLORS.background.white,
    text: COLORS.primary.blue,
    border: COLORS.primary.blue,
    hover: COLORS.interactive.hover.gray,
  },
  disabledInput: {
    background: COLORS.background.gray.light,
    text: COLORS.text.gray.medium,
    border: COLORS.background.gray.medium,
  },
  enabledInput: {
    background: COLORS.background.white,
    text: COLORS.text.black,
    border: COLORS.background.gray.medium,
    focus: COLORS.interactive.focus.blue,
  }
} as const;
