import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLORS } from '../../constants/colors';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  showBackButton = true, 
  onBackClick,
  rightContent 
}) => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1); // Go back to previous page
    }
  };

  return (
    <div 
      className="w-full fixed top-0 left-0 right-0 z-50" 
      style={{ backgroundColor: COLORS.primary.purple }}
    >
      <div className="px-4 sm:px-6 lg:px-10 py-3">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center">
            {showBackButton && (
              <button 
                className="mr-2 hover:opacity-90" 
                aria-label="Back"
                onClick={handleBackClick}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-xs sm:text-sm font-medium">{title}</span>
          </div>
          {rightContent && (
            <div className="flex items-center">
              {rightContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
