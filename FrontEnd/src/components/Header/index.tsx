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
      className="w-full fixed top-0 left-0 right-0 z-50 bg-black h-[63px] flex items-center justify-between px-6 gap-6 flex-shrink-0"
    >
      <div className="flex items-center">
        {showBackButton && (
          <button 
            className="mr-3 p-1 hover:bg-gray-700 rounded-full transition-colors" 
            aria-label="Back"
            onClick={handleBackClick}
          >
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <span className="text-xs sm:text-sm font-medium text-white">{title}</span>
      </div>
      {rightContent && (
        <div className="flex items-center">
          {rightContent}
        </div>
      )}
    </div>
  );
};

export default Header;
